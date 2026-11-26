import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, Room } from "colyseus.js";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { darkness, DAY_MS, isNight, NIGHT_MS, untilChange } from "../../shared/daylight";
import { buildHollow } from "../../shared/hollow";
import { countItem, findStation, stationAt } from "../../shared/items";
import { GameMap, isWalkable, Prop, Tile } from "../../shared/map";
import { GROVE, LANTERNS } from "../../shared/mossfen";
import { findPath } from "../../shared/pathfinding";
import { Msg, ROOM_OF } from "../../shared/protocol";
import { canStep, grid, heightAt, inReach, levelOf, lineOfSight, mesa, reachableFrom, setRegion } from "../../shared/terrain";
import { buildZone, ZONE_IDS } from "../../shared/zones";
import { loadCharacter, saveCharacter } from "../src/db";
import { WorldRoom } from "../src/rooms/WorldRoom";

process.env.HV_DB = ":memory:";
const PORT = 25676;
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
function flat(n: number): GameMap {
  return {
    id: "brindle", name: "t", pvp: false, width: n, height: n, tiles: grid<Tile>(n, n, Tile.Grass), props: grid<Prop>(n, n, Prop.None),
    spawn: { x: 1, y: 1 }, safe: { x: -9, y: -9, r: 0 }, exits: [], level: grid(n, n, 0), ramp: grid(n, n, 0), regions: {}, closed: new Set(), springs: [], quiet: [],
  };
}

test("maps are three times as big and have real height, all of it reachable by ramps", () => {
  const old = { brindle: 48 * 48, mossfen: 64 * 64, hollow: 72 * 72 };
  for (const id of ZONE_IDS) {
    const m = buildZone(id);
    const area = m.width * m.height;
    assert.ok(area / old[id] > 2.95 && area / old[id] < 3.15, `${id} ${area / old[id]}`);
    const ok = reachableFrom(m, m.spawn);
    const levels = new Set<number>();
    for (const k of ok) levels.add(m.level[Math.floor(k / m.width)][k % m.width]);
    assert.ok(levels.size >= 2, `${id} has levels ${[...levels]}`);
    // most high ground can be walked to (the fog grove opens later)
    for (const r of Object.keys(m.regions)) setRegion(m, r, false);
    const open = reachableFrom(m, m.spawn);
    let high = 0;
    let got = 0;
    for (let y = 0; y < m.height; y++)
      for (let x = 0; x < m.width; x++)
        if (m.level[y][x] > 0 && isWalkable(m, x, y)) {
          high++;
          if (open.has(y * m.width + x)) got++;
        }
    assert.ok(got / high > 0.85, `${id}: ${got}/${high} of the high ground`);
  }
});

test("cliffs block, ramps lead up, and no step changes height by more than a ramp", () => {
  const m = flat(30);
  mesa(m, 15, 15, 6, 6, "s");
  assert.equal(levelOf(m, 15, 15), 1);
  assert.equal(heightAt(m, 15, 15), 1);
  const path = findPath(m, { x: 15, y: 3 }, { x: 15, y: 15 }, 100);
  assert.ok(path, "there is a way up");
  let used = 0;
  let prev = { x: 15, y: 3 };
  for (const p of path!) {
    assert.ok(canStep(m, prev.x, prev.y, p.x, p.y));
    if (m.ramp[p.y][p.x]) used++;
    // the ground is smooth along the whole step
    let h = heightAt(m, prev.x, prev.y);
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const next = heightAt(m, prev.x + (p.x - prev.x) * t, prev.y + (p.y - prev.y) * t);
      assert.ok(Math.abs(next - h) < 0.12, "no jump");
      h = next;
    }
    prev = p;
  }
  assert.ok(used > 0, "over the ramp");
  // straight over the north edge is not possible
  let edge = 15;
  while (levelOf(m, 15, edge) === 1) edge--;
  assert.equal(canStep(m, 15, edge, 15, edge + 1), false);
  m.ramp = grid(30, 30, 0);
  assert.equal(findPath(m, { x: 15, y: 3 }, { x: 15, y: 15 }, 100), null, "without a ramp there is no way");
});

