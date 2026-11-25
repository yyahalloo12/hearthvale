import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, Room } from "colyseus.js";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { addItem, addStack, BAG_SIZE, countItem, findStation, ItemStack, takeStack } from "../../shared/items";
import { afterTax, wholeNumber } from "../../shared/market";
import { Msg, ROOM_OF } from "../../shared/protocol";
import { connection, loadCharacter } from "../src/db";
import * as market from "../src/market";
import { WorldRoom } from "../src/rooms/WorldRoom";

process.env.HV_DB = ":memory:";
const PORT = 25673;
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
    await wait(15);
  }
};

interface S {
  room: Room<any>;
  w: WorldRoom;
  priv: any;
  board: any;
  boards: number;
  stall: any;
  stalls: number;
  notices: string[];
}
async function enter(name: string, create = true): Promise<S> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate<any>("world", { name, password: "trade1", create });
  const s: S = { room, w: matchMaker.getLocalRoomById(room.roomId) as unknown as WorldRoom, priv: null, board: null, boards: 0, stall: undefined, stalls: 0, notices: [] };
  room.onMessage(Msg.Private, (d: any) => (s.priv = d));
  room.onMessage(Msg.BoardData, (d: any) => ((s.board = d), s.boards++));
  room.onMessage(Msg.StallData, (d: any) => ((s.stall = d), s.stalls++));
  room.onMessage(Msg.Notice, (n: any) => s.notices.push(n.text));
  for (const m of [Msg.ChatLine, Msg.Loot, Msg.Gathering, Msg.Hit, Msg.ExpGain, Msg.LevelUp, Msg.OpenStation]) room.onMessage(m, () => {});
  await until(() => room.state.players?.has(room.sessionId));
  return s;
}
const ctl = (s: S) => s.w.ctl.get(s.room.sessionId)!;
const body = (s: S) => s.w.state.players.get(s.room.sessionId)!;
function toBoard(s: S) {
  const at = findStation(s.w.map, "board")!;
  body(s).x = at.x + 1;
  body(s).y = at.y + 1;
}
/** Sends a board action and waits for the new board. */
async function act(s: S, type: string, msg: any = {}) {
  const n = s.boards;
  s.room.send(type, msg);
  await until(() => s.boards > n, 4000, type);
}
/** All coins and all pieces of one item, wherever they are. */
async function totals(people: S[], item: string) {
  let gold = 0;
  let pieces = 0;
  for (const s of people) {
    gold += ctl(s).gold;
    pieces += countItem(ctl(s).inv.bag, item) + countItem(ctl(s).inv.storage, item);
  }
  const d = connection();
  for (const r of d.prepare("SELECT * FROM claims").all() as any[]) {
    gold += r.gold;
    if (r.item && JSON.parse(r.item).id === item) pieces += JSON.parse(r.item).qty;
  }
  for (const r of d.prepare("SELECT * FROM listings").all() as any[]) if (JSON.parse(r.item).id === item) pieces += r.qty;
  for (const r of d.prepare("SELECT * FROM orders").all() as any[]) gold += r.qty * r.price;
  for (const r of market.loadStalls()) for (const it of r.items) if (it.stack.id === item) pieces += it.stack.qty;
  return { gold, pieces };
}

test("small rules: tax, whole numbers, moving stacks", () => {
  assert.equal(afterTax(100), 95);
  assert.equal(afterTax(1), 0);
  assert.equal(afterTax(20), 19);
  for (const bad of [0, -1, 1.5, NaN, Infinity, "5", null, undefined, {}, 1001]) assert.equal(wholeNumber(bad, 1, 1000), null);
  assert.equal(wholeNumber(7, 1, 1000), 7);
  const bag: ItemStack[] = [];
  addItem(bag, 5, "ore_1", 30);
  const part = takeStack(bag, bag[0].uid, 10)!;
  assert.equal(part.qty, 10);
  assert.equal(bag[0].qty, 20);
  assert.notEqual(part.uid, bag[0].uid);
  assert.equal(takeStack(bag, bag[0].uid, 21), null);
  assert.equal(takeStack(bag, bag[0].uid, 0), null);
  assert.equal(addStack(bag, 1, { uid: "x", id: "ore_1", qty: 90 }), false, "all or nothing");
  assert.equal(bag[0].qty, 20);
  assert.equal(addStack(bag, 1, part), true);
  assert.equal(bag[0].qty, 30);
});

