/**
 * Brindle Village, the first map.
 *
 * Generated from a fixed seed so the server (collision) and the client
 * (drawing) build exactly the same map without shipping a file. When real
 * art arrives this will be replaced by a map made in Tiled (see GDD 6.1).
 */

export enum Tile {
  Grass = 0,
  Flowers = 1,
  Path = 2,
  Plaza = 3,
  Water = 4,
  Sand = 5,
  Ash = 6,
  Pale = 7,
  Void = 8,
  Moss = 9,
  Fern = 10,
  Bridge = 11,
  Spring = 12,
}

export enum Prop {
  None = 0,
  Tree = 1,
  House = 2,
  Well = 3,
  Fence = 4,
  Rock = 5,
  Bush = 6,
  Anvil = 7,
  Chest = 8,
  Portal = 9,
  Ruin = 10,
  Board = 11,
  Windmill = 12,
  Lantern = 13,
  Treasure = 14,
}

export type ZoneId = "brindle" | "mossfen" | "hollow" | "rift";

/** A spot that leads to another map when you walk onto it. */
export interface MapExit {
  x: number;
  y: number;
  to: ZoneId;
  /** where you arrive there */
  at: { x: number; y: number };
  label: string;
}

export interface GameMap {
  id: ZoneId;
  name: string;
  /** players can fight each other, and drop everything when they die */
  pvp: boolean;
  width: number;
  height: number;
  tiles: Tile[][]; // [y][x]
  props: Prop[][]; // [y][x]
  spawn: { x: number; y: number };
  /** Monsters never chase anyone standing inside this circle (the village). */
  safe: { x: number; y: number; r: number };
  exits: MapExit[];
  /** whole height of each tile, and which tiles are ramps (see terrain.ts) */
  level: number[][];
  ramp: number[][];
  /** named groups of tiles that can open and close while playing */
  regions: Record<string, number[]>;
  /** tiles closed right now */
  closed: Set<number>;
  /** round pools that wash corruption away (Hollow) */
  springs: { x: number; y: number; r: number }[];
  /** quiet places for gathering: monsters never come in or chase anyone inside */
  quiet: QuietZone[];
  /** set inside a mist portal */
  rift?: import("./rift").RiftInfo;
}

/** Which map's colours and trees to use. */
export function lookOf(map: GameMap): "brindle" | "mossfen" | "hollow" {
  if (map.rift) return map.rift.dark ? "hollow" : map.rift.origin;
  return map.id === "rift" ? "brindle" : map.id;
}

export interface QuietZone {
  x: number;
  y: number;
  r: number;
  name: string;
}

/** No monster comes here: the village and the quiet gathering places. */
export function isCalm(map: GameMap, x: number, y: number) {
  return isSafe(map, x, y) || map.quiet.some((q) => Math.hypot(x - q.x, y - q.y) < q.r);
}

/**
 * More rocks and bushes in a quiet place, each with free ground all around so
 * nothing gets walled in.
 */
export function sprinkle(map: GameMap, q: QuietZone, rand: () => number, chance: number, inner = 0) {
  for (let y = Math.floor(q.y - q.r); y <= q.y + q.r; y++)
    for (let x = Math.floor(q.x - q.r); x <= q.x + q.r; x++) {
      const d = Math.hypot(x - q.x, y - q.y);
      if (d >= q.r - 1 || d < inner || x < 2 || y < 2 || x > map.width - 3 || y > map.height - 3) continue;
      const t = map.tiles[y][x];
      if (t !== Tile.Grass && t !== Tile.Flowers && t !== Tile.Moss && t !== Tile.Fern) continue;
      if (map.ramp[y][x] || nearRamp(map, x, y)) continue;
      let free = true;
      for (let dy = -1; dy <= 1 && free; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const tt = map.tiles[y + dy][x + dx];
          if (map.props[y + dy][x + dx] !== Prop.None || tt === Tile.Path || tt === Tile.Plaza || tt === Tile.Water || tt === Tile.Bridge || map.level[y + dy][x + dx] !== map.level[y][x]) {
            free = false;
            break;
          }
        }
      if (!free || rand() >= chance) continue;
      map.props[y][x] = rand() < 0.5 ? Prop.Rock : Prop.Bush;
    }
}

