import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, Room } from "colyseus.js";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { addItem, BAG_SIZE, emptyInventory, resourceAt } from "../../shared/items";
import { Msg } from "../../shared/protocol";
import { WorldRoom } from "../src/rooms/WorldRoom";

process.env.HV_DB = ":memory:";
const PORT = 25670;
let gameServer: Server;

before(async () => {
  const httpServer = http.createServer();
  gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define("world", WorldRoom, { zone: "brindle" });
  gameServer.define("hollow", WorldRoom, { zone: "hollow" });
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
  assert.deepEqual(priv, { gold: 0, nodes: [], inv: emptyInventory() });

  // not next to a starting point: ignored. Level 1 has one point.
  a.send(Msg.LearnPassive, { id: "r4" });
  a.send(Msg.LearnPassive, { id: "c_str" });
  await until(() => priv.nodes.length === 1);
  assert.deepEqual(priv.nodes, ["c_str"]);
  a.send(Msg.LearnPassive, { id: "r4" });
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
  a.send(Msg.LearnPassive, { id: "r4" });
  a.send(Msg.LearnPassive, { id: "r3" });
  await until(() => priv.nodes.length === 3);
  assert.ok(me.maxHp > before);

  // r3 holds up r2: refused; r2 itself can go, for 50 coins at level 5
  a.send(Msg.RefundPassive, { id: "r4" });
  a.send(Msg.RefundPassive, { id: "r3" });
  await until(() => priv.nodes.length === 2);
  assert.deepEqual(priv.nodes, ["c_str", "r4"]);
  assert.equal(priv.gold, 950);
  await a.leave();

  a = await c.joinOrCreate("world", { name: "Weaver", password: "weave", create: false });
  let back: any = null;
  a.onMessage(Msg.Private, (d: any) => (back = d));
  a.send(Msg.Sync);
  await until(() => back !== null);
  assert.deepEqual(back, { gold: 950, nodes: ["c_str", "r4"], inv: emptyInventory() });
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
  const id = [...room.state.monsters.entries()].find(([, m]) => m.kind === "rat" && m.x > 37 && m.y < 28)![0]; // far from the village and the scarecrows
  const m = room.state.monsters.get(id)!;
  p.x = Math.round(m.x);
  p.y = Math.round(m.y);
  p.hp = 50; // enough to survive a high-level rat
  m.hp = 25;
  a.send(Msg.Attack, { id });
  await until(() => hits.length >= 1, 5000);
  assert.equal(hits[0].crit, true);
  assert.ok(hpAfterFirst > 50, "life steal healed (nothing else could: bloodthirst stops regeneration)");
  await until(() => hits.some((h) => h.killed), 12000);
  await until(() => priv?.gold >= 5);
  await a.leave();
});

