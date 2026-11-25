import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addItem,
  BAG_SIZE,
  cleanInventory,
  countItem,
  craft,
  emptyInventory,
  equipItem,
  equipTotals,
  findStation,
  itemFlat,
  ITEMS,
  ItemStack,
  moveStack,
  qualityChances,
  RECIPES,
  resourceAt,
  rollAffixes,
  rollDrops,
  rollQuality,
  sellPrice,
  skillGainChance,
  takeItems,
  unequipItem,
} from "../../shared/items";
import { buildBrindleVillage, isWalkable } from "../../shared/map";
import { passiveMods } from "../../shared/passives";
import { findPath } from "../../shared/pathfinding";
import { MONSTERS, playerStats } from "../../shared/stats";

test("recipes, drops and resources use known items", () => {
  for (const r of RECIPES) {
    assert.equal(ITEMS[r.item]?.kind, "equip", r.item);
    for (const id of Object.keys(r.needs)) assert.equal(ITEMS[id]?.kind, "material", id);
    // selling a plain crafted item must not be the best use of a whole day of mining, but must beat nothing
    assert.ok(sellPrice({ uid: "", id: r.item, qty: 1 }) >= 1);
  }
  for (const m of Object.values(MONSTERS)) for (const d of m.drops ?? []) assert.ok(ITEMS[d.item] && (!d.tool || ITEMS[d.tool]));
  for (const d of Object.values(ITEMS)) if (d.buy) assert.ok(d.buy > d.price, "no money from buying and selling");
});

test("stacks fill up, overflow is reported, and taking is all or nothing", () => {
  const bag: ItemStack[] = [];
  assert.equal(addItem(bag, 2, "ore_1", 150), 0);
  assert.deepEqual(bag.map((s) => s.qty), [99, 51]);
  assert.equal(addItem(bag, 2, "ore_1", 100), 52, "48 fit, 52 do not");
  assert.equal(addItem(bag, 2, "wood_1", 1), 1, "no slot left");
  assert.equal(takeItems(bag, "ore_1", 199), false);
  assert.equal(countItem(bag, "ore_1"), 198);
  assert.equal(takeItems(bag, "ore_1", 120), true);
  assert.equal(countItem(bag, "ore_1"), 78);
  // tools do not stack
  const tools: ItemStack[] = [];
  addItem(tools, 5, "pickaxe", 2);
  assert.equal(tools.length, 2);
  assert.notEqual(tools[0].uid, tools[1].uid);
});

test("moving a stack never makes or loses items", () => {
  const a: ItemStack[] = [];
  const b: ItemStack[] = [];
  addItem(a, 10, "ore_1", 80);
  addItem(b, 1, "ore_1", 60);
  assert.equal(moveStack(a, b, 1, a[0].uid), true);
  assert.equal(countItem(a, "ore_1"), 41);
  assert.equal(countItem(b, "ore_1"), 99);
  assert.equal(moveStack(a, b, 1, a[0].uid), false, "full");
  assert.equal(countItem(a, "ore_1") + countItem(b, "ore_1"), 140);
  assert.equal(moveStack(a, b, 1, "nope"), false);
});

test("wearing gear changes stats, and swapping keeps both items", () => {
  const inv = emptyInventory();
  addItem(inv.bag, BAG_SIZE, "sword_1", 1);
  addItem(inv.bag, BAG_SIZE, "axe_1", 1);
  addItem(inv.bag, BAG_SIZE, "armor_2", 1);
  addItem(inv.bag, BAG_SIZE, "ore_1", 1);
  const [sword, axe, armor2, ore] = inv.bag.map((s) => s.uid);
  assert.ok(equipItem(inv, armor2, 5), "level too low");
  assert.ok(equipItem(inv, ore, 60), "cannot wear a rock");
  assert.ok(equipItem(inv, "nope", 60));
  assert.equal(equipItem(inv, sword, 1), null);
  assert.equal(equipItem(inv, axe, 1), null);
  assert.equal(inv.equip.weapon?.id, "axe_1");
  assert.ok(inv.bag.some((s) => s.uid === sword));
  const worn = equipTotals(inv.equip);
  assert.equal(worn.flat.atk, 8);
  assert.equal(worn.mods.attackSpeedPct, -8);
  const bare = playerStats(5, "squire");
  const geared = playerStats(5, "squire", passiveMods([], worn.mods), worn.flat);
  assert.equal(geared.atk, bare.atk + 8);
  assert.equal(unequipItem(inv, "weapon"), null);
  assert.ok(!("weapon" in inv.equip));
  // a full bag cannot take the weapon back
  assert.equal(equipItem(inv, axe, 1), null);
  while (inv.bag.length < BAG_SIZE) addItem(inv.bag, BAG_SIZE, "pickaxe", 1);
  assert.ok(unequipItem(inv, "weapon"));
  assert.equal(inv.equip.weapon?.id, "axe_1");
  // but swapping still works with a full bag
  assert.equal(equipItem(inv, sword, 1), null);
  assert.equal(inv.bag.length, BAG_SIZE);
});

