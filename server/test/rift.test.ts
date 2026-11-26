import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, Room } from "colyseus.js";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { countItem } from "../../shared/items";
import { Msg, ROOM_OF, TravelEvent } from "../../shared/protocol";
import { buildRift, PORTAL_MAX, riftRewards, riftWaves, rollRarity } from "../../shared/rift";
import { reachableFrom } from "../../shared/terrain";
import { ZONE_IDS } from "../../shared/zones";
import { loadCharacter } from "../src/db";
import { WorldRoom } from "../src/rooms/WorldRoom";

process.env.HV_DB = ":memory:";
const PORT = 25678;
let gameServer: Server;
before(async () => {
  const httpServer = http.createServer();
  gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  for (const zone of ZONE_IDS) gameServer.define(ROOM_OF[zone], WorldRoom, { zone });
  gameServer.define(ROOM_OF.rift, WorldRoom, { zone: "rift" });
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
    await wait(15);
  }
};
interface Seat {
  r: Room<any>;
  w: WorldRoom;
  notices: string[];
  travel: TravelEvent[];
  client: Client;
}
async function join(client: Client, room: Room<any>): Promise<Seat> {
  const s: Seat = { r: room, w: matchMaker.getLocalRoomById(room.roomId) as unknown as WorldRoom, notices: [], travel: [], client };
  room.onMessage(Msg.Notice, (n: any) => s.notices.push(n.text));
  room.onMessage(Msg.Travel, (e: any) => s.travel.push(e));
  for (const m of [Msg.ChatLine, Msg.Loot, Msg.Private, Msg.Gathering, Msg.Hit, Msg.ExpGain, Msg.LevelUp, Msg.OpenStation, Msg.Party, Msg.PartyInvite]) room.onMessage(m, () => {});
  await until(() => room.state.players?.has(room.sessionId));
  return s;
}
async function enter(name: string) {
  const client = new Client(`ws://localhost:${PORT}`);
  return join(client, await client.joinOrCreate<any>("world", { name, password: "rift1", create: true }));
}

test("rarity odds, waves and rewards grow with the portal", () => {
  const seen = [0, 0, 0, 0];
  for (let i = 0; i < 1000; i++) seen[rollRarity(i / 1000)]++;
  assert.ok(seen[0] > seen[1] && seen[1] > seen[2] && seen[2] > seen[3] && seen[3] > 0, String(seen));
  const common = riftWaves({ origin: "brindle", rarity: 0, dark: false });
  const legend = riftWaves({ origin: "mossfen", rarity: 3, dark: false });
  assert.ok(legend.length > common.length);
  assert.ok(legend.at(-1)!.some((w) => w.kind === "treant"), "a boss at the end");
  const r = () => 0.5;
  const g0 = riftRewards({ origin: "brindle", rarity: 0, dark: false }, r);
  const g3 = riftRewards({ origin: "brindle", rarity: 3, dark: false }, r);
  const d3 = riftRewards({ origin: "brindle", rarity: 3, dark: true }, r);
  assert.ok(g3.gold > g0.gold && d3.gold > g3.gold);
  assert.ok(d3.items.reduce((n, i) => n + i.qty, 0) > g3.items.reduce((n, i) => n + i.qty, 0));
  // every island can be walked from the arrival to the chest
  for (const dark of [false, true]) {
    const m = buildRift({ seed: 77, origin: "mossfen", rarity: 2, dark, at: { x: 5, y: 5 } });
    const reach = reachableFrom(m, m.spawn);
    const c = m.width / 2;
    assert.ok([[c, c + 1], [c + 1, c], [c - 1, c], [c, c - 1]].some(([x, y]) => reach.has(y * m.width + x)), "the chest can be reached");
  }
});

