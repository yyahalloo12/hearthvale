import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, Room } from "colyseus.js";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { buildHollow, corruptionBonus, destroyPart, GATE_COUNT, GLOW_AT, pickGates, reachableFrom } from "../../shared/hollow";
import { addItem, BAG_SIZE, countItem, findStation, resourceAt } from "../../shared/items";
import { isWalkable } from "../../shared/map";
import { findPath } from "../../shared/pathfinding";
import { Msg, ROOM_OF, ZONE_ERROR } from "../../shared/protocol";
import { MONSTERS } from "../../shared/stats";
import { loadBundles, loadCharacter } from "../src/db";
import { SPAWNS } from "../src/game/monsters";
import { WorldRoom } from "../src/rooms/WorldRoom";

process.env.HV_DB = ":memory:";
const PORT = 25671;
let gameServer: Server;

before(async () => {
  const httpServer = http.createServer();
  gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define(ROOM_OF.brindle, WorldRoom, { zone: "brindle" });
  gameServer.define(ROOM_OF.hollow, WorldRoom, { zone: "hollow" });
  await gameServer.listen(PORT);
});
after(async () => {
  await gameServer.gracefullyShutdown(false);
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 4000, what = "") => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out ${what}`);
    await wait(20);
  }
};
const url = `ws://localhost:${PORT}`;
const roomOf = (r: Room<any>) => matchMaker.getLocalRoomById(r.roomId) as unknown as WorldRoom;

interface Session {
  room: Room<any>;
  priv: any;
  travel: any;
  notices: string[];
}
function listen(room: Room<any>): Session {
  const s: Session = { room, priv: null, travel: null, notices: [] };
  room.onMessage(Msg.Private, (d: any) => (s.priv = d));
  room.onMessage(Msg.Travel, (e: any) => (s.travel = e));
  room.onMessage(Msg.Notice, (n: any) => s.notices.push(n.text));
  for (const m of [Msg.ChatLine, Msg.Loot, Msg.Gathering, Msg.Hit, Msg.ExpGain, Msg.LevelUp, Msg.OpenStation]) room.onMessage(m, () => {});
  return s;
}
/** Makes a character and walks it through the portal. */
async function intoHollow(name: string, pass: string): Promise<Session> {
  const c = new Client(url);
  const s = listen(await c.joinOrCreate(ROOM_OF.brindle, { name, password: pass, create: true }));
  const w = roomOf(s.room);
  const p = w.state.players.get(s.room.sessionId)!;
  p.level = 12;
  const at = findStation(w.map, "portal")!;
  p.x = at.x;
  p.y = at.y + 1;
  s.room.send(Msg.EnterHollow);
  await until(() => s.travel !== null, 4000, "portal");
  const h = listen(await c.joinOrCreate(ROOM_OF.hollow, { ticket: s.travel.ticket }));
  await s.room.leave();
  await until(() => h.room.state.players?.has(h.room.sessionId), 4000, "arrive");
  return h;
}

test("the Hollow map: gates, arrivals, monsters and ore can all be reached", () => {
  const map = buildHollow();
  assert.deepEqual(buildHollow().props, map.props, "same every time");
  const ok = reachableFrom(map, map.spawn);
  const can = (p: { x: number; y: number }) => ok.has(p.y * map.width + p.x);
  for (const p of [...map.gateSpots, ...map.entries]) assert.ok(isWalkable(map, p.x, p.y) && can(p));
  assert.equal(new Set(map.gateSpots.map((p) => `${p.x},${p.y}`)).size, map.gateSpots.length, "gate spots differ");
  for (const s of SPAWNS.hollow) {
    assert.ok(MONSTERS[s.kind], s.kind);
    let n = 0;
    for (let y = s.y - s.radius; y <= s.y + s.radius; y++) for (let x = s.x - s.radius; x <= s.x + s.radius; x++) if (can({ x, y })) n++;
    assert.ok(n > s.count * 3, `${s.kind}@${s.x},${s.y}`);
  }
  let ore = 0;
  for (let y = 1; y < map.height - 1; y++)
    for (let x = 1; x < map.width - 1; x++)
      if (resourceAt(map, x, y)?.item === "ore_3" && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => can({ x: x + dx, y: y + dy }))) ore++;
  assert.ok(ore > 20, `${ore} rocks`);
  // arrivals are not on top of a gate
  for (const e of map.entries) for (const g of map.gateSpots) assert.ok(Math.hypot(e.x - g.x, e.y - g.y) > 4);
  // and nothing that attacks first is born next to them (hunters walk anywhere)
  for (const e of map.entries)
    for (const s of SPAWNS.hollow)
      if (s.kind !== "hunter") assert.ok(Math.hypot(e.x - s.x, e.y - s.y) > s.radius + 6, `${s.kind} near arrival ${e.x},${e.y}`);
  assert.ok(findPath(map, map.entries[0], map.gateSpots[1], 200));
});

