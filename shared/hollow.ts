/**
 * The Hollow (GDD 3.3): a colourless PvP map where dying drops everything you
 * carry, exits move every 15 minutes, and corruption grows while you stay.
 */
import type { ItemStack } from "./items";
import { GameMap, nearRamp, Prop, rng, Tile } from "./map";
import type { Point } from "./pathfinding";
import { grid, mesa, oval, reachableFrom, setRegion } from "./terrain";

export { reachableFrom } from "./terrain";

/**
 * Lowest level to enter. The GDD says 30, but the maps for levels 20-30 come
 * later, so for now it opens at 10 and its monsters are level 10-22.
 */
export const HOLLOW_MIN_LEVEL = 10;
export const GATE_COUNT = 3;
export const GATE_MOVE_MS = 15 * 60_000;
export const BUNDLE_MS = 5 * 60_000;
/** Part of a dead player's things that is destroyed (GDD 3.3). */
export const BUNDLE_LOSS = 0.3;
/** A character that logs out in the Hollow stays in the world this long. */
export const LINGER_MS = 30_000;
/** Corruption points (0-100) gained per minute, and the point where everyone sees you. */
export const CORRUPTION_PER_MIN = 5;
export const GLOW_AT = 50;
/** Colour springs wash this much away per second, but everyone sees you in them. */
export const SPRING_PER_SEC = 4;
/** The ground gives way now and then: warning time, how long it stays open, and how often. */
export const CRACK_WARN_MS = 8000;
export const CRACK_OPEN_MS = 40_000;
export const CRACK_EVERY_MS = 75_000;
/** Part of your health lost when you fall. */
export const FALL_DAMAGE = 0.4;
/** Damage between players is lower than against monsters, so fights last longer. */
export const PVP_DAMAGE = 0.7;
/** No harm given or taken just after arriving. */
export const PROTECT_MS = 5000;

const SIZE = 125;
const C = 62;

/** Drops get better with corruption: up to double the chance at 100. */
export function corruptionBonus(corruption: number) {
  return 1 + Math.max(0, Math.min(100, corruption)) / 100;
}

export interface HollowMap extends GameMap {
  /** places an exit gate can appear */
  gateSpots: Point[];
  /** places where people arrive */
  entries: Point[];
}

