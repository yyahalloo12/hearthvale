/**
 * The rest of the continent (GDD 5.2): the capital Aldermere and four regions
 * around it. Each is generated from a small description so server and client
 * build the same map from a seed, like the others.
 *
 *   Brindle (south road) -> Aldermere
 *   Aldermere east -> Copperhill (15-25), south -> Sunreach (20-30),
 *   west -> Thornmarsh (border, 25-40) -> south -> Greywater (border, 35-50)
 */
import { GameMap, MapExit, nearRamp, Prop, QuietZone, rng, Tile, ZoneId } from "./map";
import { grid, mesa, oval, river, road } from "./terrain";

export type RegionId = "aldermere" | "copperhill" | "sunreach" | "thornmarsh" | "greywater";
export const REGION_IDS: RegionId[] = ["aldermere", "copperhill", "sunreach", "thornmarsh", "greywater"];

interface RegionSpec {
  name: string;
  size: number;
  seed: number;
  /** which map's colours and trees to use */
  look: "brindle" | "mossfen" | "hollow";
  floor: Tile;
  /** a second ground tile, scattered */
  alt: [Tile, number];
  /** big patches of another tile: [x, y, r, tile] */
  patches: [number, number, number, Tile][];
  river?: { at: (y: number) => number; w: number };
  mesas: [number, number, number, number, string][];
  density: { tree: number; rock: number; bush: number };
  exits: MapExit[];
  /** players may fight here, and whoever starts it turns red (GDD 3.2) */
  border?: boolean;
  /** where you wake up after falling here */
  home: ZoneId;
}

const C = 48; // middle of a 96 map

export const REGIONS: Record<Exclude<RegionId, "aldermere">, RegionSpec> = {
  copperhill: {
    name: "เหมืองคอปเปอร์ฮิลล์",
    size: 96,
    seed: 3101,
    look: "brindle",
    floor: Tile.Sand,
    alt: [Tile.Path, 0.2],
    patches: [[70, 26, 9, Tile.Plaza], [26, 70, 7, Tile.Plaza], [74, 74, 6, Tile.Water]],
    mesas: [[24, 24, 10, 8, "se"], [23, 22, 6, 4.5, "s"], [72, 46, 8, 10, "w"], [74, 44, 4.5, 5, "w"], [48, 82, 9, 6, "n"]],
    density: { tree: 0.012, rock: 0.07, bush: 0.01 },
    exits: [{ x: 1, y: C, to: "aldermere", at: { x: 59, y: 32 }, label: "เมืองหลวงอัลเดอเมียร์" }],
    home: "aldermere",
  },
  sunreach: {
    name: "ชายฝั่งซันรีช",
    size: 96,
    seed: 4201,
    look: "brindle",
    floor: Tile.Sand,
    alt: [Tile.Grass, 0.12],
    patches: [[96, 60, 34, Tile.Water], [60, 96, 26, Tile.Water], [30, 30, 10, Tile.Grass], [20, 60, 8, Tile.Flowers]],
    mesas: [[24, 30, 8, 7, "se"], [62, 22, 9, 6, "s"], [22, 72, 7, 6, "e"]],
    density: { tree: 0.025, rock: 0.03, bush: 0.035 },
    exits: [{ x: C, y: 1, to: "aldermere", at: { x: 32, y: 59 }, label: "เมืองหลวงอัลเดอเมียร์" }],
    home: "aldermere",
  },
  thornmarsh: {
    name: "ชายแดนธอร์นมาร์ช",
    size: 96,
    seed: 5301,
    look: "mossfen",
    floor: Tile.Moss,
    alt: [Tile.Ash, 0.14],
    patches: [[30, 30, 6, Tile.Ash], [70, 70, 8, Tile.Ash], [24, 74, 5, Tile.Water], [72, 22, 5, Tile.Water]],
    river: { at: (y) => 62 + 4 * Math.sin(y / 8), w: 2 },
    mesas: [[24, 26, 9, 8, "se"], [24, 24, 5, 4, "s"], [76, 76, 9, 8, "nw"], [78, 30, 7, 7, "w"]],
    density: { tree: 0.09, rock: 0.03, bush: 0.035 },
    exits: [
      { x: 94, y: C, to: "aldermere", at: { x: 5, y: 32 }, label: "เมืองหลวงอัลเดอเมียร์" },
      { x: C, y: 94, to: "greywater", at: { x: C, y: 4 }, label: "หนองเกรย์วอเตอร์ (Lv 35+)" },
    ],
    border: true,
    home: "aldermere",
  },
  greywater: {
    name: "หนองเกรย์วอเตอร์",
    size: 96,
    seed: 6401,
    look: "hollow",
    floor: Tile.Moss,
    alt: [Tile.Pale, 0.18],
    patches: [[30, 34, 9, Tile.Water], [66, 30, 8, Tile.Water], [36, 70, 8, Tile.Water], [72, 70, 10, Tile.Water], [50, 50, 5, Tile.Ash]],
    mesas: [[20, 52, 7, 9, "e"], [80, 50, 7, 9, "w"], [50, 80, 9, 6, "n"]],
    density: { tree: 0.06, rock: 0.025, bush: 0.05 },
    exits: [{ x: C, y: 1, to: "thornmarsh", at: { x: C, y: 91 }, label: "ชายแดนธอร์นมาร์ช" }],
    border: true,
    home: "aldermere",
  },
};