test("gates move, and dying destroys about 30%", () => {
  const { gateSpots } = buildHollow();
  const a = pickGates(gateSpots);
  assert.equal(a.length, GATE_COUNT);
  const b = pickGates(gateSpots, a);
  assert.ok(b.every((g) => !a.some((x) => x.x === g.x && x.y === g.y)));
  const many = Array.from({ length: 2000 }, (_, i) => ({ uid: String(i), id: "pickaxe", qty: 1 }));
  const left = destroyPart(many).length;
  assert.ok(left > 1300 && left < 1500, String(left));
  const stack = destroyPart([{ uid: "s", id: "ore_1", qty: 99 }])[0];
  assert.ok(stack.qty > 45 && stack.qty < 90);
  assert.equal(corruptionBonus(0), 1);
  assert.equal(corruptionBonus(100), 2);
});

test("the portal needs level 10, and a ticket works only once", async () => {
  const c = new Client(url);
  const s = listen(await c.joinOrCreate(ROOM_OF.brindle, { name: "Rookie", password: "rook", create: true }));
  const w = roomOf(s.room);
  const p = w.state.players.get(s.room.sessionId)!;
  s.room.send(Msg.EnterHollow);
  await until(() => s.notices.length === 1, 4000, "too far");
  const at = findStation(w.map, "portal")!;
  p.x = at.x;
  p.y = at.y + 1;
  s.room.send(Msg.EnterHollow);
  await until(() => s.notices.length === 2, 4000, "level");
  assert.equal(s.travel, null);
  p.level = 10;
  s.room.send(Msg.EnterHollow);
  await until(() => s.travel !== null);
  assert.equal(w.state.players.has(s.room.sessionId), false, "gone from the village");
  // the password does not work while travelling
  await assert.rejects(c.joinOrCreate(ROOM_OF.hollow, { name: "Rookie", password: "rook", create: false }));
  await assert.rejects(c.joinOrCreate(ROOM_OF.brindle, { ticket: s.travel!.ticket }), "wrong map");
  const h = listen(await c.joinOrCreate(ROOM_OF.hollow, { ticket: s.travel!.ticket }));
  await assert.rejects(c.joinOrCreate(ROOM_OF.hollow, { ticket: s.travel!.ticket }), "used up");
  await s.room.leave();
  await until(() => h.room.state.players?.has(h.room.sessionId));
  assert.equal(h.room.state.gates.length, GATE_COUNT);

  // the way out: stand on a gate
  const hw = roomOf(h.room);
  const hp = hw.state.players.get(h.room.sessionId)!;
  hw.ctl.get(h.room.sessionId)!.corruption = 70;
  await until(() => hp.corruption >= GLOW_AT);
  hp.x = hw.state.gates[0]!.x;
  hp.y = hw.state.gates[0]!.y;
  await until(() => h.travel !== null, 4000, "gate");
  assert.equal(h.travel.zone, "brindle");
  const back = listen(await c.joinOrCreate(ROOM_OF.brindle, { ticket: h.travel.ticket }));
  await h.room.leave();
  await until(() => back.room.state.players?.has(back.room.sessionId));
  assert.equal(back.room.state.players.get(back.room.sessionId).corruption, 0);
  assert.equal(back.room.state.players.get(back.room.sessionId).level, 10);
  await back.room.leave();
});