export function buildHollow(): HollowMap {
  const rand = rng(90210);
  const map: HollowMap = {
    id: "hollow",
    name: "The Hollow",
    pvp: true,
    width: SIZE,
    height: SIZE,
    tiles: grid<Tile>(SIZE, SIZE, Tile.Ash),
    props: grid<Prop>(SIZE, SIZE, Prop.None),
    spawn: { x: C, y: C },
    safe: { x: -100, y: -100, r: 0 },
    exits: [],
    level: grid(SIZE, SIZE, 0),
    ramp: grid(SIZE, SIZE, 0),
    regions: {},
    closed: new Set(),
    springs: [],
    gateSpots: [],
    entries: [],
  };
  const { tiles, props } = map;
  const polar = (deg: number, r: number) => ({ x: C + Math.cos((deg * Math.PI) / 180) * r, y: C + Math.sin((deg * Math.PI) / 180) * r });

  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) if (rand() < 0.25) tiles[y][x] = Tile.Pale;

  // Torn holes in the world.
  for (let i = 0; i < 34; i++) {
    const at = polar(rand() * 360, 18 + rand() * 38);
    const r = 1.5 + rand() * 2;
    for (const k of oval(map, at.x, at.y, r)) tiles[Math.floor(k / SIZE)][k % SIZE] = Tile.Void;
  }

  // Broken terraces all around, and a tall throne hill in the middle.
  for (let i = 0; i < 9; i++) {
    const at = polar(i * 40 + 14, 44);
    mesa(map, Math.round(at.x), Math.round(at.y), 6.5, 5.5, "se");
    if (i % 2 === 0) mesa(map, Math.round(at.x), Math.round(at.y) - 1, 3.6, 3, "s");
  }
  mesa(map, C, C, 11, 10, "nsew");
  mesa(map, C, C - 1, 6.5, 6, "se");
  mesa(map, C, C - 2, 3.6, 3, "s");
  map.spawn = { x: C, y: C + 16 };
  for (const k of oval(map, map.spawn.x, map.spawn.y, 2)) tiles[Math.floor(k / SIZE)][k % SIZE] = Tile.Ash;

  // A broken ring wall around the inner part (the better, more dangerous part).
  for (let a = 0; a < 360; a += 1.8) {
    if (a % 45 < 15) continue; // eight openings
    const p = polar(a, 27);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (tiles[y][x] !== Tile.Void && !map.level[y][x]) props[y][x] = Prop.Ruin;
  }

  // Ground that will give way.
  for (let i = 0; i < 8; i++) {
    const p = polar(i * 45 + 30, 34);
    map.regions[`crack${i}`] = oval(map, Math.round(p.x), Math.round(p.y), 3.4).filter((k) => !map.level[Math.floor(k / SIZE)][k % SIZE] && !map.ramp[Math.floor(k / SIZE)][k % SIZE]);
  }
  const cracked = new Set(Object.values(map.regions).flat());

  // Springs of colour.
  for (const a of [70, 190, 310]) {
    const p = polar(a, 20);
    const s = { x: Math.round(p.x), y: Math.round(p.y), r: 2.6 };
    map.springs.push(s);
    for (const k of oval(map, s.x, s.y, s.r)) {
      const x = k % SIZE;
      const y = Math.floor(k / SIZE);
      if (!map.level[y][x]) {
        tiles[y][x] = Tile.Spring;
        props[y][x] = Prop.None;
      }
    }
  }

  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (props[y][x] !== Prop.None || tiles[y][x] === Tile.Void || tiles[y][x] === Tile.Spring) continue;
      const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
      const d = Math.hypot(x - C, y - C);
      if (edge <= 1) props[y][x] = Prop.Tree;
      else if (d < 5 || map.ramp[y][x] || nearRamp(map, x, y) || cracked.has(y * SIZE + x)) continue;
      else if (rand() < 0.035) props[y][x] = Prop.Tree;
      else if (rand() < (d < 27 ? 0.03 : 0.018)) props[y][x] = Prop.Rock;
      else if (rand() < 0.012) props[y][x] = Prop.Ruin;
    }

  // Gates and arrival points: spread around, on ground that connects even when a crack is open.
  let ok = reachableFrom(map, map.spawn);
  for (const id of Object.keys(map.regions)) {
    setRegion(map, id, true);
    const left = reachableFrom(map, map.spawn);
    ok = new Set([...ok].filter((k) => left.has(k)));
    setRegion(map, id, false);
  }
  const near = (p: { x: number; y: number }): Point => {
    let best = map.spawn;
    let bestD = Infinity;
    for (const k of ok) {
      const q = { x: k % SIZE, y: Math.floor(k / SIZE) };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD && !map.ramp[q.y][q.x]) {
        bestD = d;
        best = q;
      }
    }
    return best;
  };
  for (let i = 0; i < 12; i++) map.gateSpots.push(near(polar(i * 30 + 11, i % 3 === 0 ? 18 : 40)));
  for (let i = 0; i < 6; i++) map.entries.push(near(polar(i * 60 + 31, 56)));
  return map;
}

/** Picks where the gates stand next; never the same set spot by spot when avoidable. */
export function pickGates(spots: Point[], before: Point[] = [], rnd = Math.random): Point[] {
  const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
  const fresh = spots.filter((s) => !before.some((b) => same(b, s)));
  const pool = fresh.length >= GATE_COUNT ? fresh : [...spots];
  const out: Point[] = [];
  while (out.length < GATE_COUNT && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

/** What is left of a dead player's things: each stack loses about 30%. */
export function destroyPart(items: ItemStack[], rnd = Math.random): ItemStack[] {
  const out: ItemStack[] = [];
  for (const s of items) {
    if (s.qty > 1) {
      let keep = 0;
      for (let i = 0; i < s.qty; i++) if (rnd() >= BUNDLE_LOSS) keep++;
      if (keep > 0) out.push({ ...s, qty: keep });
    } else if (rnd() >= BUNDLE_LOSS) out.push(s);
  }
  return out;
}
