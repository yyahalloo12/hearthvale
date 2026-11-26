/**
 * Adds the accessories, off-hands and legendary uniques to items.json and
 * their recipes to recipes.json. Safe to run again: it replaces its own
 * entries and leaves the rest alone.
 *
 *   node art/gear-gen.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const ITEMS = new URL("../shared/data/items.json", import.meta.url);
const RECIPES = new URL("../shared/data/recipes.json", import.meta.url);
const items = JSON.parse(readFileSync(ITEMS, "utf8"));
const recipes = JSON.parse(readFileSync(RECIPES, "utf8"));

const LEVEL = { 1: 1, 2: 8, 3: 14 };
const PRICE = { 1: 12, 2: 28, 3: 60 };
const SKILL = { 1: [0, 40], 2: [15, 70], 3: [35, 100] };
const MAT = {
  ore: { 1: "ore_1", 2: "ore_2", 3: "ore_3" },
  wood: { 1: "wood_1", 2: "wood_2", 3: "wood_3" },
  hide: { 1: "hide_1", 2: "hide_2", 3: "hide_2" },
  herb: { 1: "herb_1", 2: "herb_2", 3: "herb_2" },
};

// kind, slot, craft, jobs, names per tier, stats per tier, recipe
const BASES = [
  ["shield", "offhand", "smith", ["wanderer", "squire"], ["โล่ไม้หุ้มทองแดง", "โล่เหล็ก", "โล่หมอกเงิน"], (t) => ({ def: 2 * t + 1, hp: 8 * t, mods: { dmgReduce: t } }), (t) => ({ [MAT.ore[t]]: 3 + t, [MAT.wood[t]]: 2 })],
  ["quiver", "offhand", "wood", ["archer"], ["กระบอกธนูหนัง", "กระบอกธนูมอส", "กระบอกธนูไร้สี"], (t) => ({ atk: t + 1, mods: { critChance: t, attackSpeedPct: 2 * t } }), (t) => ({ [MAT.wood[t]]: 3, [MAT.hide[t]]: 2 + t })],
  ["tome", "offhand", "tailor", ["weaver", "acolyte"], ["คัมภีร์ใบหอม", "คัมภีร์เห็ดเรือง", "คัมภีร์ด้ายชะตา"], (t) => ({ hp: 4 * t, mods: { mpPct: 4 * t, skillDmgPct: 2 * t } }), (t) => ({ [MAT.herb[t]]: 3 + t, [MAT.wood[t]]: 2, ...(t === 3 ? { thread_3: 1 } : {}) })],
  ["gloves", "hands", "tailor", null, ["ถุงมือหนังกระต่าย", "ถุงมือหนังหมาป่า", "ถุงมือหนังเงา"], (t) => ({ atk: t, def: t, mods: { attackSpeedPct: 2 * t } }), (t) => ({ [MAT.hide[t]]: 2 + t, [MAT.herb[t]]: 1 })],
  ["amulet", "neck", "smith", null, ["สร้อยทองแดง", "สร้อยเหล็กลายมอส", "สร้อยหมอกม่วง"], (t) => ({ hp: 6 * t, mods: { hpPct: t + 1, regenPct: 5 * t } }), (t) => ({ [MAT.ore[t]]: 2 + t, crystal_1: t === 1 ? 0 : 1 })],
  ["ring", "ring", "smith", null, ["แหวนทองแดง", "แหวนเหล็ก", "แหวนหมอก"], (t) => ({ atk: t, mods: { critChance: t, skillDmgPct: t } }), (t) => ({ [MAT.ore[t]]: 2 + t })],
  ["belt", "belt", "tailor", null, ["เข็มขัดหนัง", "เข็มขัดหนังหนา", "เข็มขัดด้ายชะตา"], (t) => ({ hp: 10 * t, def: t, mods: { hpPct: t } }), (t) => ({ [MAT.hide[t]]: 3 + t, ...(t === 3 ? { thread_3: 1 } : {}) })],
  ["cloak", "cloak", "tailor", null, ["ผ้าคลุมเดินทาง", "ผ้าคลุมมอส", "ผ้าคลุมไร้สี"], (t) => ({ def: t + 1, mods: { dodge: t, moveSpeedPct: t } }), (t) => ({ [MAT.hide[t]]: 2, [MAT.herb[t]]: 2 + t })],
];

// legendary uniques: fixed bonuses that bend how skills work
const UNIQUES = [
  ["u_bow_thousand", "ธนูพันดอก", "weapon", ["archer"], 3, { look: "bow", atk: 20, mods: { extraProjectiles: 2, attackSpeedPct: -10, critChance: 3 } }, "ทุกการยิงแตกเป็นลูกศรเพิ่มอีก 2 ดอก"],
  ["u_staff_wildfire", "คทาไฟป่า", "weapon", ["weaver", "acolyte"], 3, { look: "staff", atk: 19, mods: { aoePct: 35, skillDmgPct: 8 } }, "เวทวงกว้างลุกลามกว้างขึ้นมาก"],
  ["u_axe_reaper", "ขวานเกี่ยววิญญาณ", "weapon", ["wanderer", "squire"], 3, { look: "axe", atk: 26, mods: { meleeSplash: 45, lifesteal: 3, attackSpeedPct: -8 } }, "ทุกการฟันกวาดโดนศัตรูรอบเป้าหมาย"],
  ["u_shield_bastion", "โล่ป้อมปราการ", "offhand", ["wanderer", "squire"], 3, { def: 12, hp: 30, mods: { dmgReduce: 8, stunPct: 35 } }, "มึนนานขึ้น และแทบไม่สะเทือน"],
  ["u_quiver_rain", "กระบอกห่าฝน", "offhand", ["archer"], 2, { atk: 4, mods: { extraProjectiles: 1, critDmgPct: 25 } }, "ลูกศรเพิ่ม 1 ดอกทุกครั้งที่ยิง"],
  ["u_tome_eternity", "คัมภีร์นิรันดร์", "offhand", ["weaver", "acolyte"], 3, { hp: 15, mods: { manaCostPct: 20, mpPct: 25, cdrPct: 6 } }, "ร่ายได้แทบไม่รู้จบ"],
  ["u_ring_storm", "แหวนพายุ", "ring", null, 2, { atk: 3, mods: { chainJumps: 2, critChance: 3 } }, "สายฟ้าลูกโซ่กระโดดเพิ่ม 2 ครั้ง"],
  ["u_ring_blood", "แหวนโลหิต", "ring", null, 2, { atk: 4, mods: { lifesteal: 4, atkPct: 6 } }, "ดูดเลือดจากทุกการโจมตี"],
  ["u_amulet_dawn", "สร้อยรุ่งอรุณ", "neck", null, 3, { hp: 25, mods: { healPct: 30, durationPct: 20 } }, "รักษาแรงขึ้นและพรอยู่นานขึ้น"],
  ["u_cloak_shadow", "ผ้าคลุมเงา", "cloak", null, 2, { def: 3, mods: { dodge: 8, moveSpeedPct: 8 } }, "เบาเหมือนเงา"],
  ["u_gloves_twin", "ถุงมือแฝด", "hands", null, 3, { atk: 4, mods: { multiStrike: 15, attackSpeedPct: 6 } }, "สกิลโจมตีมีโอกาสตีซ้ำสูง"],
  ["u_belt_titan", "เข็มขัดไททัน", "belt", null, 3, { hp: 40, mods: { hpPct: 12, lowHpDmgPct: 25 } }, "ยิ่งใกล้ตายยิ่งแรง"],
];

const ours = new Set();
for (const [kind, slot, craft, jobs, names, stats, needs] of BASES)
  for (const t of [1, 2, 3]) {
    const id = `${kind}_${t}`;
    ours.add(id);
    items[id] = { name: names[t - 1], kind: "equip", slot, tier: t, level: LEVEL[t], icon: "", price: PRICE[t], ...(jobs ? { jobs } : {}), ...stats(t) };
    const n = needs(t);
    for (const k of Object.keys(n)) if (!n[k]) delete n[k];
    const [minSkill, maxSkill] = SKILL[t];
    const r = { item: id, minSkill, maxSkill, needs: n };
    if (craft !== "smith") r.craft = craft;
    const i = recipes.findIndex((x) => x.item === id);
    if (i >= 0) recipes[i] = r;
    else recipes.push(r);
  }
for (const [id, name, slot, jobs, tier, stats, desc] of UNIQUES) {
  ours.add(id);
  items[id] = { name, kind: "equip", slot, tier, level: tier === 3 ? 18 : 10, icon: "", price: 200 * tier, unique: true, desc, ...(jobs ? { jobs } : {}), ...stats };
}
writeFileSync(ITEMS, JSON.stringify(items, null, 2) + "\n");
writeFileSync(RECIPES, JSON.stringify(recipes, null, 1) + "\n");
console.log(`${ours.size} gear items, ${recipes.length} recipes`);