import { grid, mesa, river, road } from "./terrain";

/** Small deterministic random generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Brindle Village and its countryside. The old 48x48 village keeps its place in
 * the north-west corner, so saved positions and stalls stay right.
 */
export function buildBrindleVillage(): GameMap {
  const old = buildOldVillage();
  const SIZE = 84;
  const rand = rng(777);
  const map: GameMap = {
    ...old,
    width: SIZE,
    height: SIZE,
    tiles: grid<Tile>(SIZE, SIZE, Tile.Grass),
    props: grid<Prop>(SIZE, SIZE, Prop.None),
    level: grid(SIZE, SIZE, 0),
    ramp: grid(SIZE, SIZE, 0),
    regions: {},
    closed: new Set(),
    springs: [],
    quiet: [{ x: 24.5, y: 24.5, r: 24, name: "ชานหมู่บ้าน" }],
    exits: [{ x: 80, y: 24, to: "mossfen", at: { x: 5, y: 44 }, label: "ป่ามอสเฟน (Lv 10+)" }],
  };
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (x < 48 && y < 48) {
        map.tiles[y][x] = old.tiles[y][x];
        // the old forest edge in the east and south makes way for the new land
        const edge = old.props[y][x] === Prop.Tree && (x >= 43 || y >= 43);
        map.props[y][x] = edge ? Prop.None : old.props[y][x];
      } else if (rand() < 0.08) map.tiles[y][x] = Tile.Flowers;
    }

  river(map, (y) => 58 + 4 * Math.sin(y / 9), 3);
  road(map, [[44, 24], [81, 24]]);
  road(map, [[24, 44], [24, 81]]);
  road(map, [[25, 72], [52, 74], [66, 60], [66, 25]]);

  // Hills: the windmill stands on the highest one.
  mesa(map, 38, 62, 11, 8, "se");
  mesa(map, 37, 60, 7.5, 5.2, "se");
  mesa(map, 36, 58, 4.2, 3.2, "s");
  mesa(map, 8, 4, 7, 3.4, "s");
  mesa(map, 7, 3, 4, 1.8, "s");
  mesa(map, 11, 64, 8, 7, "ne");
  mesa(map, 10, 63, 5, 4, "e");
  mesa(map, 75, 11, 7, 7, "sw");
  mesa(map, 75, 9, 4.5, 4, "s");
  mesa(map, 75, 70, 6.5, 7, "sw");
  mesa(map, 75, 68, 4, 3.4, "s");

  // Windmill: a 2x2 footprint on the top of its hill.
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) map.props[57 + dy][35 + dx] = Prop.Windmill;

  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (x < 46 && y < 46) continue;
      const t = map.tiles[y][x];
      if (map.props[y][x] !== Prop.None || (t !== Tile.Grass && t !== Tile.Flowers) || map.ramp[y][x]) continue;
      if (nearRamp(map, x, y)) continue;
      const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
      if (edge <= 1) map.props[y][x] = Prop.Tree;
      else if (edge <= 4 && rand() < 0.45 - edge * 0.08) map.props[y][x] = Prop.Tree;
      else if (map.level[y][x] >= 3) continue;
      else if (rand() < 0.035) map.props[y][x] = Prop.Tree;
      else if (rand() < 0.022) map.props[y][x] = Prop.Rock;
      else if (rand() < 0.022) map.props[y][x] = Prop.Bush;
    }
  // the village outskirts are for gathering: a few more rocks and herbs
  sprinkle(map, map.quiet[0], rng(4242), 0.05, 13);
  return map;
}

/** True on and right around ramps, which stay free of trees and rocks. */
export function nearRamp(map: GameMap, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.ramp[y + dy]?.[x + dx]) return true;
  return false;
}

