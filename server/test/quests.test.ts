import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, Room } from "colyseus.js";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { Msg, PrivateData, ROOM_OF } from "../../shared/protocol";
import { cleanQuests, DAILY_COUNT, dailiesFor, MAIN_QUESTS, QUESTS, today } from "../../shared/quests";
import { ITEMS } from "../../shared/items";
import { MONSTERS } from "../../shared/stats";
import { ZONE_IDS } from "../../shared/zones";
import { loadCharacter } from "../src/db";
import { WorldRoom } from "../src/rooms/WorldRoom";

process.env.HV_DB = ":memory:";
const PORT = 25680;
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

test("quest data: every goal names something real, and the story gives about ten passive points", () => {
  let points = 0;
  for (const q of [...MAIN_QUESTS, ...QUESTS.values()]) {
    const g = q.goal;
    if (g.type === "kill") assert.ok(MONSTERS[g.kind], `${q.id} ${g.kind}`);
    if (g.type === "gather") assert.ok(ITEMS[g.item], `${q.id} ${g.item}`);
    for (const it of q.reward.items ?? []) assert.ok(ITEMS[it.id], `${q.id} ${it.id}`);
  }
  for (const q of MAIN_QUESTS) points += q.reward.points ?? 0;
  assert.ok(points >= 8 && points <= 12, `${points} points`);
  // dailies: three different ones, the same all day, a new set another day
  const a = dailiesFor("2026-11-26");
  assert.equal(new Set(a).size, DAILY_COUNT);
  assert.deepEqual(dailiesFor("2026-11-26"), a);
  // old progress from another day is reset, the story step is kept
  const q = cleanQuests({ main: 3, mainProgress: 2, day: "2000-01-01", daily: [{ id: a[0], progress: 9, done: true }], points: 2 });
  assert.equal(q.main, 3);
  assert.equal(q.day, today());
  assert.ok(q.daily.every((d) => d.progress === 0 && !d.done));
});

test("the story moves on: kills count, rewards arrive, quest points open more of the tree, all of it saved", async () => {
  const r: Room<any> = await new Client(`ws://localhost:${PORT}`).joinOrCreate("world", { name: "Quester", password: "quest1", create: true });
  let priv: PrivateData | null = null;
  const notices: string[] = [];
  r.onMessage(Msg.Private, (d: PrivateData) => (priv = d));
  r.onMessage(Msg.Notice, (n: any) => notices.push(n.text));
  for (const m of [Msg.ChatLine, Msg.Loot, Msg.Gathering, Msg.Hit, Msg.ExpGain, Msg.LevelUp, Msg.OpenStation, Msg.Party, Msg.PartyInvite, Msg.Travel]) r.onMessage(m, () => {});
  await until(() => r.state.players?.has(r.sessionId));
  const w = matchMaker.getLocalRoomById(r.roomId) as unknown as WorldRoom;
  const p = w.state.players.get(r.sessionId)!;
  const c = w.ctl.get(r.sessionId)!;
  assert.equal(c.quests.main, 0);
  const gold = c.gold;
  const kill = () => {
    const before = new Set(w.state.monsters.keys());
    w.monsterSys.summon("hen", 1, 60, 10);
    const id = [...w.state.monsters.keys()].find((k) => !before.has(k))!;
    w.state.monsters.get(id)!.hp = 1;
    (w as any).playerHitsMonster(r.sessionId, p, c, id, 1);
  };
  for (let i = 0; i < 5; i++) kill();
  // step 1 done, and step 2 (learn a node) is next
  assert.equal(c.quests.main, 1);
  assert.ok(c.gold >= gold + 40);
  await until(() => notices.some((n) => n.includes(MAIN_QUESTS[0].name)));
  r.send(Msg.LearnPassive, { id: "c_str" });
  await until(() => c.quests.main === 2, 3000, "passive step");
  assert.equal(c.quests.points, 1);
  // the quest point is a real extra point: level 1 can hold two nodes now
  r.send(Msg.LearnPassive, { id: "r4" });
  await until(() => c.nodes.size === 2, 3000, "extra point");
  await until(() => (priv as PrivateData | null)?.quests?.main === 2);
  const id = c.accountId;
  await r.leave();
  await wait(150);
  const saved = JSON.parse((await loadCharacter(id))!.quests);
  assert.equal(saved.main, 2);
  assert.equal(saved.points, 1);
});

test("steps about who you are finish by themselves when you already are", async () => {
  const r: Room<any> = await new Client(`ws://localhost:${PORT}`).joinOrCreate("world", { name: "Veteran", password: "quest1", create: true });
  for (const m of [Msg.Notice, Msg.Private, Msg.ChatLine, Msg.Loot, Msg.Gathering, Msg.Hit, Msg.ExpGain, Msg.LevelUp, Msg.OpenStation, Msg.Party, Msg.PartyInvite, Msg.Travel]) r.onMessage(m, () => {});
  await until(() => r.state.players?.has(r.sessionId));
  const w = matchMaker.getLocalRoomById(r.roomId) as unknown as WorldRoom;
  const p = w.state.players.get(r.sessionId)!;
  const c = w.ctl.get(r.sessionId)!;
  c.quests.main = 4; // "choose a job"
  p.level = 12;
  r.send(Msg.ChangeJob, { job: "archer" });
  await until(() => c.quests.main === 5, 3000, "job step");
  await r.leave();
});
