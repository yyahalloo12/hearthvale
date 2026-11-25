import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, Room } from "colyseus.js";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { countItem } from "../../shared/items";
import { Msg, ROOM_OF } from "../../shared/protocol";
import { listAdmins, loadCharacter, saveCharacter, setAdmin } from "../src/db";
import { parseCommand } from "../src/game/admin";
import { WorldRoom } from "../src/rooms/WorldRoom";

process.env.HV_DB = ":memory:";
const PORT = 25672;
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

interface S {
  room: Room<any>;
  notices: string[];
  chat: any[];
  travel: any;
}
function listen(room: Room<any>): S {
  const s: S = { room, notices: [], chat: [], travel: null };
  room.onMessage(Msg.Notice, (n: any) => s.notices.push(n.text));
  room.onMessage(Msg.ChatLine, (l: any) => s.chat.push(l));
  room.onMessage(Msg.Travel, (e: any) => (s.travel = e));
  for (const m of [Msg.Private, Msg.Loot, Msg.Gathering, Msg.Hit, Msg.ExpGain, Msg.LevelUp, Msg.OpenStation]) room.onMessage(m, () => {});
  return s;
}

test("commands are split into parts", () => {
  assert.deepEqual(parseCommand("/give ore_1 5 @Some Name"), { cmd: "give", args: ["ore_1", "5"], target: "Some Name", rest: "ore_1 5 @Some Name" });
  assert.deepEqual(parseCommand("/GOD"), { cmd: "god", args: [], target: null, rest: "" });
});

test("a normal player cannot use commands, join as admin, or see them in chat", async () => {
  const c = new Client(`ws://localhost:${PORT}`);
  const a = listen(await c.joinOrCreate("world", { name: "Normal", password: "norm1", create: true, admin: 1, gm: true } as any));
  const b = listen(await c.joinOrCreate("world", { name: "Watcher", password: "watch", create: true }));
  const w = matchMaker.getLocalRoomById(a.room.roomId) as unknown as WorldRoom;
  const me = w.state.players.get(a.room.sessionId)!;
  assert.equal(me.gm, false);
  for (const t of ["/level 60", "/gold 9999", "/god", " /help"]) a.room.send(Msg.Chat, { text: t });
  await until(() => a.notices.length === 4);
  assert.equal(me.level, 1);
  assert.equal(w.ctl.get(a.room.sessionId)!.gold, 0);
  assert.equal(w.ctl.get(a.room.sessionId)!.god, false);
  await wait(100);
  assert.ok(!b.chat.some((l) => l.text.startsWith("/")));
  await a.room.leave();
  await b.room.leave();
});

test("saving a character never changes the admin flag", async () => {
  const c = new Client(`ws://localhost:${PORT}`);
  const a = await c.joinOrCreate("world", { name: "Flag", password: "flag1", create: true });
  const w = matchMaker.getLocalRoomById(a.roomId) as unknown as WorldRoom;
  const id = w.ctl.get(a.sessionId)!.accountId;
  await a.leave();
  await wait(150);
  const row = (await loadCharacter(id))!;
  assert.equal(row.admin, 0);
  await saveCharacter({ ...row, admin: 1 } as any);
  assert.equal((await loadCharacter(id))!.admin, 0);
});