test("the board: offer, buy part, tax, cancel, and nothing is made or lost", async () => {
  const a = await enter("Seller");
  const b = await enter("Buyer");
  addItem(ctl(a).inv.bag, BAG_SIZE, "ore_1", 50);
  addItem(ctl(a).inv.bag, BAG_SIZE, "sword_2", 1);
  ctl(b).gold = 1000;

  a.room.send(Msg.Board);
  await until(() => a.notices.length === 1, 4000, "too far");
  toBoard(a);
  toBoard(b);
  const uid = ctl(a).inv.bag[0].uid;
  // nonsense is refused
  for (const bad of [{ uid, qty: 0, price: 5 }, { uid, qty: 5, price: -5 }, { uid, qty: 1.5, price: 5 }, { uid, qty: 5, price: 1e12 }, { qty: 5, price: 5 }, null]) a.room.send(Msg.BoardSell, bad);
  await until(() => a.notices.length === 7);
  await act(a, Msg.BoardSell, { uid, qty: 51, price: 5 });
  assert.equal(countItem(ctl(a).inv.bag, "ore_1"), 50);

  await act(a, Msg.BoardSell, { uid, qty: 40, price: 10 });
  assert.equal(countItem(ctl(a).inv.bag, "ore_1"), 10);
  await act(b, Msg.Board);
  const l = b.board.listings.find((x: any) => x.item.id === "ore_1");
  assert.equal(l.item.qty, 40);
  assert.equal(l.seller, "Seller");
  const start = await totals([a, b], "ore_1");

  // cannot buy your own, too many, or without coins
  await act(a, Msg.BoardBuy, { id: l.id, qty: 1 });
  await act(b, Msg.BoardBuy, { id: l.id, qty: 41 });
  ctl(b).gold = 99;
  await act(b, Msg.BoardBuy, { id: l.id, qty: 10 });
  assert.equal(countItem(ctl(b).inv.bag, "ore_1"), 0);
  assert.equal(ctl(b).gold, 99);
  ctl(b).gold = 1000;
  assert.deepEqual(await totals([a, b], "ore_1"), start);

  await act(b, Msg.BoardBuy, { id: l.id, qty: 10 });
  assert.equal(countItem(ctl(b).inv.bag, "ore_1"), 10);
  assert.equal(ctl(b).gold, 900);
  await until(() => ctl(a).gold === 95, 4000, "paid at once, less 5%");
  const t = await totals([a, b], "ore_1");
  assert.equal(t.pieces, start.pieces);
  assert.equal(t.gold, start.gold - 5, "only the tax is gone");
  const row = (await loadCharacter(ctl(b).accountId))!;
  assert.equal(row.gold, 900);
  assert.equal(countItem(JSON.parse(row.inv).bag, "ore_1"), 10);

  // somebody else cannot cancel it; the owner can
  await act(b, Msg.BoardCancel, { id: l.id });
  assert.ok(market.getListing(l.id));
  await act(a, Msg.BoardCancel, { id: l.id });
  assert.equal(market.getListing(l.id), null);
  assert.equal(countItem(ctl(a).inv.bag, "ore_1"), 40);

  // gear keeps its quality, bonuses and maker
  const sword = ctl(a).inv.bag.find((s) => s.id === "sword_2")!;
  Object.assign(sword, { quality: 3, affixes: { str: 5 }, maker: "Seller" });
  await act(a, Msg.BoardSell, { uid: sword.uid, qty: 1, price: 300 });
  await act(b, Msg.Board);
  const sl = b.board.listings.find((x: any) => x.item.id === "sword_2");
  await act(b, Msg.BoardBuy, { id: sl.id, qty: 1 });
  assert.deepEqual(ctl(b).inv.bag.find((s) => s.id === "sword_2"), { ...sword });

  // two buys in the same moment: only what is there
  const rest = ctl(a).inv.bag.find((s) => s.id === "ore_1")!;
  await act(a, Msg.BoardSell, { uid: rest.uid, qty: 5, price: 1 });
  await act(b, Msg.Board);
  const l5 = b.board.listings.find((x: any) => x.item.id === "ore_1");
  for (let i = 0; i < 4; i++) b.room.send(Msg.BoardBuy, { id: l5.id, qty: 3 });
  await wait(300);
  assert.equal(countItem(ctl(b).inv.bag, "ore_1"), 13);
  await a.room.leave();
  await b.room.leave();
});