function buildOldVillage() {
  const W = 48;
  const H = 48;
  const rand = rng(1337);
  const tiles: Tile[][] = [];
  const props: Prop[][] = [];
  for (let y = 0; y < H; y++) {
    tiles.push(new Array(W).fill(Tile.Grass));
    props.push(new Array(W).fill(Prop.None));
  }
  const cx = 24;
  const cy = 24;

  // Scatter flowers.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (rand() < 0.08) tiles[y][x] = Tile.Flowers;

  // Pond in the north-east with a sandy shore.
  const pond = { x: 36, y: 11, r: 5.2 };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - pond.x) * 0.85, y - pond.y);
      if (d < pond.r) tiles[y][x] = Tile.Water;
      else if (d < pond.r + 1.2) tiles[y][x] = Tile.Sand;
    }

  // Two crossing roads through the village centre.
  for (let i = 3; i < W - 3; i++) {
    tiles[cy][i] = Tile.Path;
    tiles[cy + 1][i] = Tile.Path;
    tiles[i][cx] = Tile.Path;
    tiles[i][cx + 1] = Tile.Path;
  }

  // Round stone plaza with a well in the middle.
  for (let y = cy - 4; y <= cy + 5; y++)
    for (let x = cx - 4; x <= cx + 5; x++)
      if (Math.hypot(x - cx - 0.5, y - cy - 0.5) < 4.8) tiles[y][x] = Tile.Plaza;
  props[cy][cx] = Prop.Well;

  // Cottages around the plaza (each blocks a 2x2 footprint, drawn from its top tile).
  const houses = [
    [17, 17], [30, 17], [17, 30], [30, 30], [12, 22], [35, 27],
  ];
  for (const [hx, hy] of houses) {
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        tiles[hy + dy][hx + dx] = Tile.Grass;
        props[hy + dy][hx + dx] = Prop.House;
      }
  }

  // A small fenced field in the south-west.
  for (let i = 6; i <= 14; i++) {
    props[34][i] = Prop.Fence;
    props[42][i] = Prop.Fence;
  }
  for (let i = 34; i <= 42; i++) {
    props[i][6] = Prop.Fence;
    if (i !== 38) props[i][14] = Prop.Fence; // gate
  }

  // Forest border, thinning towards the centre.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (props[y][x] !== Prop.None) continue;
      if (tiles[y][x] === Tile.Path || tiles[y][x] === Tile.Plaza || tiles[y][x] === Tile.Water) continue;
      if (edge <= 1) props[y][x] = Prop.Tree;
      else if (edge <= 4 && rand() < 0.45 - edge * 0.08) props[y][x] = Prop.Tree;
      else if (Math.hypot(x - cx, y - cy) > 8 && rand() < 0.03) props[y][x] = Prop.Tree;
      else if (Math.hypot(x - cx, y - cy) > 7 && rand() < 0.02) props[y][x] = Prop.Rock;
      else if (Math.hypot(x - cx, y - cy) > 6 && rand() < 0.02) props[y][x] = Prop.Bush;
    }
  // The blacksmith's anvil and the storage chest stand on the plaza.
  props[27][21] = Prop.Anvil;
  props[21][27] = Prop.Chest;
  // The auction board (moves to the capital when that map exists, GDD 4.3).
  props[22][22] = Prop.Board;
  // The way into the Hollow, at the north end of the road.
  props[5][24] = Prop.Portal;

  // Roads stay open to the map edge except the outermost tree ring.
  return { id: "brindle" as const, name: "Brindle Village", pvp: false, tiles, props, spawn: { x: cx + 2, y: cy + 2 }, safe: { x: cx + 0.5, y: cy + 0.5, r: 14 } };
}

/** The "main" prop tile of a 2x2 building (house, windmill) is its top-left tile. */
export function isHouseAnchor(map: GameMap, x: number, y: number) {
  const p = map.props[y][x];
  return (p === Prop.House || p === Prop.Windmill) && map.props[y - 1]?.[x] !== p && map.props[y]?.[x - 1] !== p;
}

export function isWalkable(map: GameMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  if (map.tiles[y][x] === Tile.Water || map.tiles[y][x] === Tile.Void) return false;
  return map.props[y][x] === Prop.None && !map.closed.has(y * map.width + x);
}

export function isSafe(map: GameMap, x: number, y: number) {
  return Math.hypot(x - map.safe.x, y - map.safe.y) < map.safe.r;
}
