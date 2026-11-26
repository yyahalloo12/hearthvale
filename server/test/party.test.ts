import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, Room } from "colyseus.js";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { Msg, PartyData, ROOM_OF } from "../../shared/protocol";
import { ZONE_IDS } from "../../shared/zones";
import { loadCharacter, saveCharacter } from "../src/db";
import { WorldRoom } from "../src/rooms/WorldRoom";

process.env.HV_DB = ":memory:";
const PORT = 25677;
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
  chat: any[];
  party: PartyData;
  invites: string[];
}
async function enter(room: string, name: string, create = true): Promise<Seat> {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate<any>(room, { name, password: "party1", create });
  const s: Seat = { r, w: matchMaker.getLocalRoomById(r.roomId) as unknown as WorldRoom, notices: [], chat: [], party: { members: [] }, invites: [] };
  r.onMessage(Msg.Notice, (n: any) => s.notices.push(n.text));
  r.onMessage(Msg.ChatLine, (l: any) => s.chat.push(l));
  r.onMessage(Msg.Party, (d: PartyData) => (s.party = d));
  r.onMessage(Msg.PartyInvite, (d: any) => s.invites.push(d.from));
  for (const m of [Msg.Loot, Msg.Private, Msg.Gathering, Msg.Hit, Msg.ExpGain, Msg.LevelUp, Msg.OpenStation, Msg.Travel]) r.onMessage(m, () => {});
  await until(() => r.state.players?.has(r.sessionId));
  return s;
}
async function inZone(name: string, zone: "mossfen" | "hollow", level = 20) {
  const a = await enter("world", name);
  const id = a.w.ctl.get(a.r.sessionId)!.accountId;
  await a.r.leave();
  await wait(120);
  await saveCharacter({ ...(await loadCharacter(id))!, level, zone, x: -1, y: -1 });
  return enter(ROOM_OF[zone], name, false);
}
async function team(a: Seat, b: Seat, bName: string) {
  a.r.send(Msg.PartyAct, { action: "invite", name: bName });
  await until(() => b.invites.length > 0, 3000, "invite");
  b.r.send(Msg.PartyAct, { action: "accept" });
  await until(() => a.party.members.length === 2 && b.party.members.length === 2, 3000, "party");
}

test("invite, accept, party chat, kick and leaving", async () => {
  const a = await enter("world", "PartyA");
  const b = await enter("world", "PartyB");
  const c = await enter("world", "PartyC");
  // nobody by that name
  a.r.send(Msg.PartyAct, { action: "invite", name: "Nobody" });
  await until(() => a.notices.some((n) => n.includes("ไม่พบ")));
  await team(a, b, "PartyB");
  assert.ok(a.party.members.find((m) => m.name === "PartyA")!.leader);
  assert.equal(a.party.members.find((m) => m.name === "PartyB")!.sid, b.r.sessionId);
  // only the leader may invite
  b.r.send(Msg.PartyAct, { action: "invite", name: "PartyC" });
  await until(() => b.notices.some((n) => n.includes("หัวหน้า")));
  // party chat reaches members only
  b.r.send(Msg.Chat, { text: "/p hello team" });
  await until(() => a.chat.some((l) => l.party && l.text === "hello team"));
  await wait(150);
  assert.ok(!c.chat.some((l) => l.text === "hello team"));
  // a third joins, then is kicked
  await team(a, c, "PartyC").catch(() => {});
  await until(() => a.party.members.length === 3);
  a.r.send(Msg.PartyAct, { action: "kick", name: "PartyC" });
  await until(() => a.party.members.length === 2 && c.party.members.length === 0);
  // the last but one leaves: the party is gone
  b.r.send(Msg.PartyAct, { action: "leave" });
  await until(() => a.party.members.length === 0 && b.party.members.length === 0);
  await Promise.all([a.r.leave(), b.r.leave(), c.r.leave()]);
});

test("a kill is shared with party members nearby, with a bonus", async () => {
  const a = await enter("world", "ShareA");
  const b = await enter("world", "ShareB");
  const solo = await enter("world", "ShareS");
  await team(a, b, "ShareB");
  const w = a.w;
  const pa = w.state.players.get(a.r.sessionId)!;
  const pb = w.state.players.get(b.r.sessionId)!;
  const ps = w.state.players.get(solo.r.sessionId)!;
  for (const p of [pa, pb, ps]) {
    p.x = 60;
    p.y = 52;
    p.level = 5;
    p.exp = 0;
  }
  const kill = (who: Seat, p: typeof pa) => {
    const before = new Set(w.state.monsters.keys());
    w.monsterSys.summon("rat", 1, 60, 52);
    const id = [...w.state.monsters.keys()].find((k) => !before.has(k))!;
    w.state.monsters.get(id)!.hp = 1;
    w.state.monsters.get(id)!.level = 5;
    w.monsterSys.ctl.get(id)!.exp = 100;
    (w as any).playerHitsMonster(who.r.sessionId, p, w.ctl.get(who.r.sessionId)!, id, 1);
  };
  kill(solo, ps);
  assert.equal(ps.exp, 100);
  kill(a, pa);
  // two members: 100 * 1.1 / 2 = 55 each
  assert.equal(pa.exp, 55);
  assert.equal(pb.exp, 55);
  // too far away: no share
  pb.x = 60 + 20;
  kill(a, pa);
  assert.equal(pa.exp, 155);
  assert.equal(pb.exp, 55);
  await Promise.all([a.r.leave(), b.r.leave(), solo.r.leave()]);
});

