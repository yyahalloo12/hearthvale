/**
 * Mist portals: they open at random in the open maps and lead to a small
 * island of their own. Rarer portals hold more and stronger waves, and a
 * better chest at the end. Black portals are the same, but the people inside
 * may fight each other and drop everything when they fall.
 */
import { GameMap, Prop, rng, Tile } from "./map";
import { grid, mesa, oval } from "./terrain";

export type OpenZone = "brindle" | "mossfen";

export interface RiftInfo {
  seed: number;
  origin: OpenZone;
  /** 0 common, 1 rare, 2 epic, 3 legendary */
  rarity: number;
  dark: boolean;
  /** where the portal stood, to come back to */
  at: { x: number; y: number };
  /** a dungeon: rooms behind gates instead of an island */
  dungeon?: boolean;
}

/** The fixed dungeon door in each open map. */
export const DUNGEONS: Record<OpenZone, { at: { x: number; y: number }; name: string; minLevel: number }> = {
  brindle: { at: { x: 20, y: 60 }, name: "ห้องใต้ดินกังหันลม", minLevel: 5 },
  mossfen: { at: { x: 96, y: 22 }, name: "ถ้ำรากไม้เก่า", minLevel: 14 },
};
export const DUNGEON_MS = 20 * 60_000;
/** centres of the rooms, west to east */
export const DUNGEON_ROOMS = [8, 23, 38, 53];
export const DUNGEON_Y = 11;

/** Everyone who ever went in counts, party or not. */
export const PORTAL_MAX = 7;
/** How long a portal stands in the open map. */
export const PORTAL_OPEN_MS = 5 * 60_000;
/** How long the island lasts once somebody went in. */
export const RIFT_MS = 10 * 60_000;
/** A new portal may appear this often in each open map (at random within). */
export const PORTAL_EVERY_MS: [number, number] = [3 * 60_000, 6 * 60_000];
export const PORTALS_AT_ONCE = 2;
export const DARK_CHANCE = 0.15;

export const RARITY_NAMES = ["ธรรมดา", "หายาก", "หายากมาก", "ตำนาน"];
export const RARITY_COLORS = [0x7fe08a, 0x4aa3ff, 0xb05cff, 0xffb02e];
/** chance of each rarity, in order */
export const RARITY_ODDS = [0.55, 0.3, 0.12, 0.03];

export function rollRarity(r: number): number {
  let acc = 0;
  for (let i = 0; i < RARITY_ODDS.length; i++) {
    acc += RARITY_ODDS[i];
    if (r < acc) return i;
  }
  return RARITY_ODDS.length - 1;
}

export function riftName(info: Pick<RiftInfo, "rarity" | "dark"> & { dungeon?: boolean; origin?: OpenZone }) {
  if (info.dungeon) return `ดันเจี้ยน ${DUNGEONS[info.origin ?? "brindle"].name}`;
  return `${info.dark ? "พอร์ทัลดำ" : "พอร์ทัลหมอก"} (${RARITY_NAMES[info.rarity] ?? ""})`;
}

/** Waves of monsters for this rift. The last wave of an epic or better one has a boss. */
export function riftWaves(info: Pick<RiftInfo, "origin" | "rarity" | "dark"> & { dungeon?: boolean }) {
  const kinds = info.origin === "mossfen" ? ["wolf", "wisp", "bear"] : ["rat", "scarecrow", "scarecrow"];
  const boss = info.origin === "mossfen" ? "treant" : "henqueen";
  if (info.dungeon)
    return DUNGEON_ROOMS.map((_, i) => {
      const wave = [{ kind: kinds[Math.min(i, kinds.length - 1)], count: 4 + i, levelBonus: 4 }];
      if (i === DUNGEON_ROOMS.length - 1) wave.push({ kind: boss, count: 1, levelBonus: 6 });
      return wave;
    });
  const n = 2 + info.rarity;
  const bonus = [1, 3, 5, 8][info.rarity] + (info.dark ? 3 : 0);
  const waves: { kind: string; count: number; levelBonus: number }[][] = [];
  for (let i = 0; i < n; i++) {
    const wave = [
      { kind: kinds[Math.min(i, kinds.length - 1)], count: 4 + i, levelBonus: bonus },
      { kind: kinds[Math.max(0, Math.min(i - 1, kinds.length - 1))], count: 2, levelBonus: bonus },
    ];
    if (i === n - 1 && info.rarity >= 2) wave.push({ kind: boss, count: 1, levelBonus: bonus });
    waves.push(wave);
  }
  return waves;
}

/** What one person gets from the chest at the end. */
export function riftRewards(info: Pick<RiftInfo, "origin" | "rarity" | "dark">, rand: () => number) {
  const k = (info.rarity + 1) * (info.dark ? 2 : 1);
  const n = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const forest = info.origin === "mossfen";
  const items: { id: string; qty: number }[] = [
    { id: forest ? "ore_2" : "ore_1", qty: n(3, 5) * k },
    { id: forest ? "wood_2" : "wood_1", qty: n(3, 5) * k },
    { id: forest ? "herb_2" : "herb_1", qty: n(2, 4) * k },
  ];
  if (info.rarity >= 1 || info.dark) items.push({ id: "crystal_1", qty: n(1, 2) * Math.max(1, info.rarity) * (info.dark ? 2 : 1) });
  if (info.rarity >= 2) items.push({ id: "ore_3", qty: n(2, 4) * (info.rarity - 1) * (info.dark ? 2 : 1) });
  if (info.rarity >= 3) items.push({ id: "thread_3", qty: n(2, 3) * (info.dark ? 2 : 1) });
  return { gold: Math.round(60 * k * (1 + rand() * 0.5)), items };
}