test("every step in every real map keeps the ground smooth", () => {
  for (const id of ZONE_IDS) {
    const m = buildZone(id);
    for (const k of reachableFrom(m, m.spawn)) {
      const x = k % m.width;
      const y = Math.floor(k / m.width);
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        if (!canStep(m, x, y, x + dx, y + dy)) continue;
        assert.ok(canStep(m, x + dx, y + dy, x, y), "and back again");
        for (let t = 0; t < 1; t += 0.25) {
          const a = heightAt(m, x + dx * t, y + dy * t);
          const b = heightAt(m, x + dx * (t + 0.25), y + dy * (t + 0.25));
          assert.ok(Math.abs(a - b) <= 0.5 + 1e-6, `${id} ${x},${y} -> ${dx},${dy}: ${a} ${b}`);
        }
      }
    }
  }
});

test("view and reach: cliffs and houses block shots, and nobody punches up a cliff", () => {
  const m = flat(30);
  mesa(m, 15, 15, 4, 4, "");
  assert.equal(lineOfSight(m, { x: 8, y: 15 }, { x: 22, y: 15 }), false, "hill between");
  assert.equal(lineOfSight(m, { x: 8, y: 15 }, { x: 15, y: 15 }), true, "up onto it");
  assert.equal(inReach(m, { x: 10, y: 15 }, { x: 11, y: 15 }, 1.6), false, "melee at the cliff");
  assert.equal(inReach(m, { x: 10, y: 15 }, { x: 11, y: 15 }, 5), true, "but a bow can");
  m.props[5][5] = Prop.House;
  assert.equal(lineOfSight(m, { x: 3, y: 5 }, { x: 8, y: 5 }), false);
});

test("day and night", () => {
  assert.equal(isNight(1000), false);
  assert.equal(isNight(DAY_MS + 1), true);
  assert.equal(isNight(DAY_MS + NIGHT_MS + 1), false);
  assert.equal(darkness(DAY_MS / 2), 0);
  assert.equal(darkness(DAY_MS + NIGHT_MS / 2), 1);
  for (let t = 0; t < DAY_MS + NIGHT_MS; t += 1000) assert.ok(darkness(t) >= 0 && darkness(t) <= 1 && untilChange(t) > 0);
});

test("the Hollow never falls apart: every gate and arrival stays connected with any crack open", () => {
  const m = buildHollow();
  for (const id of Object.keys(m.regions)) {
    setRegion(m, id, true);
    const ok = reachableFrom(m, m.spawn);
    for (const p of [...m.gateSpots, ...m.entries]) assert.ok(ok.has(p.y * m.width + p.x), id);
    for (const s of m.springs) assert.ok(ok.has(s.y * m.width + s.x), "spring");
    setRegion(m, id, false);
  }
  assert.equal(m.closed.size, 0);
});

// ---- in the running world ------------------------------------------------------

async function enter(room: string, name: string, create = true): Promise<{ r: Room<any>; w: WorldRoom; notices: string[]; travel: any[] }> {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate<any>(room, { name, password: "land1", create });
  const s = { r, w: matchMaker.getLocalRoomById(r.roomId) as unknown as WorldRoom, notices: [] as string[], travel: [] as any[] };
  r.onMessage(Msg.Notice, (n: any) => s.notices.push(n.text));
  r.onMessage(Msg.Travel, (e: any) => s.travel.push(e));
  for (const m of [Msg.ChatLine, Msg.Loot, Msg.Private, Msg.Gathering, Msg.Hit, Msg.ExpGain, Msg.LevelUp, Msg.OpenStation]) r.onMessage(m, () => {});
  await until(() => r.state.players?.has(r.sessionId));
  return s;
}
async function inZone(name: string, zone: "mossfen" | "hollow", x = -1, y = -1) {
  const a = await enter("world", name);
  const id = a.w.ctl.get(a.r.sessionId)!.accountId;
  await a.r.leave();
  await wait(120);
  await saveCharacter({ ...(await loadCharacter(id))!, level: 20, zone, x, y });
  return enter(ROOM_OF[zone], name, false);
}

