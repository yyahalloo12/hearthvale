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
}

export type ZoneId = "brindle" | "mossfen" | "hollow";

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
}

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

export function buildBrindleVillage(): GameMap {
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
  return { id: "brindle", name: "Brindle Village", pvp: false, width: W, height: H, tiles, props, spawn: { x: cx + 2, y: cy + 2 }, safe: { x: cx + 0.5, y: cy + 0.5, r: 10 }, exits: [{ x: 44, y: 24, to: "mossfen", at: { x: 5, y: 44 }, label: "ป่ามอสเฟน (Lv 10+)" }] };
}

/** The "main" prop tile of a 2x2 house is its top-left tile. */
export function isHouseAnchor(map: GameMap, x: number, y: number) {
  return (
    map.props[y][x] === Prop.House &&
    map.props[y - 1]?.[x] !== Prop.House &&
    map.props[y]?.[x - 1] !== Prop.House
  );
}

export function isWalkable(map: GameMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  if (map.tiles[y][x] === Tile.Water || map.tiles[y][x] === Tile.Void) return false;
  return map.props[y][x] === Prop.None;
}

export function isSafe(map: GameMap, x: number, y: number) {
  return Math.hypot(x - map.safe.x, y - map.safe.y) < map.safe.r;
}