test("gather, buy, craft, wear and store items, and keep them after logging in again", async () => {
  const c = new Client(`ws://localhost:${PORT}`);
  let a: Room<any> = await c.joinOrCreate("world", { name: "Smithy", password: "smith", create: true });
  let priv: any = null;
  const notices: string[] = [];
  const opened: string[] = [];
  const listen = () => {
    a.onMessage(Msg.Private, (d: any) => (priv = d));
    a.onMessage(Msg.Notice, (n: any) => notices.push(n.text));
    a.onMessage(Msg.OpenStation, (e: any) => opened.push(e.kind));
    a.onMessage(Msg.Loot, () => {});
    a.onMessage(Msg.Gathering, () => {});
  };
  listen();
  const room = matchMaker.getLocalRoomById(a.roomId) as unknown as WorldRoom;
  const me = room.state.players.get(a.sessionId)!;
  const ctl = room.ctl.get(a.sessionId)!;
  a.send(Msg.Sync);
  await until(() => priv !== null);

  // a rock without a pickaxe, and the smith from across the map: refused
  const rock = { x: 17, y: 21 };
  assert.equal(resourceAt(room.map, rock.x, rock.y)?.item, "ore_1");
  a.send(Msg.Interact, rock);
  await until(() => notices.length === 1);
  me.x = 16;
  me.y = 10;
  a.send(Msg.Buy, { item: "pickaxe" });
  await until(() => notices.length === 2);

  // walk to the anvil and buy a pickaxe
  me.x = 24;
  me.y = 26;
  ctl.gold = 20;
  a.send(Msg.Interact, { x: 21, y: 27 });
  await until(() => opened.includes("smith"), 6000);
  a.send(Msg.Buy, { item: "pickaxe" });
  await until(() => priv.inv.bag.length === 1);
  assert.equal(priv.gold, 5);
  a.send(Msg.Buy, { item: "pickaxe" });
  await until(() => notices.length === 3);
  a.send(Msg.Buy, { item: "constructor" });

  // mine the rock: takes a moment, gives ore, and the rock is used up for a while
  a.send(Msg.Interact, rock);
  await until(() => priv.inv.bag.some((s: any) => s.id === "ore_1"), 12000);
  await until(() => a.state.depleted.get("17,21") === true);
  a.send(Msg.Interact, rock);
  await until(() => notices.length === 4);

  // craft a sword at the anvil
  addItem(ctl.inv.bag, BAG_SIZE, "ore_1", 5);
  addItem(ctl.inv.bag, BAG_SIZE, "wood_1", 2);
  a.send(Msg.Interact, { x: 21, y: 27 });
  await until(() => opened.length === 2, 8000);
  a.send(Msg.Craft, { item: "sword_1" });
  await until(() => priv.inv.bag.some((s: any) => s.id === "sword_1"));
  const sword = priv.inv.bag.find((s: any) => s.id === "sword_1");
  assert.equal(sword.maker, "Smithy");
  a.send(Msg.Equip, { uid: sword.uid });
  await until(() => a.state.players.get(a.sessionId).weapon === "sword_1");

  // sell the ore that is left
  const ore = priv.inv.bag.find((s: any) => s.id === "ore_1");
  const goldBefore = priv.gold;
  a.send(Msg.Sell, { uid: ore.uid });
  await until(() => priv.gold > goldBefore);
  assert.equal(priv.gold, goldBefore + ore.qty);

  // put the pickaxe in storage
  a.send(Msg.Interact, { x: 27, y: 21 });
  await until(() => opened.includes("storage"), 8000);
  const pick = priv.inv.bag.find((s: any) => s.id === "pickaxe");
  a.send(Msg.Deposit, { uid: pick.uid });
  await until(() => priv.inv.storage.length === 1);
  assert.equal(priv.inv.bag.length, 0);
  const saved = structuredClone(priv);
  await a.leave();

  a = await c.joinOrCreate("world", { name: "Smithy", password: "smith", create: false });
  priv = null;
  listen();
  a.send(Msg.Sync);
  await until(() => priv !== null);
  assert.deepEqual(priv, saved);
  await until(() => a.state.players.get(a.sessionId)?.weapon === "sword_1");
  await a.leave();
});

test("walking away stops gathering", async () => {
  const c = new Client(`ws://localhost:${PORT}`);
  const a: Room<any> = await c.joinOrCreate("world", { name: "Digger", password: "dig1", create: true });
  const ev: any[] = [];
  a.onMessage(Msg.Gathering, (e: any) => ev.push(e.ms));
  const room = matchMaker.getLocalRoomById(a.roomId) as unknown as WorldRoom;
  const ctl = room.ctl.get(a.sessionId)!;
  const me = room.state.players.get(a.sessionId)!;
  addItem(ctl.inv.bag, BAG_SIZE, "pickaxe", 1);
  me.x = 16;
  me.y = 22;
  a.send(Msg.Interact, { x: 16, y: 20 });
  await until(() => ev.length === 1, 5000);
  a.send(Msg.Move, { x: 20, y: 24 });
  await until(() => ev.length === 2);
  assert.equal(ev[1], 0);
  await wait(3000);
  assert.equal(ctl.inv.bag.length, 1);
  assert.equal(room.state.depleted.has("16,20"), false);
  await a.leave();
});
