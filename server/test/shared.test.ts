import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBrindleVillage, isWalkable } from "../../shared/map";
import { cleanChat, cleanName } from "../../shared/names";
import { findPath } from "../../shared/pathfinding";
import { facingFor } from "../src/rooms/WorldRoom";

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