test("crafting uses the materials once, or nothing at all", () => {
  const inv = emptyInventory();
  addItem(inv.bag, BAG_SIZE, "ore_1", 5);
  addItem(inv.bag, BAG_SIZE, "wood_1", 1);
  assert.ok("error" in craft(inv, "sword_1", false, "Ploy"));
  assert.equal(countItem(inv.bag, "ore_1"), 5, "nothing used when wood is missing");
  addItem(inv.bag, BAG_SIZE, "wood_1", 1);
  assert.ok("error" in craft(inv, "sword_1", true, "Ploy"), "no crystal");
  assert.equal(countItem(inv.bag, "ore_1"), 5);
  const r = craft(inv, "sword_1", false, "Ploy", () => 0.999);
  assert.ok("made" in r);
  assert.equal(r.made.maker, "Ploy");
  assert.equal(r.made.quality, 0);
  assert.deepEqual(inv.bag.map((s) => s.id), ["sword_1"]);
  assert.ok("error" in craft(inv, "sword_2", false, "Ploy"), "skill too low");
  assert.ok("error" in craft(inv, "ore_1", false, "Ploy"), "no such recipe");

  // a bag with no free slot after using materials
  const full = emptyInventory();
  addItem(full.bag, BAG_SIZE, "ore_1", 90);
  addItem(full.bag, BAG_SIZE, "wood_1", 90);
  while (full.bag.length < BAG_SIZE) addItem(full.bag, BAG_SIZE, "pickaxe", 1);
  assert.ok("error" in craft(full, "sword_1", false, "Ploy"));
  assert.equal(countItem(full.bag, "ore_1"), 90);
});

test("quality: better skill and crystals help, and give more bonuses", () => {
  assert.equal(rollQuality(0, false, 0.005), 3);
  assert.equal(rollQuality(0, false, 0.99), 0);
  const low = qualityChances(0, false);
  const high = qualityChances(100, true);
  low.forEach((c, i) => assert.ok(high[i] > c));
  assert.ok(high.reduce((a, b) => a + b) <= 1);
  assert.equal(Object.keys(rollAffixes(0, 1)!).length, 0);
  assert.equal(Object.keys(rollAffixes(3, 2)!).length, 3);
  const plain = itemFlat({ uid: "", id: "sword_2", qty: 1 });
  const best = itemFlat({ uid: "", id: "sword_2", qty: 1, quality: 3 });
  assert.ok(best.atk > plain.atk);
  const r = RECIPES[0];
  assert.ok(skillGainChance(0, r) > skillGainChance(30, r));
  assert.equal(skillGainChance(r.maxSkill, r), 0);
});

test("hides need a knife", () => {
  const bag: ItemStack[] = [];
  assert.equal(rollDrops(MONSTERS.rat.drops, bag, () => 0).some((d) => d.id === "hide_1"), false);
  addItem(bag, 5, "knife", 1);
  assert.equal(rollDrops(MONSTERS.rat.drops, bag, () => 0).some((d) => d.id === "hide_1"), true);
});

test("both ores, wood and the two stations can be reached", () => {
  const map = buildBrindleVillage();
  const reach: Record<string, number> = {};
  const beside = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if ((dx || dy) && isWalkable(map, x + dx, y + dy) && findPath(map, map.spawn, { x: x + dx, y: y + dy }, 200)) return true;
    return false;
  };
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const r = resourceAt(map, x, y);
      if (r && (reach[r.item] ?? 0) < 8 && beside(x, y)) reach[r.item] = (reach[r.item] ?? 0) + 1;
    }
  assert.deepEqual(reach, { wood_1: 8, ore_1: 8, ore_2: 8 });
  for (const kind of ["smith", "storage"] as const) {
    const at = findStation(map, kind)!;
    assert.ok(at && beside(at.x, at.y), kind);
  }
});

test("saved inventories are cleaned", () => {
  const inv = cleanInventory({
    bag: [
      { uid: "a", id: "ore_1", qty: 500 },
      { uid: "a", id: "ore_1", qty: 5 },
      { uid: "b", id: "gone_item", qty: 5 },
      { uid: "c", id: "sword_1", qty: 9, quality: 7, affixes: { str: 3, bloodthirst: 1 } },
      null,
    ],
    equip: { weapon: { uid: "d", id: "helm_1", qty: 1 }, head: { uid: "e", id: "helm_1", qty: 1 } },
    smithing: 500,
  });
  assert.deepEqual(inv.bag.map((s) => [s.uid, s.qty]), [["a", 99], ["c", 1]]);
  assert.equal(inv.bag[1].quality, 3);
  assert.deepEqual(inv.bag[1].affixes, { str: 3 });
  assert.equal(inv.equip.weapon, undefined);
  assert.equal(inv.equip.head?.uid, "e");
  assert.equal(inv.smithing, 100);
  assert.deepEqual(cleanInventory("bad"), emptyInventory());
});
