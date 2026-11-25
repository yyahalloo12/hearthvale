import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBrindleVillage, isWalkable } from "../../shared/map";
import { cleanChat, cleanName } from "../../shared/names";
import { findPath } from "../../shared/pathfinding";
import { facingFor } from "../src/game/movement";
import spawns from "../../shared/data/spawns.json";
import { expToNext, hitDamage, killExp, MONSTERS, playerStats, SKILLS } from "../../shared/stats";

test("map is the same every time and spawn is walkable", () => {
  const a = buildBrindleVillage();
  const b = buildBrindleVillage();
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.props, b.props);
  assert.ok(isWalkable(a, a.spawn.x, a.spawn.y));
});

test("path goes around blocked tiles and never cuts corners", () => {
  const map = buildBrindleVillage();
  const path = findPath(map, map.spawn, { x: 24, y: 40 }, 80);
  assert.ok(path && path.length > 0);
  let prev = map.spawn;
  for (const p of path!) {
    assert.ok(isWalkable(map, p.x, p.y), `blocked step ${p.x},${p.y}`);
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1);
    if (dx && dy) {
      assert.ok(isWalkable(map, prev.x + dx, prev.y) && isWalkable(map, prev.x, prev.y + dy));
    }
    prev = p;
  }
  assert.deepEqual(prev, { x: 24, y: 40 });
});

test("no path into water, a tree or the well", () => {
  const map = buildBrindleVillage();
  assert.equal(findPath(map, map.spawn, { x: 36, y: 11 }), null); // pond
  assert.equal(findPath(map, map.spawn, { x: 0, y: 0 }), null); // tree border
  assert.equal(findPath(map, map.spawn, { x: 24, y: 24 }), null); // well
});

test("names and chat are cleaned", () => {
  assert.equal(cleanName("  พลอย  "), "พลอย");
  assert.equal(cleanName("a"), null);
  assert.equal(cleanName("<script>"), null);
  assert.equal(cleanName("x".repeat(17)), null);
  assert.equal(cleanChat("  hi\u0000 there ", 120), "hi there");
  assert.equal(cleanChat("   ", 120), null);
  assert.equal([...cleanChat("ก".repeat(200), 120)!].length, 120);
});

test("facing points the way the character walks on screen", () => {
  assert.equal(facingFor(1, 1), 0); // screen down
  assert.equal(facingFor(-1, 1), 2); // screen left
  assert.equal(facingFor(-1, -1), 4); // screen up
  assert.equal(facingFor(1, -1), 6); // screen right
});

test("every spawn area has walkable ground and a known monster", () => {
  const map = buildBrindleVillage();
  for (const s of spawns) {
    assert.ok(MONSTERS[s.kind], s.kind);
    let ok = 0;
    for (let y = s.y - s.radius; y <= s.y + s.radius; y++)
      for (let x = s.x - s.radius; x <= s.x + s.radius; x++) if (isWalkable(map, x, y)) ok++;
    assert.ok(ok >= s.count, `spawn ${s.kind}@${s.x},${s.y} has room`);
    // and can be reached from the village
    const tile = (() => {
      for (let y = s.y - s.radius; y <= s.y + s.radius; y++)
        for (let x = s.x - s.radius; x <= s.x + s.radius; x++) if (isWalkable(map, x, y)) return { x, y };
    })()!;
    assert.ok(findPath(map, map.spawn, tile, 200), `spawn ${s.kind} reachable`);
  }
});

test("formulas behave", () => {
  assert.equal(expToNext(1), 20);
  assert.ok(expToNext(10) > expToNext(9));
  assert.equal(expToNext(60), 0);
  assert.ok(playerStats(10, "squire").maxHp > playerStats(10, "wanderer").maxHp);
  assert.equal(hitDamage(1, 100), 1, "always at least 1 damage");
  assert.ok(hitDamage(20, 0, 1, 0.5, true) > hitDamage(20, 0, 1, 0.5, false));
  assert.ok(killExp(10, 1, 20) < 10, "far-too-easy kills give less");
  assert.equal(killExp(10, 5, 5), 10);
  for (const s of Object.values(SKILLS)) assert.equal(s.job, "squire");
});