export const RIFT_SIZE = 40;

/** A dungeon: four rooms in a row, each gate opens when its room is clear. */
export function buildDungeon(info: RiftInfo): GameMap {
  const W = 62;
  const H = 22;
  const rand = rng(info.seed);
  const floor = Tile.Path;
  const map: GameMap = {
    id: "rift",
    name: riftName(info),
    pvp: false,
    width: W,
    height: H,
    tiles: grid<Tile>(W, H, Tile.Void),
    props: grid<Prop>(W, H, Prop.None),
    level: grid(W, H, 0),
    ramp: grid(W, H, 0),
    regions: {},
    closed: new Set(),
    springs: [],
    quiet: [],
    spawn: { x: DUNGEON_ROOMS[0] - 3, y: DUNGEON_Y },
    safe: { x: -100, y: -100, r: 0 },
    exits: [{ x: DUNGEON_ROOMS[0] - 5, y: DUNGEON_Y, to: info.origin, at: info.at, label: "ทางออก" }],
    rift: info,
  };
  const set = (x: number, y: number, t: Tile) => {
    if (x > 0 && y > 0 && x < W - 1 && y < H - 1) map.tiles[y][x] = t;
  };
  // rooms
  for (const cx of DUNGEON_ROOMS)
    for (let y = DUNGEON_Y - 6; y <= DUNGEON_Y + 6; y++)
      for (let x = cx - 6; x <= cx + 6; x++) if (Math.abs(x - cx) + Math.abs(y - DUNGEON_Y) * 0.8 <= 8.5) set(x, y, rand() < 0.1 ? Tile.Sand : floor);
  // corridors with a gate in the middle of each
  for (let i = 0; i < DUNGEON_ROOMS.length - 1; i++) {
    const gate: number[] = [];
    for (let x = DUNGEON_ROOMS[i] + 5; x <= DUNGEON_ROOMS[i + 1] - 5; x++)
      for (let y = DUNGEON_Y - 1; y <= DUNGEON_Y + 1; y++) {
        set(x, y, floor);
        if (x === Math.round((DUNGEON_ROOMS[i] + DUNGEON_ROOMS[i + 1]) / 2)) gate.push(y * W + x);
      }
    map.regions[`gate${i}`] = gate;
  }
  // pillars of old stone in the rooms
  for (const cx of DUNGEON_ROOMS.slice(0, -1))
    for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) map.props[DUNGEON_Y + dy][cx + dx] = Prop.Ruin;
  // the last room: a raised dais with the chest
  const last = DUNGEON_ROOMS[DUNGEON_ROOMS.length - 1];
  mesa(map, last + 1, DUNGEON_Y, 3, 3, "w");
  map.props[DUNGEON_Y][last + 2] = Prop.Treasure;
  for (const id of Object.keys(map.regions)) for (const k of map.regions[id]) map.closed.add(k);
  return map;
}

/** The island inside: a round clearing, a hill, a chest in the middle. */
export function buildRift(info: RiftInfo): GameMap {
  if (info.dungeon) return buildDungeon(info);
  const S = RIFT_SIZE;
  const rand = rng(info.seed);
  const c = S / 2;
  const floor = info.dark ? Tile.Ash : info.origin === "mossfen" ? Tile.Moss : Tile.Grass;
  const map: GameMap = {
    id: "rift",
    name: riftName(info),
    pvp: info.dark,
    width: S,
    height: S,
    tiles: grid<Tile>(S, S, info.dark ? Tile.Void : Tile.Water),
    props: grid<Prop>(S, S, Prop.None),
    level: grid(S, S, 0),
    ramp: grid(S, S, 0),
    regions: {},
    closed: new Set(),
    springs: [],
    quiet: [],
    spawn: { x: c, y: S - 6 },
    safe: { x: -100, y: -100, r: 0 },
    exits: [{ x: c, y: S - 4, to: info.origin, at: info.at, label: "ทางกลับ" }],
    rift: info,
  };
  // a wobbly island
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const a = Math.atan2(y - c, x - c);
      const r = 16 + Math.sin(a * 3 + info.seed) * 1.6 + Math.sin(a * 7 + info.seed * 2) * 0.8;
      if (Math.hypot(x - c, y - c) <= r) map.tiles[y][x] = rand() < 0.07 && !info.dark ? (info.origin === "mossfen" ? Tile.Fern : Tile.Flowers) : floor;
    }
  for (const k of oval(map, c, S - 5, 2.2)) map.tiles[Math.floor(k / S)][k % S] = Tile.Path;
  // a low hill in the middle where the chest waits
  mesa(map, c, c, 5, 4.2, "sw");
  map.props[c][c] = Prop.Treasure;
  // a few trees and rocks for cover, away from the paths
  for (let i = 0; i < 26; i++) {
    const x = Math.round(c + (rand() * 2 - 1) * 13);
    const y = Math.round(c + (rand() * 2 - 1) * 13);
    if (map.tiles[y]?.[x] !== floor || map.level[y][x] || Math.hypot(x - c, y - c) < 7 || Math.hypot(x - c, y - (S - 5)) < 5) continue;
    let free = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.props[y + dy][x + dx] !== Prop.None || map.ramp[y + dy][x + dx]) free = false;
    if (free) map.props[y][x] = i % 3 ? Prop.Tree : Prop.Rock;
  }
  return map;
}