/** Where an exit's path leaves the map edge, one step inside. */
function inward(e: MapExit, size: number, n = 3): [number, number] {
  if (e.x <= 2) return [e.x + n, e.y];
  if (e.x >= size - 3) return [e.x - n, e.y];
  if (e.y <= 2) return [e.x, e.y + n];
  return [e.x, e.y - n];
}

export function buildRegion(id: Exclude<RegionId, "aldermere">): GameMap {
  const s = REGIONS[id];
  const N = s.size;
  const rand = rng(s.seed);
  const map: GameMap = {
    id: id as ZoneId,
    name: s.name,
    pvp: false,
    width: N,
    height: N,
    tiles: grid<Tile>(N, N, s.floor),
    props: grid<Prop>(N, N, Prop.None),
    level: grid(N, N, 0),
    ramp: grid(N, N, 0),
    regions: {},
    closed: new Set(),
    springs: [],
    quiet: [],
    spawn: { x: 0, y: 0 },
    safe: { x: -100, y: -100, r: 0 },
    exits: s.exits,
    look: s.look,
    border: s.border,
    home: s.home,
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (rand() < s.alt[1]) map.tiles[y][x] = s.alt[0];
  for (const [px, py, r, t] of s.patches) for (const k of oval(map, px, py, r)) map.tiles[Math.floor(k / N)][k % N] = t;
  if (s.river) river(map, s.river.at, s.river.w);
  for (const [cx, cy, rx, ry, ramps] of s.mesas) mesa(map, cx, cy, rx, ry, ramps);
  // roads from every exit into the middle (bridges over water)
  for (const e of s.exits) road(map, [[e.x, e.y], inward(e, N), [C, C]]);
  // quiet places where you arrive: monsters keep away from the doors
  map.quiet = s.exits.map((e, i): QuietZone => ({ ...((([x, y]) => ({ x, y }))(inward(e, N, 7))), r: 7, name: i ? "ทางเข้าด้านใน" : "ลานพักทางเข้า" }));
  map.spawn = { ...map.quiet[0] };
  map.spawn.x = Math.round(map.spawn.x);
  map.spawn.y = Math.round(map.spawn.y);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const t = map.tiles[y][x];
      if (t === Tile.Path || t === Tile.Water || t === Tile.Bridge || t === Tile.Plaza || map.ramp[y][x] || nearRamp(map, x, y)) continue;
      const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
      const nearDoor = s.exits.some((e) => Math.hypot(e.x - x, e.y - y) < 5);
      if (nearDoor) continue;
      if (edge <= 1) map.props[y][x] = Prop.Tree;
      else if (edge <= 3 && rand() < 0.35) map.props[y][x] = Prop.Tree;
      else if (rand() < s.density.tree) map.props[y][x] = Prop.Tree;
      else if (rand() < s.density.rock) map.props[y][x] = Prop.Rock;
      else if (rand() < s.density.bush) map.props[y][x] = Prop.Bush;
    }
  // the doors themselves stay open, on plain ground
  for (const e of s.exits) {
    map.tiles[e.y][e.x] = Tile.Path;
    map.props[e.y][e.x] = Prop.None;
  }
  // rocks and herbs for gathering by every door
  for (const q of map.quiet) for (const k of oval(map, q.x, q.y, q.r)) if (map.props[Math.floor(k / N)][k % N] === Prop.Tree && Math.min(k % N, Math.floor(k / N), N - 1 - (k % N), N - 1 - Math.floor(k / N)) > 1) map.props[Math.floor(k / N)][k % N] = Prop.None;
  for (const [i, q] of map.quiet.entries()) scatter(map, q, rng(s.seed + i), 0.45);
  return map;
}

