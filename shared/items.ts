/**
 * Items, bags, gear and crafting rules (GDD 4). Data is in data/items.json and
 * data/recipes.json. The server decides everything with these functions; the
 * client uses them to show names, numbers and what is possible.
 */
import itemsJson from "./data/items.json";
import recipesJson from "./data/recipes.json";
import { GameMap, Prop } from "./map";
import type { Mods, NumMod } from "./passives";

export type Slot = "weapon" | "head" | "body" | "feet";
export const SLOTS: Slot[] = ["weapon", "head", "body", "feet"];
export const SLOT_NAMES: Record<Slot, string> = { weapon: "อาวุธ", head: "หมวก", body: "เกราะ", feet: "รองเท้า" };

export const BAG_SIZE = 30;
export const STORAGE_SIZE = 80;
export const STACK_MAX = 99;
/** How close you must stand to the anvil or the chest. */
export const STATION_RANGE = 3;
export const GATHER_MS = 2500;

export interface ItemDef {
  name: string;
  kind: "material" | "tool" | "equip";
  tier: number;
  icon: string;
  /** coins the smith pays for one */
  price: number;
  /** coins to buy one from the smith */
  buy?: number;
  desc?: string;
  slot?: Slot;
  look?: "sword" | "axe" | "helm";
  level?: number;
  atk?: number;
  def?: number;
  hp?: number;
  mods?: Partial<Record<NumMod, number>>;
}
export const ITEMS = itemsJson as unknown as Record<string, ItemDef>;

export interface Recipe {
  item: string;
  minSkill: number;
  maxSkill: number;
  needs: Record<string, number>;
}
export const RECIPES = recipesJson as unknown as Recipe[];
export const CRYSTAL = "crystal_1";

export const QUALITY_NAMES = ["", "ระดับดี", "ชั้นเยี่ยม", "ผลงานชิ้นเอก"];
export const QUALITY_MULT = [1, 1.1, 1.2, 1.35];

export interface ItemStack {
  uid: string;
  id: string;
  qty: number;
  quality?: number;
  affixes?: Partial<Record<NumMod, number>>;
  /** who crafted it */
  maker?: string;
}

export interface Inventory {
  bag: ItemStack[];
  equip: Partial<Record<Slot, ItemStack>>;
  storage: ItemStack[];
  /** blacksmith skill, 0-100 */
  smithing: number;
}

export function emptyInventory(): Inventory {
  return { bag: [], equip: {}, storage: [], smithing: 0 };
}

const newUid = () => globalThis.crypto.randomUUID();
const isStackable = (id: string) => ITEMS[id]?.kind === "material";

// ---- bags -------------------------------------------------------------------

export function countItem(list: ItemStack[], id: string) {
  return list.reduce((n, s) => (s.id === id ? n + s.qty : n), 0);
}

/** Adds plain items (no quality). Returns how many did not fit. */
export function addItem(list: ItemStack[], cap: number, id: string, qty: number): number {
  let left = qty;
  if (isStackable(id))
    for (const s of list) {
      if (s.id !== id || left <= 0) continue;
      const n = Math.min(left, STACK_MAX - s.qty);
      s.qty += n;
      left -= n;
    }
  while (left > 0 && list.length < cap) {
    const n = isStackable(id) ? Math.min(left, STACK_MAX) : 1;
    list.push({ uid: newUid(), id, qty: n });
    left -= n;
  }
  return left;
}

/** Removes items; false (and nothing removed) when there are not enough. */
export function takeItems(list: ItemStack[], id: string, qty: number): boolean {
  if (countItem(list, id) < qty) return false;
  let left = qty;
  for (let i = list.length - 1; i >= 0 && left > 0; i--) {
    if (list[i].id !== id) continue;
    const n = Math.min(left, list[i].qty);
    list[i].qty -= n;
    left -= n;
    if (list[i].qty <= 0) list.splice(i, 1);
  }
  return true;
}