test("a game master can do things to themselves and to others", async () => {
  const c = new Client(`ws://localhost:${PORT}`);
  assert.equal(await setAdmin("Nobody", true), false);
  let first = await c.joinOrCreate("world", { name: "Boss One", password: "boss1", create: true });
  await first.leave();
  assert.equal(await setAdmin("boss one", true), true, "names ignore case");
  assert.deepEqual(await listAdmins(), ["Boss One"]);

  let g = listen(await c.joinOrCreate("world", { name: "Boss One", password: "boss1", create: false }));
  const v = listen(await c.joinOrCreate("world", { name: "Vis", password: "visi1", create: true }));
  const w = matchMaker.getLocalRoomById(g.room.roomId) as unknown as WorldRoom;
  const p = w.state.players.get(g.room.sessionId)!;
  const ct = w.ctl.get(g.room.sessionId)!;
  const pv = w.state.players.get(v.room.sessionId)!;
  const cv = w.ctl.get(v.room.sessionId)!;
  assert.equal(p.gm, true);
  const run = async (text: string) => {
    const n = g.notices.length;
    g.room.send(Msg.Chat, { text });
    await until(() => g.notices.length > n, 4000, text);
    return g.notices.slice(n);
  };

  assert.ok((await run("/help")).length >= 1);
  await run("/level 20");
  assert.equal(p.level, 20);
  assert.equal(p.hp, p.maxHp);
  await run("/level 9999");
  assert.equal(p.level, 60);
  await run("/level abc");
  assert.equal(p.level, 60);
  await run("/gold 500");
  await run("/gold -99999");
  assert.equal(ct.gold, 0, "never below zero");
  await run("/gold 70 @Vis");
  assert.equal(cv.gold, 70);
  await run("/give ore_1 50 @vis");
  assert.equal(countItem(cv.inv.bag, "ore_1"), 50);
  await run("/give sword_2 1 3");
  const sword = ct.inv.bag.find((s) => s.id === "sword_2")!;
  assert.equal(sword.quality, 3);
  assert.equal(Object.keys(sword.affixes!).length, 3);
  await run("/give constructor 1");
  await run("/give sword_1 999");
  assert.equal(ct.inv.bag.length, 30, "stops when the bag is full");
  await run("/job squire");
  assert.equal(p.job, "squire");
  await run("/smith 100");
  assert.equal(ct.inv.smithing, 100);

  await run("/tp 27 22");
  assert.deepEqual([p.x, p.y], [27, 22]);
  await run("/tp 0 0"); // a tree
  assert.deepEqual([p.x, p.y], [27, 22]);
  await run("/bring @Vis");
  assert.deepEqual([pv.x, pv.y], [27, 22]);
  await run("/bring @Ghost");
  await run("/kick"); // needs a name; must not kick ourselves
  assert.ok(w.state.players.has(g.room.sessionId));

  const before = w.state.monsters.size;
  await run("/spawn hen 3");
  assert.equal(w.state.monsters.size, before + 3);
  await run("/clear 100");
  assert.equal(w.state.monsters.size, 0);

  await run("/heal");
  await run("/god");
  (w as any).monsterHitsPlayer("m1", g.room.sessionId, 9999);
  assert.equal(p.hp, p.maxHp);
  (w as any).monsterHitsPlayer("m1", v.room.sessionId, 9999);
  assert.equal(pv.dead, true);

  g.room.send(Msg.Chat, { text: "/say ทดสอบ" });
  await until(() => v.chat.some((l) => l.system && l.text.includes("ทดสอบ")));
  await run("/kick @Vis");
  await until(() => !w.state.players.has(v.room.sessionId));

  // lower level: no more nodes than points
  await run("/level 3");
  for (const id of ["c_str", "r3", "s1"]) g.room.send(Msg.LearnPassive, { id });
  await until(() => ct.nodes.size === 3);
  await run("/level 1");
  assert.equal(ct.nodes.size, 1);

  // to the Hollow (even below level 10) and the admin rights come along
  g.room.send(Msg.Chat, { text: "/hollow" });
  await until(() => g.travel !== null, 4000, "hollow");
  const h = listen(await c.joinOrCreate("hollow", { ticket: g.travel.ticket }));
  await g.room.leave();
  g = h;
  await until(() => h.room.state.players?.has(h.room.sessionId));
  const hw = matchMaker.getLocalRoomById(h.room.roomId) as unknown as WorldRoom;
  assert.equal(hw.state.players.get(h.room.sessionId)!.gm, true);
  await run("/corrupt 60");
  await until(() => hw.state.players.get(h.room.sessionId)!.corruption >= 60);
  await run("/gates");
  h.room.send(Msg.Chat, { text: "/village" });
  await until(() => h.travel?.zone === "brindle");
  await h.room.leave();

  // taking the flag away works at the next login
  assert.equal(await setAdmin("Boss One", false), true);
  assert.deepEqual(await listAdmins(), []);
});