/** Rocks and bushes in a quiet place, each with free ground all around. */
function scatter(map: GameMap, q: QuietZone, rand: () => number, chance: number) {
  for (let y = Math.floor(q.y - q.r); y <= q.y + q.r; y++)
    for (let x = Math.floor(q.x - q.r); x <= q.x + q.r; x++) {
      const d = Math.hypot(x - q.x, y - q.y);
      if (d >= q.r - 1 || d < 2 || x < 2 || y < 2 || x > map.width - 3 || y > map.height - 3) continue;
      let free = true;
      for (let dy = -1; dy <= 1 && free; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const t = map.tiles[y + dy][x + dx];
          if (map.props[y + dy][x + dx] !== Prop.None || t === Tile.Water || t === Tile.Bridge || t === Tile.Plaza || map.level[y + dy][x + dx] !== map.level[y][x] || map.ramp[y + dy][x + dx]) {
            free = false;
            break;
          }
        }
      if (free && map.tiles[y][x] !== Tile.Path && rand() < chance) map.props[y][x] = rand() < 0.55 ? Prop.Rock : Prop.Bush;
    }
}

/** Aldermere: the walled capital. Safe, with the market board, storage and smiths. */
export function buildAldermere(): GameMap {
  const N = 64;
  const c = 32;
  const rand = rng(2024);
  const map: GameMap = {
    id: "aldermere" as ZoneId,
    name: "เมืองหลวงอัลเดอเมียร์",
    pvp: false,
    width: N,
    height: N,
    tiles: grid<Tile>(N, N, Tile.Grass),
    props: grid<Prop>(N, N, Prop.None),
    level: grid(N, N, 0),
    ramp: grid(N, N, 0),
    regions: {},
    closed: new Set(),
    springs: [],
    quiet: [],
    spawn: { x: c + 2, y: c + 3 },
    safe: { x: c + 0.5, y: c + 0.5, r: 40 },
    exits: [
      { x: c, y: 1, to: "brindle", at: { x: 24, y: 79 }, label: "หมู่บ้านบรินเดิล" },
      { x: 62, y: c, to: "copperhill", at: { x: 4, y: C }, label: "เหมืองคอปเปอร์ฮิลล์ (Lv 15+)" },
      { x: c, y: 62, to: "sunreach", at: { x: C, y: 4 }, label: "ชายฝั่งซันรีช (Lv 20+)" },
      { x: 1, y: c, to: "thornmarsh", at: { x: 90, y: C }, label: "ชายแดนธอร์นมาร์ช (Lv 25+ ชายแดน PvP)" },
    ],
    look: "brindle",
    home: "aldermere" as ZoneId,
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (rand() < 0.07) map.tiles[y][x] = Tile.Flowers;
  // a city wall of old stone with four gates
  for (let i = 3; i < N - 3; i++)
    for (const [x, y] of [[i, 4], [i, N - 5], [4, i], [N - 5, i]]) if (Math.abs(i - c) > 2) map.props[y][x] = Prop.Ruin;
  // wide streets from the gates to the grand plaza
  road(map, [[c, 1], [c, N - 2]]);
  road(map, [[1, c], [N - 2, c]]);
  for (const k of oval(map, c + 0.5, c + 0.5, 7.5)) map.tiles[Math.floor(k / N)][k % N] = Tile.Plaza;
  map.props[c][c] = Prop.Well;
  // the market, the storage and two smiths around the plaza
  map.props[c - 4][c + 5] = Prop.Board;
  map.props[c + 5][c - 4] = Prop.Chest;
  map.props[c - 4][c - 4] = Prop.Anvil;
  map.props[c + 5][c + 5] = Prop.Anvil;
  // houses in blocks between the streets
  for (const [hx, hy] of [[10, 10], [16, 10], [10, 16], [44, 10], [50, 10], [50, 16], [10, 44], [10, 50], [16, 50], [44, 50], [50, 50], [50, 44], [22, 18], [40, 18], [18, 40], [44, 40]])
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) map.props[hy + dy][hx + dx] = Prop.House;
  // gardens and trees in the corners
  for (let y = 6; y < N - 6; y++)
    for (let x = 6; x < N - 6; x++) {
      if (map.props[y][x] !== Prop.None || map.tiles[y][x] === Tile.Path || map.tiles[y][x] === Tile.Plaza) continue;
      if (Math.abs(x - c) < 4 || Math.abs(y - c) < 4) continue;
      if (rand() < 0.04) map.props[y][x] = Prop.Tree;
      else if (rand() < 0.03) map.props[y][x] = Prop.Bush;
    }
  // outside the walls: a ring of trees
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
      if (edge <= 1 && map.tiles[y][x] !== Tile.Path) map.props[y][x] = Prop.Tree;
    }
  for (const e of map.exits) {
    map.tiles[e.y][e.x] = Tile.Path;
    map.props[e.y][e.x] = Prop.None;
  }
  return map;
}