/** Moves one stack between two lists, as much as fits. True when anything moved. */
export function moveStack(from: ItemStack[], to: ItemStack[], cap: number, uid: string): boolean {
  const i = from.findIndex((s) => s.uid === uid);
  if (i < 0) return false;
  const s = from[i];
  if (isStackable(s.id)) {
    const left = addItem(to, cap, s.id, s.qty);
    if (left === s.qty) return false;
    if (left > 0) s.qty = left;
    else from.splice(i, 1);
    return true;
  }
  if (to.length >= cap) return false;
  from.splice(i, 1);
  to.push(s);
  return true;
}

/** Adds one stack, all of it or nothing. */
export function addStack(list: ItemStack[], cap: number, s: ItemStack): boolean {
  if (!isStackable(s.id)) {
    if (list.length >= cap) return false;
    list.push(s);
    return true;
  }
  const copy = list.map((x) => ({ ...x }));
  if (addItem(copy, cap, s.id, s.qty) > 0) return false;
  list.splice(0, list.length, ...copy);
  return true;
}

/** Takes `qty` pieces out of one stack; null when there are not that many. */
export function takeStack(list: ItemStack[], uid: string, qty: number): ItemStack | null {
  const i = list.findIndex((s) => s.uid === uid);
  if (i < 0 || qty < 1 || list[i].qty < qty) return null;
  const s = list[i];
  if (s.qty === qty) {
    list.splice(i, 1);
    return s;
  }
  s.qty -= qty;
  return { ...s, uid: newUid(), qty };
}

/** Puts gear on (swapping what was there back into the bag). Returns an error text or null. */
export function equipItem(inv: Inventory, uid: string, level: number): string | null {
  const i = inv.bag.findIndex((s) => s.uid === uid);
  const def = i >= 0 ? ITEMS[inv.bag[i].id] : undefined;
  if (!def?.slot) return "สวมใส่ของชิ้นนี้ไม่ได้";
  if (level < (def.level ?? 1)) return `ต้องเลเวล ${def.level} ขึ้นไป`;
  const [s] = inv.bag.splice(i, 1);
  const old = inv.equip[def.slot];
  if (old) inv.bag.push(old);
  inv.equip[def.slot] = s;
  return null;
}

export function unequipItem(inv: Inventory, slot: Slot): string | null {
  const s = inv.equip[slot];
  if (!s) return null;
  if (inv.bag.length >= BAG_SIZE) return "กระเป๋าเต็ม";
  delete inv.equip[slot];
  inv.bag.push(s);
  return null;
}

// ---- gear numbers -------------------------------------------------------------

export interface FlatStats {
  hp: number;
  atk: number;
  def: number;
}

export function itemFlat(s: ItemStack): FlatStats {
  const d = ITEMS[s.id];
  const k = QUALITY_MULT[s.quality ?? 0];
  const f = (v?: number) => Math.round((v ?? 0) * k);
  return { hp: f(d.hp), atk: f(d.atk), def: f(d.def) };
}

/** Everything worn, added up. */
export function equipTotals(equip: Inventory["equip"]): { flat: FlatStats; mods: Partial<Record<NumMod, number>> } {
  const flat = { hp: 0, atk: 0, def: 0 };
  const mods: Partial<Record<NumMod, number>> = {};
  for (const slot of SLOTS) {
    const s = equip[slot];
    if (!s) continue;
    const f = itemFlat(s);
    flat.hp += f.hp;
    flat.atk += f.atk;
    flat.def += f.def;
    for (const src of [ITEMS[s.id].mods, s.affixes])
      for (const [k, v] of Object.entries(src ?? {})) mods[k as NumMod] = (mods[k as NumMod] ?? 0) + (v as number);
  }
  return { flat, mods };
}

export function sellPrice(s: ItemStack): number {
  return Math.max(1, Math.round(ITEMS[s.id].price * QUALITY_MULT[s.quality ?? 0]));
}

export function stackName(s: ItemStack): string {
  const q = QUALITY_NAMES[s.quality ?? 0];
  return ITEMS[s.id].name + (q ? ` (${q})` : "");
}

// ---- crafting -----------------------------------------------------------------

/** Chances of each quality, best last. Better skill and a crystal help. */
export function qualityChances(skill: number, crystal: boolean): [number, number, number] {
  const s = skill / 100;
  const c = crystal ? 1 : 0;
  return [0.15 + 0.25 * s + 0.15 * c, 0.05 + 0.15 * s + 0.1 * c, 0.01 + 0.07 * s + 0.04 * c];
}

