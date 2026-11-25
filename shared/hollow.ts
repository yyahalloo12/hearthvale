/**
 * The Hollow (GDD 3.3): a colourless PvP map where dying drops everything you
 * carry, exits move every 15 minutes, and corruption grows while you stay.
 */
import type { ItemStack } from "./items";
import { GameMap, isWalkable, Prop, rng, Tile } from "./map";
import type { Point } from "./pathfinding";

/**
 * Lowest level to enter. The GDD says 30, but the maps for levels 10-30 come in
 * step 7, so for now it opens at 10 and its monsters are level 10-22.
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
/** Damage between players is lower than against monsters, so fights last longer. */
export const PVP_DAMAGE = 0.7;
/** No harm given or taken just after arriving. */
export const PROTECT_MS = 5000;

const SIZE = 72;
const C = SIZE / 2;

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

/** All tiles that can be walked to from `start`. */
export function reachableFrom(map: GameMap, start: Point): Set<number> {
  const seen = new Set<number>([start.y * map.width + start.x]);
  const todo = [start];
  while (todo.length) {
    const { x, y } = todo.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = ny * map.width + nx;
      if (seen.has(k) || !isWalkable(map, nx, ny)) continue;
      seen.add(k);
      todo.push({ x: nx, y: ny });
    }
  }
  return seen;
}

export function buildHollow(): HollowMap {
  const rand = rng(90210);
  const tiles: Tile[][] = [];
  const props: Prop[][] = [];
  for (let y = 0; y < SIZE; y++) {
    tiles.push(new Array(SIZE).fill(Tile.Ash));
    props.push(new Array(SIZE).fill(Prop.None));
  }
  const map: HollowMap = {
    id: "hollow",
    name: "The Hollow",
    pvp: true,
    width: SIZE,
    height: SIZE,
    tiles,
    props,
    spawn: { x: C, y: C },
    safe: { x: -100, y: -100, r: 0 },
    gateSpots: [],
    entries: [],
  };

  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) if (rand() < 0.25) tiles[y][x] = Tile.Pale;

  // Torn holes in the world.
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const d = 10 + rand() * 20;
    const hx = C + Math.cos(a) * d;
    const hy = C + Math.sin(a) * d;
    const r = 1.4 + rand() * 1.8;
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) if (Math.hypot(x - hx, y - hy) < r) tiles[y][x] = Tile.Void;
  }

  // A broken ring wall around the inner part (the better, more dangerous part).
  for (let a = 0; a < 360; a += 3) {
    if (a % 60 < 18) continue; // six openings
    const x = Math.round(C + Math.cos((a * Math.PI) / 180) * 15);
    const y = Math.round(C + Math.sin((a * Math.PI) / 180) * 15);
    if (tiles[y][x] !== Tile.Void) props[y][x] = Prop.Ruin;
  }

  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (props[y][x] !== Prop.None || tiles[y][x] === Tile.Void) continue;
      const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
      const d = Math.hypot(x - C, y - C);
      if (edge <= 1) props[y][x] = Prop.Tree;
      else if (d > 4 && rand() < 0.035) props[y][x] = Prop.Tree;
      else if (d > 4 && rand() < (d < 15 ? 0.03 : 0.018)) props[y][x] = Prop.Rock;
      else if (d > 4 && rand() < 0.012) props[y][x] = Prop.Ruin;
    }

  // Gates and arrival points: spread around, always on ground that connects.
  const ok = reachableFrom(map, map.spawn);
  const near = (x: number, y: number): Point => {
    let best = map.spawn;
    let bestD = Infinity;
    for (const k of ok) {
      const p = { x: k % SIZE, y: Math.floor(k / SIZE) };
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  };
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const r = i % 3 === 0 ? 11 : 24;
    map.gateSpots.push(near(C + Math.cos(a) * r, C + Math.sin(a) * r));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.55;
    map.entries.push(near(C + Math.cos(a) * 31, C + Math.sin(a) * 31));
  }
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