test("in the Hollow, party members cannot hurt each other but may heal and bless", async () => {
  const a = await inZone("HolA", "hollow");
  const b = await inZone("HolB", "hollow");
  const e = await inZone("HolE", "hollow");
  await team(a, b, "HolB");
  const w = a.w;
  const ca = w.ctl.get(a.r.sessionId)!;
  for (const s of [a, b, e]) {
    const c = w.ctl.get(s.r.sessionId)!;
    c.shieldUntil = 0;
    const p = w.state.players.get(s.r.sessionId)!;
    p.x = 62;
    p.y = 62;
  }
  const targetOf = (w as any).targetOf.bind(w);
  assert.equal(targetOf(a.r.sessionId, b.r.sessionId), undefined, "friend is not a target");
  assert.ok(targetOf(a.r.sessionId, e.r.sessionId), "stranger is a target");
  // an acolyte heals a hurt friend in the Hollow, but not a stranger
  const pa = w.state.players.get(a.r.sessionId)!;
  pa.job = "acolyte";
  pa.skills.set("heal", 1);
  pa.mp = pa.maxMp = 100;
  const pb = w.state.players.get(b.r.sessionId)!;
  const pe = w.state.players.get(e.r.sessionId)!;
  pb.hp = 10;
  pe.hp = 10;
  (w as any).castNow(w.clients.find((c: any) => c.sessionId === a.r.sessionId), pa, ca, "heal", b.r.sessionId);
  assert.ok(pb.hp > 10, "friend healed");
  (w as any).castNow(w.clients.find((c: any) => c.sessionId === a.r.sessionId), pa, ca, "heal", e.r.sessionId);
  assert.equal(pe.hp, 10, "stranger not healed");
  await Promise.all([a.r.leave(), b.r.leave(), e.r.leave()]);
});

test("the party stays together across maps", async () => {
  const a = await enter("world", "TripA");
  const b = await inZone("TripB", "mossfen");
  await team(a, b, "TripB");
  const there = a.party.members.find((m) => m.name === "TripB")!;
  assert.equal(there.zone, "mossfen");
  assert.equal(there.sid, undefined, "not in our map");
  b.r.send(Msg.Chat, { text: "/p from the forest" });
  await until(() => a.chat.some((l) => l.party && l.text === "from the forest"));
  await b.r.leave();
  await until(() => a.party.members.find((m) => m.name === "TripB")?.online === false, 3000, "offline");
  await a.r.leave();
});

test("border lands: the first to strike turns red, red names lose everything and cannot shop, guards hunt them", async () => {
  const a = await inZone("RedA", "thornmarsh" as never, 30);
  const b = await inZone("RedB", "thornmarsh" as never, 30);
  const w = a.w;
  const ca = w.ctl.get(a.r.sessionId)!;
  const cb = w.ctl.get(b.r.sessionId)!;
  const pa = w.state.players.get(a.r.sessionId)!;
  const pb = w.state.players.get(b.r.sessionId)!;
  for (const [p, c] of [[pa, ca], [pb, cb]] as const) {
    c.shieldUntil = 0;
    p.x = 30;
    p.y = 46;
  }
  const targetOf = (w as any).targetOf.bind(w);
  assert.ok(targetOf(a.r.sessionId, b.r.sessionId), "players are targets in the border lands");
  // A hits B first: A is red, B is not
  (w as any).playerHitsPlayer(a.r.sessionId, pa, ca, b.r.sessionId, 1);
  assert.ok(ca.karma > 0 && pa.outlaw);
  assert.equal(cb.karma, 0);
  // B hits back: hitting a red name is free
  (w as any).playerHitsPlayer(b.r.sessionId, pb, cb, a.r.sessionId, 1);
  assert.equal(cb.karma, 0);
  // a red name dies: everything drops
  ca.inv.bag.push({ uid: "x1", id: "ore_1", qty: 5 });
  pa.hp = 1;
  (w as any).playerHitsPlayer(b.r.sessionId, pb, cb, a.r.sessionId, 5);
  assert.ok(pa.dead);
  assert.equal(ca.inv.bag.length, 0);
  await Promise.all([a.r.leave(), b.r.leave()]);
  // the red name cannot use the smith in the capital
  const { nearestStation } = await import("../../shared/items");
  const c = await inZone("RedC", "aldermere" as never, 30);
  const cc = c.w.ctl.get(c.r.sessionId)!;
  cc.karma = 100;
  const pc = c.w.state.players.get(c.r.sessionId)!;
  const anvil = nearestStation(c.w.map, "smith", 32, 32)!;
  pc.x = anvil.x + 1;
  pc.y = anvil.y;
  const got = (c.w as any).nearStation(c.w.clients[0], "smith");
  assert.equal(got, null);
  // guards see red names even in the safe city
  assert.equal((c.w as any).nearestPlayer(pc.x, pc.y, 5, true), c.r.sessionId);
  cc.karma = 0;
  assert.equal((c.w as any).nearestPlayer(pc.x, pc.y, 5, true), null);
  await c.r.leave();
});
