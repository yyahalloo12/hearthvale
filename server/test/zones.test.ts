import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { reachableFrom } from "../../shared/hollow";
import { ITEMS, resourceAt } from "../../shared/items";
import { isWalkable } from "../../shared/map";
import { Msg, ROOM_OF, ZONE_ERROR } from "../../shared/protocol";
import { MONSTERS } from "../../shared/stats";
import { buildZone, ZONE_IDS, zoneId } from "../../shared/zones";
import { SPAWNS } from "../src/game/monsters";
import { WorldRoom } from "../src/rooms/WorldRoom";

process.env.HV_DB = ":memory:";
const PORT = 25674;
let gameServer: Server;
before(async () => {
  const httpServer = http.createServer();
  gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  for (const zone of ZONE_IDS) gameServer.define(ROOM_OF[zone], WorldRoom, { zone });
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

test("every map: arrivals, exits and monsters are on ground that connects", () => {
  assert.equal(zoneId("nowhere"), "brindle");
  for (const id of ZONE_IDS) {
    const map = buildZone(id);
    assert.equal(map.id, id);
    const ok = reachableFrom(map, map.spawn);
    const can = (p: { x: number; y: number }) => ok.has(p.y * map.width + p.x);
    for (const e of map.exits) {
      assert.ok(can(e), `${id} exit`);
      const there = buildZone(e.to);
      const okThere = reachableFrom(there, there.spawn);
      assert.ok(isWalkable(there, e.at.x, e.at.y) && okThere.has(e.at.y * there.width + e.at.x), `${id} -> ${e.to} arrival`);
      for (const back of there.exits) assert.ok(Math.hypot(back.x - e.at.x, back.y - e.at.y) > 2, "no bouncing straight back");
      for (const s of SPAWNS[e.to]) {
        const d = MONSTERS[s.kind];
        if (d.aggroRange && !d.patrol) assert.ok(Math.hypot(s.x - e.at.x, s.y - e.at.y) > s.radius + d.aggroRange, `${s.kind} next to the arrival in ${e.to}`);
      }
    }
    for (const s of SPAWNS[id]) {
      assert.ok(MONSTERS[s.kind], s.kind);
      let n = 0;
      for (let y = s.y - s.radius; y <= s.y + s.radius; y++)
        for (let x = s.x - s.radius; x <= s.x + s.radius; x++) if (x > 0 && y > 0 && x < map.width && y < map.height && can({ x, y })) n++;
      assert.ok(n >= s.count * 2, `${id} ${s.kind}@${s.x},${s.y}: ${n}`);
    }
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const r = resourceAt(map, x, y);
        if (r) assert.ok(ITEMS[r.item] && ITEMS[r.tool]);
      }
  }
});

test("walking onto an exit leads to the next map and back, and logging in returns there", async () => {
  const c = new Client(`ws://localhost:${PORT}`);
  let travel: any = null;
  const quiet = (r: any) => {
    r.onMessage(Msg.Travel, (e: any) => (travel = e));
    for (const m of [Msg.Notice, Msg.ChatLine, Msg.Private, Msg.Hit, Msg.ExpGain, Msg.LevelUp]) r.onMessage(m, () => {});
    return r;
  };
  let room = quiet(await c.joinOrCreate<any>("world", { name: "Walker", password: "walk1", create: true }));
  let w = matchMaker.getLocalRoomById(room.roomId) as unknown as WorldRoom;
  const exit = w.map.exits[0];
  Object.assign(w.state.players.get(room.sessionId)!, { x: exit.x - 3, y: exit.y });
  room.send(Msg.Move, { x: exit.x, y: exit.y });
  await until(() => travel !== null, 5000, "exit");
  assert.equal(travel.zone, "mossfen");
  let next = quiet(await c.joinOrCreate<any>("mossfen", { ticket: travel.ticket }));
  await room.leave();
  await until(() => next.state.players?.has(next.sessionId));
  const me = next.state.players.get(next.sessionId);
  assert.deepEqual([me.x, me.y], [exit.at.x, exit.at.y]);
  travel = null;
  await wait(300);
  assert.equal(travel, null, "stays");

  // log out and in: still in the forest
  await next.leave();
  await wait(150);
  await assert.rejects(c.joinOrCreate("world", { name: "Walker", password: "walk1", create: false }), (e: any) => String(e.message) === ZONE_ERROR + "mossfen");
  next = quiet(await c.joinOrCreate<any>("mossfen", { name: "Walker", password: "walk1", create: false }));
  w = matchMaker.getLocalRoomById(next.roomId) as unknown as WorldRoom;
  await until(() => w.state.players.has(next.sessionId));
  const p = w.state.players.get(next.sessionId)!;
  assert.equal(p.shielded, false);

  // dying here costs EXP, not items, and wakes you in the village
  p.exp = 10;
  (w as any).monsterHitsPlayer("m1", next.sessionId, 99999);
  assert.equal(p.dead, true);
  assert.equal(w.state.bundles.size, 0);
  await wait(2100);
  next.send(Msg.Respawn);
  await until(() => travel?.zone === "brindle", 4000, "respawn");
  await next.leave();
});