export function rollQuality(skill: number, crystal: boolean, roll = Math.random()): number {
  const [good, great, master] = qualityChances(skill, crystal);
  if (roll < master) return 3;
  if (roll < master + great) return 2;
  if (roll < master + great + good) return 1;
  return 0;
}

/** Random bonuses: [lowest, highest] for tier 1; tier 2 gets half as much again. */
const AFFIXES: Partial<Record<NumMod, [number, number]>> = {
  str: [2, 4],
  agi: [2, 4],
  int: [2, 4],
  fai: [2, 4],
  hpPct: [2, 4],
  atkPct: [1, 3],
  defPct: [2, 4],
  critChance: [1, 2],
  regenPct: [5, 12],
  dodge: [1, 2],
};

/** One bonus per quality step: good 1, excellent 2, masterpiece 3 (GDD 4.2). */
export function rollAffixes(quality: number, tier: number, rnd = Math.random): ItemStack["affixes"] {
  const pool = Object.entries(AFFIXES) as [NumMod, [number, number]][];
  const out: ItemStack["affixes"] = {};
  for (let i = 0; i < quality && pool.length; i++) {
    const [[key, [lo, hi]]] = pool.splice(Math.floor(rnd() * pool.length), 1);
    out[key] = Math.round((lo + rnd() * (hi - lo)) * (1 + 0.5 * (tier - 1)));
  }
  return out;
}

export function skillGainChance(skill: number, r: Recipe): number {
  if (skill >= r.maxSkill || skill >= 100) return 0;
  return 1 - 0.6 * ((skill - r.minSkill) / (r.maxSkill - r.minSkill));
}

/** Crafts one item. Either everything happens, or nothing does (and the error says why). */
export function craft(
  inv: Inventory,
  itemId: string,
  useCrystal: boolean,
  maker: string,
  rnd = Math.random,
): { error: string } | { made: ItemStack; skillUp: boolean } {
  const r = RECIPES.find((x) => x.item === itemId);
  if (!r) return { error: "ไม่มีสูตรนี้" };
  if (inv.smithing < r.minSkill) return { error: `ต้องมีฝีมือช่างตีเหล็ก ${r.minSkill}` };
  const bag = inv.bag.map((s) => ({ ...s }));
  for (const [id, n] of Object.entries(r.needs))
    if (!takeItems(bag, id, n)) return { error: `${ITEMS[id].name}ไม่พอ` };
  if (useCrystal && !takeItems(bag, CRYSTAL, 1)) return { error: `${ITEMS[CRYSTAL].name}ไม่พอ` };
  if (bag.length >= BAG_SIZE) return { error: "กระเป๋าเต็ม" };
  const quality = rollQuality(inv.smithing, useCrystal, rnd());
  const made: ItemStack = { uid: newUid(), id: itemId, qty: 1, quality, affixes: rollAffixes(quality, ITEMS[itemId].tier, rnd), maker };
  bag.push(made);
  inv.bag = bag;
  const skillUp = rnd() < skillGainChance(inv.smithing, r);
  if (skillUp) inv.smithing++;
  return { made, skillUp };
}

// ---- drops --------------------------------------------------------------------

export interface DropDef {
  item: string;
  chance: number;
  qty: [number, number];
  /** only when the killer carries this tool */
  tool?: string;
}

/** `luck` multiplies the chances (corruption in the Hollow); above 100% it gives more pieces. */
export function rollDrops(drops: DropDef[] | undefined, bag: ItemStack[], rnd = Math.random, luck = 1): { id: string; qty: number }[] {
  const out: { id: string; qty: number }[] = [];
  for (const d of drops ?? []) {
    if (d.tool && !countItem(bag, d.tool)) continue;
    const chance = d.chance * luck;
    if (rnd() >= chance) continue;
    const qty = d.qty[0] + Math.floor(rnd() * (d.qty[1] - d.qty[0] + 1));
    out.push({ id: d.item, qty: Math.max(1, Math.round(qty * Math.max(1, chance))) });
  }
  return out;
}

