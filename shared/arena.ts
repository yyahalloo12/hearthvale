/**
 * The colosseum of Aldermere: players fight each other here for honour, with
 * nothing to lose. Nobody drops anything or loses EXP; the loser simply walks
 * out of the pit with full health.
 *
 * The map is a stone hall with four walled sand pits. A match puts two players
 * into a free pit; everyone else can watch from around the walls.
 */
import { GameMap, Prop, rng, Tile, ZoneId } from "./map";
import { grid } from "./terrain";

/** How long a match may last before the one with more health (in %) wins. */
export const MATCH_MS = 3 * 60_000;
/** Counting down before the first blow. */
export const COUNTDOWN_MS = 3_500;
/** Honour for a win, a loss and a draw. */
export const HONOR = { win: 10, loss: 2, draw: 4 };
/** An unanswered challenge goes away after this. */
export const DUEL_ASK_MS = 30_000;

export interface Pit {
  /** centre of the sand */
  x: number;
  y: number;
  /** where the two fighters start */
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** where both go back to after the match, outside the walls */
  out: { x: number; y: number };
}

export interface ArenaInfo {
  pits: Pit[];
}

export interface ArenaRecord {
  honor: number;
  wins: number;
  losses: number;
  draws: number;
}
export const emptyRecord = (): ArenaRecord => ({ honor: 0, wins: 0, losses: 0, draws: 0 });

/** A record read from the database, cleaned up. */
export function cleanRecord(v: unknown): ArenaRecord {
  const r = (v ?? {}) as Partial<ArenaRecord>;
  const n = (x: unknown) => Math.max(0, Math.floor(Number(x) || 0));
  return { honor: n(r.honor), wins: n(r.wins), losses: n(r.losses), draws: n(r.draws) };
}

/** A title for how much honour someone has. */
export function rankOf(honor: number): string {
  if (honor >= 1000) return "ราชันย์สนาม";
  if (honor >= 500) return "แชมเปี้ยน";
  if (honor >= 200) return "นักสู้ชื่อดัง";
  if (honor >= 60) return "นักสู้";
  return "มือใหม่";
}

/**
 * Who fights whom from the queue: the closest levels first. Close levels match
 * at once; after waiting a while the gap allowed grows, and in the end anyone fits.
 */
export function pickPair(queue: { id: string; level: number; since: number }[], now: number): [string, string] | null {
  let best: [string, string] | null = null;
  let bestGap = Infinity;
  for (let i = 0; i < queue.length; i++)
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i];
      const b = queue[j];
      const gap = Math.abs(a.level - b.level);
      const waited = now - Math.max(a.since, b.since);
      const allowed = gap <= 5 || (waited > 20_000 && gap <= 15) || waited > 45_000;
      if (allowed && gap < bestGap) {
        bestGap = gap;
        best = [a.id, b.id];
      }
    }
  return best;
}

/**
 * Damage between two fighters of different strength is scaled, so each blow
 * takes the share of the other's health it would take of your own. Gear and
 * skill still matter; a level 50 simply cannot one-shot a level 10.
 */
export function arenaScale(attackerMaxHp: number, defenderMaxHp: number): number {
  return Math.max(1 / 3, Math.min(3, defenderMaxHp / Math.max(1, attackerMaxHp)));
}

/** Which result a time-out gives: the one with more health in % wins. */
export function timeoutWinner(aHpPct: number, bHpPct: number): "a" | "b" | "draw" {
  if (Math.abs(aHpPct - bHpPct) < 0.005) return "draw";
  return aHpPct > bHpPct ? "a" : "b";
}

const N = 44;
const PIT_R = 5; // walls at centre +- 5, sand inside