test("buy orders: coins are set aside, the item waits at the board, offline sellers are paid later", async () => {
  const a = await enter("Wanter");
  let b = await enter("Digger2");
  toBoard(a);
  toBoard(b);
  ctl(a).gold = 100;
  addItem(ctl(b).inv.bag, BAG_SIZE, "wood_1", 30);
  addItem(ctl(b).inv.bag, BAG_SIZE, "ore_1", 5);
  await act(a, Msg.OrderPlace, { item: "wood_1", qty: 20, price: 10 });
  assert.equal(ctl(a).gold, 100, "not enough coins");
  a.room.send(Msg.OrderPlace, { item: "constructor", qty: 1, price: 1 });
  await act(a, Msg.OrderPlace, { item: "wood_1", qty: 10, price: 10 });
  assert.equal(ctl(a).gold, 0);
  await act(b, Msg.Board);
  const o = b.board.orders.find((x: any) => x.item === "wood_1");
  const start = await totals([a, b], "wood_1");
  const wood = ctl(b).inv.bag.find((s) => s.id === "wood_1")!;
  const ore = ctl(b).inv.bag.find((s) => s.id === "ore_1")!;
  await act(b, Msg.OrderFill, { id: o.id, uid: ore.uid, qty: 5 });
  assert.equal(countItem(ctl(b).inv.bag, "ore_1"), 5, "wrong item");
  await act(b, Msg.OrderFill, { id: o.id, uid: wood.uid, qty: 11 });
  assert.equal(countItem(ctl(b).inv.bag, "wood_1"), 30, "more than wanted");
  await act(b, Msg.OrderFill, { id: o.id, uid: wood.uid, qty: 4 });
  assert.equal(ctl(b).gold, 38);
  await act(a, Msg.Board);
  assert.equal(a.board.mine.claims.length, 1);
  assert.equal(a.board.mine.orders[0].qty, 6);
  const t = await totals([a, b], "wood_1");
  assert.equal(t.pieces, start.pieces);
  assert.equal(t.gold, start.gold - 2);

  // nobody else can take the claim; a full bag keeps it safe
  const claim = a.board.mine.claims[0].id;
  await act(b, Msg.Claim, { id: claim });
  while (ctl(a).inv.bag.length < BAG_SIZE) addItem(ctl(a).inv.bag, BAG_SIZE, "pickaxe", 1);
  await act(a, Msg.Claim, { id: claim });
  assert.equal(a.board.mine.claims.length, 1);
  ctl(a).inv.bag.pop();
  for (let i = 0; i < 3; i++) a.room.send(Msg.Claim, { id: claim });
  await wait(200);
  assert.equal(countItem(ctl(a).inv.bag, "wood_1"), 4, "only once");
  await act(a, Msg.BoardCancel, { id: o.id });
  assert.equal(ctl(a).gold, 60);

  // an offline seller gets the coins at the next login
  await act(b, Msg.BoardSell, { uid: wood.uid, qty: 10, price: 2 });
  const id = ctl(b).accountId;
  await b.room.leave();
  await wait(150);
  await act(a, Msg.Board);
  const l = a.board.listings.find((x: any) => x.seller === "Digger2");
  await act(a, Msg.BoardBuy, { id: l.id, qty: 10 });
  assert.equal((await loadCharacter(id))!.gold, 38);
  b = await enter("Digger2", false);
  await until(() => ctl(b).gold === 57, 4000, "paid at login");
  await a.room.leave();
  await b.room.leave();
});

test("offers that run out go back to their owner", async () => {
  const a = await enter("Slow");
  toBoard(a);
  addItem(ctl(a).inv.bag, BAG_SIZE, "hide_1", 8);
  ctl(a).gold = 50;
  await act(a, Msg.BoardSell, { uid: ctl(a).inv.bag[0].uid, qty: 8, price: 3 });
  await act(a, Msg.OrderPlace, { item: "ore_2", qty: 5, price: 10 });
  market.expireOld(Date.now() + 73 * 3600_000);
  await act(a, Msg.Board);
  assert.equal(a.board.mine.listings.length, 0);
  assert.equal(a.board.mine.orders.length, 0);
  assert.equal(a.board.mine.claims.length, 2);
  for (const cl of a.board.mine.claims) a.room.send(Msg.Claim, { id: cl.id });
  await until(() => ctl(a).gold === 50 && countItem(ctl(a).inv.bag, "hide_1") === 8);
  await a.room.leave();
});