// ---- gathering ----------------------------------------------------------------

export interface Resource {
  name: string;
  item: string;
  tool: string;
  qty: [number, number];
  respawnMs: number;
}
const COPPER: Resource = { name: "หินแร่ทองแดง", item: "ore_1", tool: "pickaxe", qty: [1, 3], respawnMs: 45_000 };
const IRON: Resource = { name: "หินแร่เหล็ก", item: "ore_2", tool: "pickaxe", qty: [1, 2], respawnMs: 60_000 };
const MIST: Resource = { name: "หินแร่หมอก", item: "ore_3", tool: "pickaxe", qty: [1, 3], respawnMs: 90_000 };
const PALEWOOD: Resource = { name: "ต้นไม้ไร้สี", item: "wood_3", tool: "hatchet", qty: [1, 2], respawnMs: 90_000 };
const OAK: Resource = { name: "ต้นโอ๊ก", item: "wood_1", tool: "hatchet", qty: [1, 3], respawnMs: 45_000 };

/** What can be gathered on this tile, if anything. Iron lies in the south, with the scarecrows. */
export function resourceAt(map: GameMap, x: number, y: number): Resource | null {
  const prop = map.props[y]?.[x];
  if (map.id === "hollow") return prop === Prop.Tree ? PALEWOOD : prop === Prop.Rock ? MIST : null;
  if (prop === Prop.Tree) return OAK;
  if (prop === Prop.Rock) return y >= 30 ? IRON : COPPER;
  return null;
}

export type StationKind = "smith" | "storage" | "portal" | "board";
export function stationAt(map: GameMap, x: number, y: number): StationKind | null {
  const prop = map.props[y]?.[x];
  return prop === Prop.Anvil ? "smith" : prop === Prop.Chest ? "storage" : prop === Prop.Portal ? "portal" : prop === Prop.Board ? "board" : null;
}

/** Where a station is, so both sides can check the distance. */
export function findStation(map: GameMap, kind: StationKind): { x: number; y: number } | null {
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) if (stationAt(map, x, y) === kind) return { x, y };
  return null;
}

// ---- saving -------------------------------------------------------------------

function cleanStack(v: unknown): ItemStack | null {
  const s = v as Partial<ItemStack> | null;
  if (!s || typeof s !== "object" || typeof s.id !== "string" || !ITEMS[s.id] || typeof s.uid !== "string") return null;
  const qty = isStackable(s.id) ? Math.floor(Number(s.qty)) : 1;
  if (!(qty >= 1)) return null;
  const out: ItemStack = { uid: s.uid, id: s.id, qty: Math.min(qty, STACK_MAX) };
  if (ITEMS[s.id].kind === "equip") {
    out.quality = Math.max(0, Math.min(3, Math.floor(Number(s.quality) || 0)));
    out.affixes = {};
    for (const [k, n] of Object.entries(s.affixes ?? {}))
      if (k in AFFIXES && Number.isFinite(n)) out.affixes[k as NumMod] = Number(n);
    if (typeof s.maker === "string") out.maker = s.maker;
  }
  return out;
}

/** Reads a saved inventory, dropping anything that no longer exists. */
export function cleanInventory(saved: unknown): Inventory {
  const inv = emptyInventory();
  const v = saved as Partial<Inventory> | null;
  if (!v || typeof v !== "object") return inv;
  const seen = new Set<string>();
  const ok = (s: ItemStack | null): s is ItemStack => !!s && !seen.has(s.uid) && !!seen.add(s.uid);
  if (Array.isArray(v.bag)) inv.bag = v.bag.map(cleanStack).filter(ok);
  if (Array.isArray(v.storage)) inv.storage = v.storage.map(cleanStack).filter(ok);
  for (const slot of SLOTS) {
    const s = cleanStack(v.equip?.[slot]);
    if (ok(s) && ITEMS[s.id].slot === slot) inv.equip[slot] = s;
  }
  inv.smithing = Math.max(0, Math.min(100, Math.floor(Number(v.smithing) || 0)));
  return inv;
}

/** For passiveMods(): gear bonuses as a Mods-like object. */
export type ExtraMods = Partial<Pick<Mods, NumMod>>;