test("a saved place that is cut off or solid now means a safe start instead", async () => {
  const s = await inZone("Lost1", "mossfen", GROVE.x, GROVE.y - 4); // up in the closed grove
  const p = s.w.state.players.get(s.r.sessionId)!;
  assert.ok(Math.hypot(p.x - s.w.map.spawn.x, p.y - s.w.map.spawn.y) < 6);
  await s.r.leave();
  // the old village places still hold
  const b = await enter("world", "Home1");
  const id = b.w.ctl.get(b.r.sessionId)!.accountId;
  await b.r.leave();
  await wait(120);
  await saveCharacter({ ...(await loadCharacter(id))!, x: 23, y: 27 });
  const back = await enter("world", "Home1", false);
  assert.deepEqual([back.w.state.players.get(back.r.sessionId)!.x, back.w.state.players.get(back.r.sessionId)!.y], [23, 27]);
  await back.r.leave();
});

test("Brindle: the windmill on its hill makes you faster", async () => {
  const s = await enter("world", "Windy1");
  const p = s.w.state.players.get(s.r.sessionId)!;
  const at = findStation(s.w.map, "windmill")!;
  assert.equal(levelOf(s.w.map, at.x, at.y), 3);
  // walk up from the foot of the hill, ramps and all
  Object.assign(p, { x: 38, y: 74 });
  s.r.send(Msg.Interact, { x: at.x, y: at.y + 1 });
  await until(() => p.windy, 15000, "walk up to the windmill");
  assert.equal(heightAt(s.w.map, p.x, p.y), 3);
  await s.r.leave();
});

test("Mossfen: three lanterns open the fog, the chest gives once each, and the fog closes again", async () => {
  const s = await inZone("Lamp1", "mossfen");
  const p = s.w.state.players.get(s.r.sessionId)!;
  const c = s.w.ctl.get(s.r.sessionId)!;
  assert.ok(s.w.state.closed.has("fog"));
  const up = { x: GROVE.x, y: GROVE.y - 1 };
  assert.equal(findPath(s.w.map, { x: GROVE.x, y: GROVE.y + 14 }, up, 80), null, "closed");
  for (const l of LANTERNS) {
    assert.equal(stationAt(s.w.map, l.x, l.y), "lantern");
    Object.assign(p, { x: l.x, y: l.y + 1 });
    s.r.send(Msg.Interact, l);
    await until(() => s.w.state.lit.has(`${l.x},${l.y}`), 3000, "lantern");
  }
  await until(() => !s.w.state.closed.has("fog"));
  await until(() => !s.r.state.closed.has("fog"), 2000, "client sees it");
  assert.ok(findPath(s.w.map, { x: GROVE.x, y: GROVE.y + 14 }, up, 80), "open");
  const chest = findStation(s.w.map, "treasure")!;
  Object.assign(p, { x: chest.x, y: chest.y + 1 });
  s.r.send(Msg.Interact, chest);
  await until(() => countItem(c.inv.bag, "crystal_1") >= 2, 3000, "chest");
  const gold = c.gold;
  const n = s.notices.length;
  s.r.send(Msg.Interact, chest);
  await until(() => s.notices.length > n);
  assert.equal(c.gold, gold, "only once");
  // time is up: closed, and we are carried down
  s.w.state.fogUntil = 1;
  await until(() => s.w.state.closed.has("fog"));
  assert.ok(levelOf(s.w.map, Math.round(p.x), Math.round(p.y)) < 2);
  assert.equal(s.w.state.lit.size, 0);
  await s.r.leave();
});