test("stalls: open, sell while offline, come back, close; no tax and nothing is lost", async () => {
  let a = await enter("Keeper1");
  const b = await enter("Shopper");
  addItem(ctl(a).inv.bag, BAG_SIZE, "ore_2", 20);
  addItem(ctl(a).inv.bag, BAG_SIZE, "helm_1", 1);
  ctl(b).gold = 500;
  const place = { x: 27, y: 26 };
  Object.assign(body(a), place);
  const [ore, helm] = ctl(a).inv.bag.map((s) => s.uid);

  a.room.send(Msg.StallOpen, { title: "x", items: [] });
  a.room.send(Msg.StallOpen, { title: "x", items: [{ uid: ore, qty: 21, price: 5 }] });
  a.room.send(Msg.StallOpen, { title: "x", items: [{ uid: ore, qty: 5, price: 0 }] });
  await until(() => a.notices.length === 3);
  assert.equal(a.w.state.stalls.size, 0);
  assert.equal(countItem(ctl(a).inv.bag, "ore_2"), 20);

  a.room.send(Msg.StallOpen, { title: "ร้านแร่", items: [{ uid: ore, qty: 20, price: 5 }, { uid: helm, qty: 1, price: 40 }] });
  await until(() => a.stall?.mine === true);
  assert.equal(ctl(a).inv.bag.length, 0);
  const id = a.stall.id;
  a.room.send(Msg.Move, { x: 24, y: 28 });
  await until(() => a.notices.length === 4, 4000, "sitting");
  assert.equal(body(a).x, place.x);

  // buying: must be near
  Object.assign(body(b), { x: 14, y: 24 });
  b.room.send(Msg.StallBuy, { id, uid: ore, qty: 1 });
  await until(() => b.notices.length === 1);
  Object.assign(body(b), { x: 26, y: 28 });
  b.room.send(Msg.StallVisit, { id });
  await until(() => b.stall?.id === id, 5000, "visit");
  const start = await totals([a, b], "ore_2");
  b.room.send(Msg.StallBuy, { id, uid: b.stall.items[0].stack.uid, qty: 5 });
  await until(() => countItem(ctl(b).inv.bag, "ore_2") === 5);
  await until(() => ctl(a).gold === 25, 4000, "no tax");
  assert.deepEqual(await totals([a, b], "ore_2"), start);

  // offline: the stall stays and still sells
  const accountId = ctl(a).accountId;
  await a.room.leave();
  await wait(150);
  assert.equal(b.room.state.stalls.size, 1);
  b.room.send(Msg.StallBuy, { id, uid: b.stall.items[0].stack.uid, qty: 100 });
  b.room.send(Msg.StallBuy, { id, uid: helm, qty: 1 });
  await until(() => ctl(b).inv.bag.some((s) => s.id === "helm_1"));
  assert.equal((await loadCharacter(accountId))!.gold, 25);
  assert.equal(market.loadStalls()[0].items.length, 1, "saved");

  // back behind the stall, with the coins
  a = await enter("Keeper1", false);
  await until(() => ctl(a).gold === 65);
  assert.equal(ctl(a).stall, id);
  assert.deepEqual([body(a).x, body(a).y], [place.x, place.y]);
  a.room.send(Msg.StallClose);
  await until(() => a.w.state.stalls.size === 0);
  assert.equal(countItem(ctl(a).inv.bag, "ore_2"), 15);
  assert.equal(market.loadStalls().length, 0);
  assert.equal(ctl(a).stall, null);

  // time runs out while offline: the things wait at the board
  const rest = ctl(a).inv.bag.find((s) => s.id === "ore_2")!.uid;
  a.room.send(Msg.StallOpen, { title: "", items: [{ uid: rest, qty: 15, price: 5 }] });
  await until(() => a.w.state.stalls.size === 1);
  await a.room.leave();
  await wait(150);
  [...((b.w as any).stalls as Map<string, any>).values()][0].expires = 1;
  (b.w as any).closeOldStalls();
  assert.equal(b.w.state.stalls.size, 0);
  assert.equal(market.claimsOf(accountId).length, 1);
  assert.equal(market.claimsOf(accountId)[0].item!.qty, 15);
  // sold out closes by itself
  a = await enter("Keeper1", false);
  assert.equal(ctl(a).stall, null);
  addItem(ctl(a).inv.bag, BAG_SIZE, "wood_1", 2);
  Object.assign(body(a), place);
  a.room.send(Msg.StallOpen, { title: "", items: [{ uid: ctl(a).inv.bag[0].uid, qty: 2, price: 1 }] });
  await until(() => a.w.state.stalls.size === 1);
  const [sid] = [...a.w.state.stalls.keys()];
  const n = b.stalls;
  b.room.send(Msg.StallVisit, { id: sid });
  await until(() => b.stalls > n, 5000, "visit 2");
  b.room.send(Msg.StallBuy, { id: sid, uid: b.stall.items[0].stack.uid, qty: 2 });
  await until(() => a.w.state.stalls.size === 0);
  assert.equal(ctl(a).stall, null);
  await a.room.leave();
  await b.room.leave();
});