test("no fighting in the village", async () => {
  const c = new Client(url);
  const a = listen(await c.joinOrCreate(ROOM_OF.brindle, { name: "Peace1", password: "peace", create: true }));
  const b = listen(await c.joinOrCreate(ROOM_OF.brindle, { name: "Peace2", password: "peace", create: true }));
  const w = roomOf(a.room);
  const pa = w.state.players.get(a.room.sessionId)!;
  const pb = w.state.players.get(b.room.sessionId)!;
  pb.x = pa.x;
  pb.y = pa.y;
  const hp = pb.hp;
  a.room.send(Msg.Attack, { id: b.room.sessionId });
  await wait(1500);
  assert.equal(pb.hp, hp);
  await a.room.leave();
  await b.room.leave();
});

test("killing a player in the Hollow: everything drops, anyone can take it, nothing is doubled", async () => {
  const a = await intoHollow("Hunter1", "hunt1");
  const b = await intoHollow("Victim1", "vict1");
  assert.equal(a.room.roomId, b.room.roomId);
  const w = roomOf(a.room);
  const pa = w.state.players.get(a.room.sessionId)!;
  const pb = w.state.players.get(b.room.sessionId)!;
  const ca = w.ctl.get(a.room.sessionId)!;
  const cb = w.ctl.get(b.room.sessionId)!;
  // keep monsters out of this test
  for (const id of [...w.state.monsters.keys()]) (w.state.monsters.delete(id), w.monsterSys.ctl.delete(id));
  addItem(cb.inv.bag, BAG_SIZE, "ore_3", 60);
  addItem(cb.inv.bag, BAG_SIZE, "sword_1", 1);
  addItem(cb.inv.storage, 80, "ore_1", 7);
  cb.gold = 55;
  b.room.send(Msg.Equip, { uid: cb.inv.bag[1].uid });
  await until(() => pb.weapon === "sword_1");
  pb.x = pa.x;
  pb.y = pa.y;

  // the arrival shield holds at first
  cb.shieldUntil = Date.now() + 60_000;
  const full = pb.hp;
  a.room.send(Msg.Attack, { id: b.room.sessionId });
  await wait(1300);
  assert.equal(pb.hp, full);
  cb.shieldUntil = 0;
  ca.shieldUntil = 0;
  pb.hp = 12;
  a.room.send(Msg.Attack, { id: b.room.sessionId });
  await until(() => pb.dead, 12000, "kill");
  assert.equal(pb.weapon, "");
  assert.equal(cb.inv.bag.length, 0);
  assert.equal(countItem(cb.inv.storage, "ore_1"), 7, "storage is safe");
  assert.equal(cb.gold, 55, "coins are safe");
  await until(() => b.priv?.inv.bag.length === 0);

  const [[bid, bundle]] = [...w.state.bundles.entries()];
  assert.equal(bundle.owner, "Victim1");
  const rows = await loadBundles("hollow");
  assert.equal(rows.length, 1);
  const lying = JSON.parse(rows[0].items) as any[];
  const ore = lying.find((s) => s.id === "ore_3")?.qty ?? 0;
  assert.ok(ore > 20 && ore < 60, `${ore} ore left`);

  a.room.send(Msg.LootBundle, { id: bid });
  await until(() => w.state.bundles.size === 0, 8000, "loot");
  assert.equal(countItem(ca.inv.bag, "ore_3"), ore);
  await wait(100);
  assert.equal((await loadBundles("hollow")).length, 0);
  const saved = JSON.parse((await loadCharacter(ca.accountId))!.inv);
  assert.equal(countItem(saved.bag, "ore_3"), ore);

  // the dead wake up in the village
  const row = (await loadCharacter(cb.accountId))!;
  assert.equal(row.zone, "brindle");
  assert.equal(JSON.parse(row.inv).bag.length, 0);
  await wait(2100);
  b.room.send(Msg.Respawn);
  await until(() => b.travel?.zone === "brindle", 4000, "respawn");
  const c = new Client(url);
  const v = listen(await c.joinOrCreate(ROOM_OF.brindle, { ticket: b.travel.ticket }));
  await b.room.leave();
  await until(() => v.room.state.players?.has(v.room.sessionId));
  assert.equal(v.room.state.players.get(v.room.sessionId).dead, false);
  await v.room.leave();
  w.ctl.get(a.room.sessionId)!.lingerUntil = 0;
  await a.room.leave();
});

