import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, Room } from "colyseus.js";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { SWARM_EXP, WORLD_BOSS } from "../../shared/events";
import { countItem } from "../../shared/items";
import { Msg, ROOM_OF } from "../../shared/protocol";
import { ZONE_IDS } from "../../shared/zones";
import { WorldRoom } from "../src/rooms/WorldRoom";

process.env.HV_DB = ":memory:";
const PORT = 25679;
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
async function enter(name: string): Promise<{ r: Room<any>; w: WorldRoom }> {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate<any>("world", { name, password: "event1", create: true });
  for (const m of [Msg.Notice, Msg.ChatLine, Msg.Loot, Msg.Private, Msg.Gathering, Msg.Hit, Msg.ExpGain, Msg.LevelUp, Msg.OpenStation, Msg.Party, Msg.PartyInvite, Msg.Travel]) r.onMessage(m, () => {});
  await until(() => r.state.players?.has(r.sessionId));
  return { r, w: matchMaker.getLocalRoomById(r.roomId) as unknown as WorldRoom };
}

test("a swarm brings extra monsters worth more EXP, and they leave when it ends", async () => {
  const a = await enter("Swarm1");
  const w = a.w;
  const before = w.state.monsters.size;
  w.startEvent("swarm");
  assert.equal(w.state.eventKind, "swarm");
  const swarm: Set<string> = (w as any).swarm;
  assert.ok(swarm.size >= 10, `${swarm.size} came`);
  // a swarm kill pays 1.5x
  const p = w.state.players.get(a.r.sessionId)!;
  const c = w.ctl.get(a.r.sessionId)!;
  const id = [...swarm][0];
  const m = w.state.monsters.get(id)!;
  m.hp = 1;
  p.level = m.level;
  p.exp = 0;
  w.monsterSys.ctl.get(id)!.exp = 100;
  (w as any).playerHitsMonster(a.r.sessionId, p, c, id, 1);
  assert.equal(p.exp, 100 * SWARM_EXP);
  // the end: the rest go away
  w.state.eventUntil = Date.now() - 1;
  await until(() => !w.state.eventKind, 2000, "event end");
  assert.equal(swarm.size, 0);
  assert.equal(w.state.monsters.size, before);
  await a.r.leave();
});

test("the giant wakes, and everyone who helped beat it is rewarded", async () => {
  const a = await enter("Giant1");
  const b = await enter("Giant2");
  const idle = await enter("Giant3");
  const w = a.w;
  w.wakeBoss();
  const id = w.state.bossId;
  assert.ok(id, "awake");
  const boss = w.state.monsters.get(id)!;
  assert.equal(boss.kind, WORLD_BOSS.brindle.kind);
  const hp = boss.maxHp;
  assert.ok(hp > 6000, "tougher with more people around");
  const hit = (s: { r: Room<any> }, power: number) => (w as any).playerHitsMonster(s.r.sessionId, w.state.players.get(s.r.sessionId)!, w.ctl.get(s.r.sessionId)!, id, power);
  const ca = w.ctl.get(a.r.sessionId)!;
  const cb = w.ctl.get(b.r.sessionId)!;
  const ci = w.ctl.get(idle.r.sessionId)!;
  const gold = [ca.gold, cb.gold, ci.gold];
  hit(a, 5);
  hit(b, 5);
  boss.hp = 1;
  hit(a, 1);
  assert.equal(w.state.bossId, "", "beaten");
  assert.ok(ca.gold > gold[0] && cb.gold > gold[1], "both helpers paid");
  assert.equal(ci.gold, gold[2], "the one who did nothing is not");
  assert.ok(countItem(cb.inv.bag, "crystal_1") > 0);
  assert.ok(w.state.bossAt > Date.now() + 60_000, "sleeps until next time");
  await Promise.all([a.r.leave(), b.r.leave(), idle.r.leave()]);
});
