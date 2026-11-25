import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canReach,
  canRefund,
  cleanNodes,
  describeMods,
  PASSIVE_EDGES,
  PASSIVE_NODES,
  passiveMods,
  PASSIVES,
  refundCost,
  rootsFor,
} from "../../shared/passives";
import { killGold, MONSTERS, playerStats } from "../../shared/stats";

test("the tree has 50 nodes, unique ids and valid links", () => {
  const real = PASSIVE_NODES.filter((n) => n.size !== "root");
  assert.equal(real.length, 50);
  assert.equal(PASSIVES.size, PASSIVE_NODES.length, "ids are unique");
  for (const [a, b] of PASSIVE_EDGES) assert.ok(PASSIVES.has(a) && PASSIVES.has(b) && a !== b, `${a}-${b}`);
  const keys = new Set(PASSIVE_EDGES.map(([a, b]) => [a, b].sort().join("|")));
  assert.equal(keys.size, PASSIVE_EDGES.length, "no link twice");
  for (const n of real) assert.ok(describeMods(n.mods).length || n.desc, `${n.id} says what it does`);
  // nodes must not overlap on screen
  for (const a of PASSIVE_NODES)
    for (const b of PASSIVE_NODES) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.75, `${a.id} and ${b.id} are too close`);
});

test("every node can be learned starting from the middle", () => {
  const all = PASSIVE_NODES.filter((n) => n.size !== "root").map((n) => n.id);
  const learned = new Set<string>();
  const grow = (job: string) => {
    for (let grew = true; grew; ) {
      grew = false;
      for (const id of all)
        if (canReach(id, learned, job)) {
          learned.add(id);
          grew = true;
        }
    }
  };
  grow("wanderer");
  // the squire gate is closed to wanderers, so a few nodes behind it are squire-only
  const beyond = all.filter((id) => !learned.has(id)).sort();
  assert.deepEqual(beyond, ["k_blood", "s11", "s12", "sn3"]);
  grow("squire");
  assert.equal(learned.size, 50);
});

test("nodes must touch, and giving one back must not cut off others", () => {
  assert.deepEqual(rootsFor("wanderer"), ["start"]);
  const learned = new Set<string>();
  assert.ok(canReach("c_str", learned, "wanderer"));
  assert.ok(!canReach("r3", learned, "wanderer"));
  assert.ok(!canReach("s11", learned, "wanderer"));
  assert.ok(canReach("s11", learned, "squire"));
  assert.ok(!canReach("start", learned, "wanderer"));
  assert.ok(!canReach("nope", learned, "wanderer"));
  learned.add("c_str").add("r3").add("s1");
  assert.ok(!canReach("s1", learned, "wanderer"), "already learned");
  assert.ok(!canRefund("c_str", learned, "wanderer"));
  assert.ok(canRefund("s1", learned, "wanderer"));
  assert.ok(!canRefund("s2", learned, "wanderer"), "not learned");
  // a loop with two ways to the middle, so one of them can go
  const loop = new Set(["c_agi", "r0", "r1", "r2", "r3", "c_str"]);
  assert.ok(canRefund("c_str", loop, "wanderer"));
});

test("saved nodes are cleaned", () => {
  assert.deepEqual([...cleanNodes(["r3", "c_str", "nope", 5, "start"], 10, "wanderer")].sort(), ["c_str", "r3"]);
  assert.deepEqual([...cleanNodes(["fn1"], 10, "wanderer")], [], "not connected");
  assert.equal(cleanNodes(["c_str", "r3", "s1"], 2, "wanderer").size, 2, "no more than the points earned");
  assert.equal(cleanNodes("bad", 10, "wanderer").size, 0);
});

test("bonuses change stats", () => {
  const base = playerStats(10, "squire");
  const str = playerStats(10, "squire", passiveMods(["c_str", "s1", "s2"]));
  assert.ok(str.atk > base.atk);
  assert.equal(str.maxHp, base.maxHp);
  const tank = playerStats(10, "squire", passiveMods(["r2"]));
  assert.ok(tank.maxHp > base.maxHp && tank.def > base.def);
  assert.deepEqual(playerStats(10, "squire", passiveMods([])), base);
  assert.equal(passiveMods(["s7", "s12"]).lifesteal, 4);
  assert.equal(passiveMods(["s7", "s12", "k_blood"]).lifesteal, 12);
  assert.ok(refundCost(20) > refundCost(10));
  for (const def of Object.values(MONSTERS)) {
    assert.equal(killGold(def, 0), def.gold[0]);
    assert.equal(killGold(def, 0.9999), def.gold[1]);
  }
});