test("logging out in the Hollow leaves the body, which can be taken back or killed", async () => {
  const a = await intoHollow("Linger1", "ling1");
  const w = roomOf(a.room);
  for (const id of [...w.state.monsters.keys()]) (w.state.monsters.delete(id), w.monsterSys.ctl.delete(id));
  const ctl = w.ctl.get(a.room.sessionId)!;
  addItem(ctl.inv.bag, BAG_SIZE, "ore_3", 5);
  const oldId = a.room.sessionId;
  await a.room.leave();
  await until(() => w.state.players.get(oldId)?.offline === true, 4000, "offline");

  // log in again: the village sends us here, and we get the same body
  const c = new Client(url);
  await assert.rejects(c.joinOrCreate(ROOM_OF.brindle, { name: "Linger1", password: "ling1", create: false }), (e: any) =>
    String(e.message).startsWith(ZONE_ERROR + "hollow"),
  );
  const back = listen(await c.joinOrCreate(ROOM_OF.hollow, { name: "Linger1", password: "ling1", create: false }));
  await until(() => back.room.state.players?.has(back.room.sessionId), 4000, "back");
  assert.equal(w.state.players.has(oldId), false);
  assert.equal(w.ctl.get(back.room.sessionId), ctl, "same character, not a copy");
  assert.equal(back.room.state.players.get(back.room.sessionId).offline, false);
  await assert.rejects(c.joinOrCreate(ROOM_OF.hollow, { name: "Linger1", password: "ling1", create: false }), "already in");

  // log out again and let the time run out: saved in the Hollow
  const id2 = back.room.sessionId;
  await back.room.leave();
  await until(() => !!w.ctl.get(id2)?.lingerUntil);
  w.ctl.get(id2)!.lingerUntil = 1;
  await until(() => !w.state.players.has(id2), 4000, "gone");
  await wait(100);
  const row = (await loadCharacter(ctl.accountId))!;
  assert.equal(row.zone, "hollow");
  assert.equal(countItem(JSON.parse(row.inv).bag, "ore_3"), 5);

  // in again, out again, and killed while the body stands there
  const third = listen(await c.joinOrCreate(ROOM_OF.hollow, { name: "Linger1", password: "ling1", create: false }));
  const killer = await intoHollow("Killer1", "kill1");
  const id3 = third.room.sessionId;
  await until(() => w.ctl.has(id3));
  await third.room.leave();
  await until(() => w.state.players.get(id3)?.offline === true);
  const body = w.state.players.get(id3)!;
  const pk = w.state.players.get(killer.room.sessionId)!;
  pk.x = body.x;
  pk.y = body.y;
  body.hp = 3;
  w.ctl.get(id3)!.shieldUntil = 0;
  w.ctl.get(id3)!.mods.dodge = 0;
  killer.room.send(Msg.Attack, { id: id3 });
  await until(() => !w.state.players.has(id3), 6000, "killed");
  await wait(100);
  const dead = (await loadCharacter(ctl.accountId))!;
  assert.equal(dead.zone, "brindle");
  assert.equal(JSON.parse(dead.inv).bag.length, 0);
  const alive = listen(await c.joinOrCreate(ROOM_OF.brindle, { name: "Linger1", password: "ling1", create: false }));
  await alive.room.leave();
  await killer.room.leave();
});
