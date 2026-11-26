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
  SKILL_MODS,
} from "../../shared/passives";
import { killGold, MONSTERS, playerStats } from "../../shared/stats";

test("the tree has over 200 nodes, unique ids, valid links, and room between nodes", () => {
  const real = PASSIVE_NODES.filter((n) => n.size !== "root");
  assert.ok(real.length >= 200, `${real.length} nodes`);
  assert.ok(real.filter((n) => n.size === "keystone").length >= 10);
  assert.ok(real.filter((n) => n.size === "notable").length >= 40);
  assert.equal(PASSIVES.size, PASSIVE_NODES.length, "ids are unique");
  for (const [a, b] of PASSIVE_EDGES) assert.ok(PASSIVES.has(a) && PASSIVES.has(b) && a !== b, `${a}-${b}`);
  const keys = new Set(PASSIVE_EDGES.map(([a, b]) => [a, b].sort().join("|")));
  assert.equal(keys.size, PASSIVE_EDGES.length, "no link twice");
  for (const n of real) assert.ok(describeMods(n.mods).length || n.desc, `${n.id} says what it does`);
  for (const a of PASSIVE_NODES)
    for (const b of PASSIVE_NODES) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.7, `${a.id} and ${b.id} are too close`);
  // plenty of nodes change how skills work, and some give extra arrows
  const skillNodes = real.filter((n) => Object.keys(n.mods).some((k) => SKILL_MODS.has(k as never)));
  assert.ok(skillNodes.length >= 40, `${skillNodes.length} skill nodes`);
  assert.ok(real.filter((n) => (n.mods.extraProjectiles ?? 0) > 0).length >= 4);
});

test("every node can be learned, each job also through its own gate", () => {
  const all = PASSIVE_NODES.filter((n) => n.size !== "root").map((n) => n.id);
  for (const job of ["wanderer", "squire", "archer", "weaver", "acolyte", "reaver"]) {
    const learned = new Set<string>();
    for (let grew = true; grew; ) {
      grew = false;
      for (const id of all)
        if (canReach(id, learned, job)) {
          learned.add(id);
          grew = true;
        }
    }
    assert.equal(learned.size, all.length, job);
  }
  // a job starts at its gate too
  assert.ok(canReach("str_b1_0", new Set(), "squire"));
  assert.ok(!canReach("str_b1_0", new Set(), "archer"));
  assert.ok(canReach("str_b1_0", new Set(), "warden"), "second jobs start at their main job's gate");
});

test("nodes must touch, and giving one back must not cut off others", () => {
  assert.deepEqual(rootsFor("wanderer"), ["start"]);
  const learned = new Set<string>();
  assert.ok(canReach("c_str", learned, "wanderer"));
  assert.ok(!canReach("start", learned, "wanderer"));
  assert.ok(!canReach("nope", learned, "wanderer"));
  learned.add("c_str").add("r4").add("str_t1");
  assert.ok(!canReach("str_t1", learned, "wanderer"), "already learned");
  assert.ok(!canRefund("c_str", learned, "wanderer"));
  assert.ok(canRefund("str_t1", learned, "wanderer"));
});

test("saved nodes are cleaned", () => {
  assert.deepEqual([...cleanNodes(["r4", "c_str", "nope", 5, "start"], 10, "wanderer")].sort(), ["c_str", "r4"]);
  assert.deepEqual([...cleanNodes(["k_glass"], 10, "wanderer")], [], "not connected");
  assert.equal(cleanNodes(["c_str", "r4", "str_t1"], 2, "wanderer").size, 2, "no more than the points earned");
  assert.equal(cleanNodes("bad", 10, "wanderer").size, 0);
});

test("bonuses change stats, keystones trade something away", () => {
  const base = playerStats(10, "squire");
  const str = playerStats(10, "squire", passiveMods(["c_str", "str_t1"]));
  assert.ok(str.atk > base.atk);
  assert.deepEqual(playerStats(10, "squire", passiveMods([])), base);
  assert.ok(passiveMods(["k_barrage"]).extraProjectiles === 3 && passiveMods(["k_barrage"]).attackSpeedPct < 0);
  assert.ok(passiveMods(["k_glass"]).skillDmgPct > 30 && playerStats(10, "weaver", passiveMods(["k_glass"])).maxHp < playerStats(10, "weaver").maxHp);
  assert.ok(playerStats(10, "weaver", passiveMods(["int_b0_3"])).maxMp >= playerStats(10, "weaver").maxMp);
  assert.ok(describeMods(passiveMods(["k_berserk"])).some((l) => l.includes("-30")), "negative bonuses read right");
  assert.ok(refundCost(20) > refundCost(10));
  for (const def of Object.values(MONSTERS)) {
    assert.equal(killGold(def, 0), def.gold[0]);
    assert.equal(killGold(def, 0.9999), def.gold[1]);
  }
});
