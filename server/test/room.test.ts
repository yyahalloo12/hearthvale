import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, Room } from "colyseus.js";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { Msg } from "../../shared/protocol";
import { WorldRoom } from "../src/rooms/WorldRoom";

process.env.HV_DB = ":memory:";
const PORT = 25670;
let gameServer: Server;

before(async () => {
  const httpServer = http.createServer();
  gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define("world", WorldRoom);
  await gameServer.listen(PORT);
});
after(async () => {
  await gameServer.gracefullyShutdown(false);
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out");
    await wait(25);
  }
};

test("two players see each other, walk and chat", async () => {
  const c = new Client(`ws://localhost:${PORT}`);
  const a: Room<any> = await c.joinOrCreate("world", { name: "Ploy", password: "pass1", create: true, color: 0x4a90d9 });
  const b: Room<any> = await c.joinOrCreate("world", { name: "Mek", password: "pass2", create: true, color: 0xd94f4f });
  assert.equal(a.roomId, b.roomId, "both players share one world room");

  await until(() => a.state.players?.size === 2 && b.state.players?.size === 2);
  const aInB = b.state.players.get(a.sessionId);
  assert.equal(aInB.name, "Ploy");
  assert.equal(aInB.color, 0x4a90d9);

  // A walks to a plaza tile; B sees A arrive there.
  a.send(Msg.Move, { x: 27, y: 22 });
  await until(() => {
    const p = b.state.players.get(a.sessionId);
    return Math.abs(p.x - 27) < 0.01 && Math.abs(p.y - 22) < 0.01 && !p.moving;
  }, 6000);

  // Chat reaches the other player.
  const got = new Promise<any>((res) => b.onMessage(Msg.ChatLine, (l: any) => !l.system && res(l)));
  a.send(Msg.Chat, { text: "สวัสดี Hearthvale!" });
  const line = await got;
  assert.equal(line.name, "Ploy");
  assert.equal(line.text, "สวัสดี Hearthvale!");

  // Duplicate names are refused, and so is a second login of an online character.
  await assert.rejects(c.joinOrCreate("world", { name: "ploy", password: "xxxx", create: true }));
  await assert.rejects(c.joinOrCreate("world", { name: "Ploy", password: "pass1", create: false }));

  await b.leave();
  await until(() => a.state.players.size === 1);
  await a.leave();
});

test("clicking a tree does nothing", async () => {
  const c = new Client(`ws://localhost:${PORT}`);
  const a: Room<any> = await c.joinOrCreate("world", { name: "Tester", password: "test", create: true });
  await until(() => a.state.players?.size >= 1);
  const me = a.state.players.get(a.sessionId);
  const start = { x: me.x, y: me.y };
  a.send(Msg.Move, { x: 0, y: 0 });
  await wait(400);
  assert.deepEqual({ x: me.x, y: me.y }, start);
  await a.leave();
});

test("wrong password is refused", async () => {
  const c = new Client(`ws://localhost:${PORT}`);
  const a: Room<any> = await c.joinOrCreate("world", { name: "Keeper", password: "right", create: true });
  await a.leave();
  await assert.rejects(c.joinOrCreate("world", { name: "Keeper", password: "wrong", create: false }));
  const again: Room<any> = await c.joinOrCreate("world", { name: "keeper", password: "right", create: false });
  await again.leave();
});

test("killing a hen gives EXP, and EXP is still there after logging in again", async () => {
  const c = new Client(`ws://localhost:${PORT}`);
  const a: Room<any> = await c.joinOrCreate("world", { name: "Hunter", password: "hunt", create: true });
  await until(() => a.state.players?.size >= 1 && a.state.monsters?.size > 0);
  const me = a.state.players.get(a.sessionId);
  assert.equal(me.level, 1);
  assert.equal(me.hp, me.maxHp);

  let hits = 0;
  let killed = false;
  a.onMessage(Msg.Hit, (h: any) => {
    if (h.from === a.sessionId) hits++;
    if (h.from === a.sessionId && h.killed) killed = true;
  });
  // attack the closest hen
  const pick = () => {
    let best: string | null = null;
    let bestD = Infinity;
    a.state.monsters.forEach((m: any, id: string) => {
      const d = Math.hypot(m.x - me.x, m.y - me.y);
      if (m.kind === "hen" && d < bestD) { bestD = d; best = id; }
    });
    return best!;
  };
  a.send(Msg.Attack, { id: pick() });
  await until(() => killed, 25000);
  assert.ok(hits >= 2, "took a few swings");
  await until(() => me.exp > 0);
  const exp = me.exp;
  await a.leave();

  const b: Room<any> = await c.joinOrCreate("world", { name: "Hunter", password: "hunt", create: false });
  await until(() => b.state.players?.get(b.sessionId) !== undefined);
  assert.equal(b.state.players.get(b.sessionId).exp, exp);
  await b.leave();
});