/** The colosseum: a stone hall with four walled pits. */
export function buildArena(): GameMap {
  const rand = rng(77);
  const map: GameMap = {
    id: "arena" as ZoneId,
    name: "โคลอสเซียมอัลเดอเมียร์",
    pvp: false,
    width: N,
    height: N,
    tiles: grid<Tile>(N, N, Tile.Plaza),
    props: grid<Prop>(N, N, Prop.None),
    level: grid(N, N, 0),
    ramp: grid(N, N, 0),
    regions: {},
    closed: new Set(),
    springs: [],
    quiet: [],
    spawn: { x: 22, y: 39 },
    safe: { x: 22, y: 22, r: 60 },
    exits: [{ x: 22, y: 42, to: "aldermere", at: { x: 32, y: 47 }, label: "เมืองหลวงอัลเดอเมียร์" }],
    look: "brindle",
    home: "aldermere" as ZoneId,
    decor: {},
    arena: { pits: [] },
  };
  const decor = map.decor!;
  const put = (x: number, y: number, p: Prop, frame?: string) => {
    if (map.props[y][x] !== Prop.None) return;
    map.props[y][x] = p;
    if (frame) decor[y * N + x] = frame;
  };
  // the outer wall, with towers at the corners and an open gate at the bottom
  for (let i = 0; i < N; i++)
    for (const [x, y] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) if (!(y === N - 1 && Math.abs(x - 22) <= 2)) map.props[y][x] = Prop.Wall;
  for (const [x, y] of [[0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1], [19, N - 1], [25, N - 1]]) {
    map.props[y][x] = Prop.Clutter;
    decor[y * N + x] = "walltower";
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (rand() < 0.04 && map.props[y][x] === Prop.None) map.tiles[y][x] = Tile.Cobble;
  // four pits of sand, walled all round: fighters are put in and taken out
  for (const [cx, cy] of [[11, 11], [32, 11], [11, 30], [32, 30]]) {
    for (let y = cy - PIT_R; y <= cy + PIT_R; y++)
      for (let x = cx - PIT_R; x <= cx + PIT_R; x++) {
        const edge = Math.max(Math.abs(x - cx), Math.abs(y - cy)) === PIT_R;
        if (edge) map.props[y][x] = Prop.Wall;
        else map.tiles[y][x] = Tile.Sand;
      }
    for (const [x, y] of [[cx - PIT_R, cy - PIT_R], [cx + PIT_R, cy - PIT_R], [cx - PIT_R, cy + PIT_R], [cx + PIT_R, cy + PIT_R]]) {
      map.props[y][x] = Prop.Clutter;
      decor[y * N + x] = "walltower";
    }
    map.arena!.pits.push({ x: cx, y: cy, a: { x: cx - 3, y: cy }, b: { x: cx + 3, y: cy }, out: { x: cx, y: cy + PIT_R + 2 } });
  }
  // banners and braziers round the hall, benches for those who watch
  for (let i = 3; i < N - 3; i += 4) {
    put(i, 2, Prop.Clutter, `banner${(i >> 2) % 2}`);
    put(2, i, Prop.Clutter, `banner${(i >> 2) % 2}`);
    put(N - 3, i, Prop.Lamp);
  }
  for (const [x, y] of [[20, 20], [24, 20], [20, 24], [24, 24]]) put(x, y, Prop.Lamp);
  for (const [x, y] of [[16, 40], [28, 40], [6, 40], [38, 40], [22, 2]]) put(x, y, Prop.Clutter, "bench");
  map.tiles[N - 2][22] = Tile.Cobble;
  for (let y = 36; y < N - 1; y++) for (let x = 20; x <= 24; x++) if (map.props[y][x] === Prop.None) map.tiles[y][x] = Tile.Cobble;
  map.props[N - 2][22] = Prop.None;
  map.props[N - 1][22] = Prop.None;
  return map;
}

/** The pit a tile is inside, if any. */
export function pitAt(info: ArenaInfo, x: number, y: number): number {
  return info.pits.findIndex((p) => Math.abs(x - p.x) < PIT_R && Math.abs(y - p.y) < PIT_R);
}