test("into a portal: waves, the chest, and back out to where it stood", async () => {
  const a = await enter("RiftA");
  const pa = a.w.state.players.get(a.r.sessionId)!;
  pa.level = 20;
  const id = a.w.openPortal(1, false, { x: 60, y: 40 })!;
  assert.ok(id);
  const portal = a.w.state.portals.get(id)!;
  pa.x = portal.x;
  pa.y = portal.y + 1;
  a.w.monsterSys.clearNear(portal.x, portal.y, 14);
  a.r.send(Msg.EnterRift, { id });
  await until(() => a.travel.length > 0, 4000, "travel");
  const t = a.travel[0];
  assert.equal(t.zone, "rift");
  assert.ok(t.roomId && t.rift);
  assert.equal(portal.inside, 1);
  // the save says: standing by the portal in Brindle
  const accountId = (await loadCharacter((a.w.ctl.get(a.r.sessionId) ?? { accountId: 0 }).accountId))?.account_id;
  void accountId;
  await a.r.leave();
  const inside = await join(a.client, await a.client.joinById<any>(t.roomId!, { ticket: t.ticket }));
  const w = inside.w;
  assert.equal(w.map.id, "rift");
  const me = w.state.players.get(inside.r.sessionId)!;
  // waves come one after another; beat them by hand
  const waves = riftWaves(t.rift!).length;
  for (let i = 0; i < waves; i++) {
    (w as any).nextWaveAt = 0;
    await until(() => w.state.riftWave === i + 1 && w.state.monsters.size > 0, 3000, `wave ${i + 1}`);
    for (const mid of [...w.state.monsters.keys()]) {
      w.state.monsters.get(mid)!.hp = 1;
      (w as any).playerHitsMonster(inside.r.sessionId, me, w.ctl.get(inside.r.sessionId)!, mid, 1);
    }
  }
  (w as any).nextWaveAt = 0;
  await until(() => w.state.riftCleared, 3000, "cleared");
  // the chest: once each
  const c = w.ctl.get(inside.r.sessionId)!;
  const gold = c.gold;
  const cx = w.map.width / 2;
  me.x = cx;
  me.y = cx + 2;
  (w as any).useSpecial(w.clients[0], me, c, "treasure", cx, cx);
  assert.ok(c.gold > gold, "coins from the chest");
  assert.ok(countItem(c.inv.bag, "crystal_1") > 0, "a rare chest gives crystals");
  const after1 = c.gold;
  (w as any).useSpecial(w.clients[0], me, c, "treasure", cx, cx);
  assert.equal(c.gold, after1, "only once");
  // out through the way back
  const exit = w.map.exits[0];
  me.x = exit.x;
  me.y = exit.y;
  await until(() => inside.travel.length > 0, 3000, "out");
  assert.equal(inside.travel[0].zone, "brindle");
  const saved = await loadCharacter(c.accountId);
  assert.equal(saved!.zone, "brindle");
  assert.equal(saved!.x, portal.x);
  await inside.r.leave();
});

test("a portal lets seven people in, whoever they are", async () => {
  const first = await enter("RiftCap0");
  const w = first.w;
  const id = w.openPortal(0, true, { x: 60, y: 70 })!;
  assert.ok(id, "portal opened");
  const portal = w.state.portals.get(id)!;
  const ctl = (w as any).portalCtl.get(id);
  for (let i = 0; i < PORTAL_MAX; i++) ctl.entered.add(10_000 + i);
  portal.inside = PORTAL_MAX;
  const p = w.state.players.get(first.r.sessionId)!;
  p.level = 20;
  p.x = portal.x;
  p.y = portal.y + 1;
  await (w as any).enterPortal(w.clients.find((c: any) => c.sessionId === first.r.sessionId), p, w.ctl.get(first.r.sessionId), id);
  await until(() => first.notices.some((n) => n.includes("เต็ม")), 2000, "full notice");
  await first.r.leave();
});

test("a dungeon: rooms open one by one, the party shares one run", async () => {
  const { buildDungeon, DUNGEON_ROOMS } = await import("../../shared/rift");
  // every room and the chest can be reached once the gates are open
  const m = buildDungeon({ seed: 3, origin: "brindle", rarity: 2, dark: false, at: { x: 1, y: 1 }, dungeon: true });
  const shut = reachableFrom(m, m.spawn);
  assert.ok(!shut.has(11 * m.width + DUNGEON_ROOMS[1]), "second room is behind a gate");
  m.closed.clear();
  const open = reachableFrom(m, m.spawn);
  for (const x of DUNGEON_ROOMS) assert.ok(open.has(11 * m.width + x), `room at ${x}`);

  const a = await enter("DunA");
  const w = a.w;
  const door = w.state.portals.get("dungeon")!;
  assert.ok(door?.dungeon);
  const pa = w.state.players.get(a.r.sessionId)!;
  pa.level = 20;
  pa.x = door.x;
  pa.y = door.y + 1;
  w.monsterSys.clearNear(door.x, door.y, 14);
  a.r.send(Msg.EnterRift, { id: "dungeon" });
  await until(() => a.travel.length > 0, 4000, "travel");
  const t = a.travel[0];
  assert.ok(t.rift?.dungeon);
  await a.r.leave();
  const inside = await join(a.client, await a.client.joinById<any>(t.roomId!, { ticket: t.ticket }));
  const d = inside.w;
  assert.equal(d.state.closed.size, DUNGEON_ROOMS.length - 1, "all gates shut");
  const me = d.state.players.get(inside.r.sessionId)!;
  for (let i = 0; i < DUNGEON_ROOMS.length; i++) {
    (d as any).nextWaveAt = 0;
    await until(() => d.state.riftWave === i + 1 && d.state.monsters.size > 0, 3000, `room ${i + 1}`);
    assert.equal(d.state.closed.size, DUNGEON_ROOMS.length - 1 - i, "gates open as rooms are cleared");
    for (const mid of [...d.state.monsters.keys()]) {
      d.state.monsters.get(mid)!.hp = 1;
      (d as any).playerHitsMonster(inside.r.sessionId, me, d.ctl.get(inside.r.sessionId)!, mid, 1);
    }
  }
  (d as any).nextWaveAt = 0;
  await until(() => d.state.riftCleared, 3000, "cleared");
  await inside.r.leave();
});