test("passive nodes: learn, spend points, pay to give back, and save", async () => {
  const c = new Client(`ws://localhost:${PORT}`);
  let a: Room<any> = await c.joinOrCreate("world", { name: "Weaver", password: "weave", create: true });
  let priv: any = null;
  const notices: string[] = [];
  a.onMessage(Msg.Private, (d: any) => (priv = d));
  a.onMessage(Msg.Notice, (n: any) => notices.push(n.text));
  a.send(Msg.Sync);
  await until(() => priv !== null);
  assert.deepEqual(priv, { gold: 0, nodes: [] });

  // not next to a starting point: ignored. Level 1 has one point.
  a.send(Msg.LearnPassive, { id: "r3" });
  a.send(Msg.LearnPassive, { id: "c_str" });
  await until(() => priv.nodes.length === 1);
  assert.deepEqual(priv.nodes, ["c_str"]);
  a.send(Msg.LearnPassive, { id: "r3" });
  await until(() => notices.length === 1);

  // no coins: refused
  a.send(Msg.RefundPassive, { id: "c_str" });
  await until(() => notices.length === 2);
  assert.equal(priv.nodes.length, 1);

  const room = matchMaker.getLocalRoomById(a.roomId) as unknown as WorldRoom;
  const me = room.state.players.get(a.sessionId)!;
  room.ctl.get(a.sessionId)!.gold = 1000;
  me.level = 5;
  const before = me.maxHp;
  a.send(Msg.LearnPassive, { id: "r3" });
  a.send(Msg.LearnPassive, { id: "r2" });
  await until(() => priv.nodes.length === 3);
  assert.ok(me.maxHp > before);

  // r3 holds up r2: refused; r2 itself can go, for 50 coins at level 5
  a.send(Msg.RefundPassive, { id: "r3" });
  a.send(Msg.RefundPassive, { id: "r2" });
  await until(() => priv.nodes.length === 2);
  assert.deepEqual(priv.nodes, ["c_str", "r3"]);
  assert.equal(priv.gold, 950);
  await a.leave();

  a = await c.joinOrCreate("world", { name: "Weaver", password: "weave", create: false });
  let back: any = null;
  a.onMessage(Msg.Private, (d: any) => (back = d));
  a.send(Msg.Sync);
  await until(() => back !== null);
  assert.deepEqual(back, { gold: 950, nodes: ["c_str", "r3"] });
  await a.leave();
});

test("first strike always crits the first hit, life steal heals, kills drop coins", async () => {
  const c = new Client(`ws://localhost:${PORT}`);
  const a: Room<any> = await c.joinOrCreate("world", { name: "Striker", password: "strike", create: true });
  await until(() => a.state.players?.size >= 1 && a.state.monsters?.size > 0);
  const room = matchMaker.getLocalRoomById(a.roomId) as unknown as WorldRoom;
  const ctl = room.ctl.get(a.sessionId)!;
  ctl.mods = { ...ctl.mods, firststrike: true, bloodthirst: true, lifesteal: 50 };
  const hits: any[] = [];
  let priv: any = null;
  let hpAfterFirst = 0;
  const p = room.state.players.get(a.sessionId)!;
  a.onMessage(Msg.Hit, (h: any) => {
    if (h.from !== a.sessionId) return;
    if (!hits.length) hpAfterFirst = p.hp;
    hits.push(h);
  });
  a.onMessage(Msg.Private, (d: any) => (priv = d));
  const id = [...room.state.monsters.entries()].find(([, m]) => m.kind === "rat")![0];
  const m = room.state.monsters.get(id)!;
  p.x = Math.round(m.x);
  p.y = Math.round(m.y);
  p.hp = 20;
  m.hp = 25;
  a.send(Msg.Attack, { id });
  await until(() => hits.length >= 1, 5000);
  assert.equal(hits[0].crit, true);
  assert.ok(hpAfterFirst > 20, "life steal healed (nothing else could: bloodthirst stops regeneration)");
  await until(() => hits.some((h) => h.killed), 12000);
  await until(() => priv?.gold >= 5);
  await a.leave();
});