test("Hollow: the ground warns, falls and comes back; springs wash corruption away", async () => {
  const s = await inZone("Crack1", "hollow");
  const w = s.w as any;
  const p = s.w.state.players.get(s.r.sessionId)!;
  const c = s.w.ctl.get(s.r.sessionId)!;
  s.w.monsterSys.clearNear(62, 62, 200);
  c.corruption = 60;
  const spring = s.w.map.springs[0];
  Object.assign(p, { x: spring.x, y: spring.y });
  await until(() => p.inSpring && c.corruption < 59, 3000, "spring");
  w.crackAt = 1;
  await until(() => s.w.state.cracking !== "", 2000, "warning");
  const id = s.w.state.cracking;
  const k = s.w.map.regions[id][10];
  Object.assign(p, { x: k % s.w.map.width, y: Math.floor(k / s.w.map.width) });
  const hp = p.hp;
  w.crackEnds = 1;
  await until(() => s.w.state.closed.has(id), 2000, "fall");
  assert.ok(p.hp < hp && p.hp > 0);
  assert.ok(isWalkable(s.w.map, Math.round(p.x), Math.round(p.y)), "climbed out");
  w.crackEnds = 1;
  await until(() => !s.w.state.closed.size, 2000, "back");
  assert.ok(w.crackAt > Date.now());
  await s.r.leave();
});

test("scarecrows pay more at night", async () => {
  const s = await enter("world", "Night1");
  const c = s.w.ctl.get(s.r.sessionId)!;
  const p = s.w.state.players.get(s.r.sessionId)!;
  p.level = 8;
  const real = Date.now;
  const kill = () => {
    const before = new Set(s.w.state.monsters.keys());
    s.w.monsterSys.summon("scarecrow", 1, 26, 41);
    const id = [...s.w.state.monsters.keys()].find((k) => !before.has(k))!;
    s.w.state.monsters.get(id)!.hp = 1;
    s.w.monsterSys.ctl.get(id)!.exp = 100;
    const exp = p.exp;
    (s.w as any).playerHitsMonster(s.r.sessionId, p, c, id, 1);
    return p.exp - exp;
  };
  try {
    const t0 = real();
    const base = t0 - (t0 % (DAY_MS + NIGHT_MS));
    Date.now = () => base + 60_000;
    assert.equal(kill(), 100);
    Date.now = () => base + DAY_MS + 60_000;
    assert.equal(kill(), 150);
  } finally {
    Date.now = real;
  }
  await s.r.leave();
});

test("monsters live away from the village and the quiet gathering places", async () => {
  const { readFileSync } = await import("node:fs");
  const { buildZone } = await import("../../shared/zones");
  const { isCalm, isWalkable } = await import("../../shared/map");
  const { reachableFrom } = await import("../../shared/terrain");
  for (const [z, f] of [["brindle", "spawns"], ["mossfen", "spawns_mossfen"], ["hollow", "spawns_hollow"]] as const) {
    const m = buildZone(z);
    const reach = reachableFrom(m, m.spawn);
    const zones = [...m.quiet, ...(m.safe.r ? [m.safe] : [])];
    for (const s of JSON.parse(readFileSync(new URL(`../../shared/data/${f}.json`, import.meta.url), "utf8"))) {
      for (const q of zones) assert.ok(Math.hypot(s.x - q.x, s.y - q.y) >= q.r + s.radius + 4, `${z} ${s.kind} at ${s.x},${s.y} is too close to a quiet place`);
      let free = 0;
      for (let y = s.y - s.radius; y <= s.y + s.radius; y++)
        for (let x = s.x - s.radius; x <= s.x + s.radius; x++) if (isWalkable(m, x, y) && reach.has(y * m.width + x) && !isCalm(m, x, y)) free++;
      assert.ok(free >= s.count * 2, `${z} ${s.kind} at ${s.x},${s.y} has no room`);
    }
    // every quiet place can be reached and has things to gather
    for (const q of m.quiet) {
      let res = 0;
      let open = 0;
      for (let y = Math.floor(q.y - q.r); y <= q.y + q.r; y++)
        for (let x = Math.floor(q.x - q.r); x <= q.x + q.r; x++) {
          if (Math.hypot(x - q.x, y - q.y) >= q.r) continue;
          if (m.props[y]?.[x] === Prop.Rock || m.props[y]?.[x] === Prop.Bush) res++;
          if (reach.has(y * m.width + x)) open++;
        }
      assert.ok(res >= 15 && open > 100, `${z} ${q.name}: ${res} rocks/bushes, ${open} open tiles`);
    }
  }
});