// ---- monsters in each region --------------------------------------------------------

export interface RegionSpawn {
  kind: string;
  x: number;
  y: number;
  radius: number;
  count: number;
  respawnMs: number;
}

export const REGION_SPAWNS: Record<RegionId, RegionSpawn[]> = {
  aldermere: [
    { kind: "guard", x: 32, y: 8, radius: 2, count: 2, respawnMs: 20000 },
    { kind: "guard", x: 8, y: 32, radius: 2, count: 2, respawnMs: 20000 },
    { kind: "guard", x: 56, y: 32, radius: 2, count: 2, respawnMs: 20000 },
    { kind: "guard", x: 32, y: 56, radius: 2, count: 2, respawnMs: 20000 },
  ],
  copperhill: [
    { kind: "stonebat", x: 30, y: 60, radius: 6, count: 6, respawnMs: 20000 },
    { kind: "stonebat", x: 66, y: 66, radius: 6, count: 6, respawnMs: 20000 },
    { kind: "golem", x: 70, y: 26, radius: 6, count: 6, respawnMs: 25000 },
    { kind: "golem", x: 26, y: 70, radius: 5, count: 5, respawnMs: 25000 },
    { kind: "dwarfbandit", x: 60, y: 82, radius: 6, count: 6, respawnMs: 25000 },
    { kind: "dwarfbandit", x: 82, y: 60, radius: 5, count: 5, respawnMs: 25000 },
    { kind: "ironforeman", x: 58, y: 62, radius: 2, count: 1, respawnMs: 600000 },
  ],
  sunreach: [
    { kind: "crab", x: 70, y: 40, radius: 7, count: 7, respawnMs: 20000 },
    { kind: "crab", x: 44, y: 70, radius: 6, count: 6, respawnMs: 20000 },
    { kind: "gullpirate", x: 60, y: 22, radius: 6, count: 6, respawnMs: 25000 },
    { kind: "gullpirate", x: 18, y: 50, radius: 5, count: 5, respawnMs: 25000 },
    { kind: "siren", x: 64, y: 64, radius: 6, count: 6, respawnMs: 25000 },
    { kind: "saltbeard", x: 30, y: 46, radius: 2, count: 1, respawnMs: 600000 },
  ],
  thornmarsh: [
    { kind: "shadowwolf", x: 30, y: 60, radius: 6, count: 6, respawnMs: 25000 },
    { kind: "shadowwolf", x: 60, y: 30, radius: 6, count: 6, respawnMs: 25000 },
    { kind: "thornknight", x: 30, y: 30, radius: 6, count: 6, respawnMs: 30000 },
    { kind: "thornknight", x: 72, y: 72, radius: 6, count: 5, respawnMs: 30000 },
    { kind: "mtbandit", x: 74, y: 36, radius: 5, count: 5, respawnMs: 30000 },
    { kind: "mtbandit", x: 36, y: 74, radius: 5, count: 5, respawnMs: 30000 },
    { kind: "blackrose", x: 24, y: 26, radius: 2, count: 1, respawnMs: 900000 },
  ],
  greywater: [
    { kind: "giantfrog", x: 30, y: 50, radius: 6, count: 6, respawnMs: 30000 },
    { kind: "giantfrog", x: 70, y: 50, radius: 6, count: 6, respawnMs: 30000 },
    { kind: "swampwitch", x: 48, y: 34, radius: 6, count: 5, respawnMs: 30000 },
    { kind: "swampwitch", x: 50, y: 64, radius: 5, count: 5, respawnMs: 30000 },
    { kind: "drowned", x: 24, y: 80, radius: 6, count: 5, respawnMs: 35000 },
    { kind: "drowned", x: 78, y: 82, radius: 6, count: 5, respawnMs: 35000 },
    { kind: "rotqueen", x: 50, y: 80, radius: 2, count: 1, respawnMs: 1200000 },
  ],
};
