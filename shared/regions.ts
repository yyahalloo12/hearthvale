/**
 * The rest of the continent (GDD 5.2): the capital Aldermere and four regions
 * around it. Each is generated from a small description so server and client
 * build the same map from a seed, like the others.
 *
 *   Brindle (south road) -> Aldermere
 *   Aldermere east -> Copperhill (15-25), south -> Sunreach (20-30),
 *   west -> Thornmarsh (border, 25-40) -> south -> Greywater (border, 35-50)
 */
import { addBig, GameMap, MapExit, nearRamp, Prop, QuietZone, rng, Tile, ZoneId } from "./map";
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
  const mid = c + 0.5; // the streets are four tiles wide, 31..34
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
    spawn: { x: c + 3, y: c + 4 },
    safe: { x: mid, y: mid, r: 40 },
    exits: [
      { x: c, y: 1, to: "brindle", at: { x: 24, y: 79 }, label: "หมู่บ้านบรินเดิล" },
      { x: 62, y: c, to: "copperhill", at: { x: 4, y: C }, label: "เหมืองคอปเปอร์ฮิลล์ (Lv 15+)" },
      { x: c, y: 62, to: "sunreach", at: { x: C, y: 4 }, label: "ชายฝั่งซันรีช (Lv 20+)" },
      { x: 1, y: c, to: "thornmarsh", at: { x: 90, y: C }, label: "ชายแดนธอร์นมาร์ช (Lv 25+ ชายแดน PvP)" },
    ],
    look: "brindle",
    home: "aldermere" as ZoneId,
    decor: {},
  };
  const decor = map.decor!;
  const at = (x: number, y: number) => y * N + x;
  const street = (x: number, y: number) => (x >= c - 1 && x <= c + 2) || (y >= c - 1 && y <= c + 2);
  const plaza = (x: number, y: number) => Math.hypot(x - mid, y - mid) <= 8;
  const avenue = (x: number, y: number) => Math.abs(x - y) <= 1 && x + y >= 32 && x < c && y < c;
  const grounds = (x: number, y: number) => x >= 5 && y >= 5 && x <= 19 && y <= 19;
  const free = (x: number, y: number) => x > 0 && y > 0 && x < N - 1 && y < N - 1 && map.props[y][x] === Prop.None;
  const paved = (x: number, y: number) => map.tiles[y][x] === Tile.Cobble || map.tiles[y][x] === Tile.Plaza;
  const put = (x: number, y: number, p: Prop, frame?: string) => {
    if (!free(x, y)) return false;
    map.props[y][x] = p;
    if (frame) decor[at(x, y)] = frame;
    return true;
  };

  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (rand() < 0.06) map.tiles[y][x] = Tile.Flowers;
  // the city wall, with towers at the corners and beside each gate
  for (let i = 4; i <= N - 5; i++)
    for (const [x, y] of [[i, 4], [i, N - 5], [4, i], [N - 5, i]]) if (i < c - 2 || i > c + 3) map.props[y][x] = Prop.Wall;
  for (const [x, y] of [[4, 4], [N - 5, 4], [4, N - 5], [N - 5, N - 5], [c - 2, 4], [c + 3, 4], [c - 2, N - 5], [c + 3, N - 5], [4, c - 2], [4, c + 3], [N - 5, c - 2], [N - 5, c + 3]]) {
    map.props[y][x] = Prop.Clutter;
    decor[at(x, y)] = "walltower";
  }
  // streets of round stones from the four gates, and the grand square
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if ((x >= c - 1 && x <= c + 2 && y >= 1 && y <= N - 2) || (y >= c - 1 && y <= c + 2 && x >= 1 && x <= N - 2)) map.tiles[y][x] = Tile.Cobble;
      if (plaza(x, y)) map.tiles[y][x] = Tile.Plaza;
      if (avenue(x, y) && x >= 15) map.tiles[y][x] = Tile.Plaza;
    }

  // the castle on its hill at the back of the city, with a meadow round it
  for (let y = 5; y <= 19; y++)
    for (let x = 5; x <= 19; x++) {
      if (avenue(x, y)) continue;
      map.tiles[y][x] = rand() < 0.5 ? Tile.Flowers : Tile.Grass;
      map.props[y][x] = Prop.Big; // the castle grounds: closed to walkers
    }
  for (let y = 7; y < 16; y++) for (let x = 7; x < 16; x++) map.props[y][x] = Prop.None;
  addBig(map, { x: 7, y: 7, w: 9, h: 9, frame: "castle" });
  for (const [x, y] of [[6, 17], [8, 18], [17, 6], [18, 8], [18, 12], [12, 18], [6, 12], [12, 6], [17, 15], [15, 17]]) map.props[y][x] = Prop.Tree;
  // the avenue up to the castle: banners and lamps on both sides
  for (let k = 16; k < 25; k++) {
    for (const [x, y] of [[k + 2, k], [k, k + 2]]) {
      if (grounds(x, y)) continue;
      const n = k % 4;
      if (n === 0) put(x, y, Prop.Lamp);
      else if (n === 2) put(x, y, Prop.Clutter, `banner${(k >> 2) % 2}`);
    }
  }

  // the fountain in the middle of the square
  addBig(map, { x: c, y: c, w: 2, h: 2, frame: "fountain" });
  // a clock tower looking over the square
  addBig(map, { x: c + 7, y: c - 9, w: 2, h: 2, frame: "clocktower" });
  // the auction board, the storage and two smiths stand on the square
  map.props[c - 4][c + 6] = Prop.Board;
  map.props[c + 6][c - 4] = Prop.Chest;
  map.props[c + 5][c + 5] = Prop.Anvil;
  map.props[c + 6][c + 3] = Prop.Anvil;
  // the market: stalls round the edge of the square, with crates beside them
  const stalls: [number, number][] = [];
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const x = Math.round(mid + 6.4 * Math.cos(a));
    const y = Math.round(mid + 6.4 * Math.sin(a));
    if (street(x, y) || Math.abs(x - y) <= 2 || stalls.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) < 3)) continue;
    if ([[c + 6, c - 4], [c - 4, c + 6], [c + 5, c + 5], [c + 3, c + 6]].some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) < 2)) continue;
    if (put(x, y, Prop.Stall, `stall${k % 3}`)) stalls.push([x, y]);
  }
  for (const [x, y] of stalls) {
    const ox = x < mid ? -1 : 1;
    const oy = y < mid ? -1 : 1;
    if (rand() < 0.6) put(x + ox, y + oy, Prop.Clutter, `crate${Math.floor(rand() * 4)}`);
  }
  // benches and flower boxes round the fountain
  for (const [x, y, f] of [[c - 2, c - 2, "planter0"], [c + 3, c + 3, "planter1"], [c - 2, c + 3, "bench"], [c + 3, c - 2, "bench"]] as const) put(x, y, Prop.Clutter, f);

  // tall town houses along both sides of the streets, with alleys between
  const room = (x: number, y: number) => {
    for (let dy = -1; dy < 3; dy++)
      for (let dx = -1; dx < 3; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        const inner = dx >= 0 && dx < 2 && dy >= 0 && dy < 2;
        if (!inner) {
          // keep a ring round it free of other buildings, so nobody is walled in
          if (map.props[ty]?.[tx] === Prop.Big) return false;
          continue;
        }
        if (tx < 6 || ty < 6 || tx > N - 7 || ty > N - 7) return false;
        if (!free(tx, ty) || paved(tx, ty) || plaza(tx, ty) || street(tx, ty) || grounds(tx, ty) || Math.abs(tx - ty) <= 2) return false;
      }
    return true;
  };
  const house = (x: number, y: number) => {
    if (!room(x, y)) return false;
    addBig(map, { x, y, w: 2, h: 2, frame: `town${Math.floor(rand() * 6)}` });
    return true;
  };
  for (let i = 6; i < N - 6; i += 3) {
    house(c - 4, i);
    house(c + 4, i);
    house(i, c - 4);
    house(i, c + 4);
  }
  for (let y = 7; y < N - 7; y += 4) for (let x = 7; x < N - 7; x += 4) if (rand() < 0.8) house(x + Math.floor(rand() * 2), y + Math.floor(rand() * 2));

  // lamps along the streets, and things people leave outside their doors
  for (let i = 6; i < N - 6; i += 4) for (const [x, y] of [[c - 2, i], [c + 3, i], [i, c - 2], [i, c + 3]]) if (!plaza(x, y)) put(x, y, Prop.Lamp);
  const things = ["barrel0", "barrel1", "crate0", "crate1", "crate2", "crate3", "sacks", "bench", "planter0", "planter1"];
  for (let y = 6; y < N - 6; y++)
    for (let x = 6; x < N - 6; x++) {
      if (!free(x, y) || street(x, y) || plaza(x, y) || grounds(x, y) || Math.abs(x - y) <= 2) continue;
      const nearHouse = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => map.props[y + dy]?.[x + dx] === Prop.Big);
      const r = rand();
      if (nearHouse && r < 0.08) put(x, y, Prop.Clutter, things[Math.floor(rand() * things.length)]);
      else if (!nearHouse && r < 0.06) put(x, y, Prop.Tree);
      else if (!nearHouse && r < 0.08) put(x, y, Prop.Clutter, rand() < 0.5 ? "planter0" : "bench");
    }
  // outside the walls: a ring of trees
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
      if (edge <= 1 && map.tiles[y][x] !== Tile.Cobble) map.props[y][x] = Prop.Tree;
      else if (edge <= 3 && map.props[y][x] === Prop.None && map.tiles[y][x] !== Tile.Cobble && rand() < 0.25) map.props[y][x] = Prop.Tree;
    }
  for (const e of map.exits) {
    map.tiles[e.y][e.x] = Tile.Cobble;
    map.props[e.y][e.x] = Prop.None;
  }
  unblock(map, 5, N - 6);
  return map;
}

/**
 * Small things (trees, clutter, lamps) that leave a walkable tile shut in are
 * taken away again, so every bit of street can be reached.
 */
function unblock(map: GameMap, lo: number, hi: number) {
  const small = [Prop.Tree, Prop.Clutter, Prop.Lamp, Prop.Stall];
  for (let pass = 0; pass < 3; pass++) {
    const seen = new Set<number>();
    const todo = [map.spawn];
    seen.add(map.spawn.y * map.width + map.spawn.x);
    while (todo.length) {
      const p = todo.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = p.x + dx;
        const y = p.y + dy;
        const k = y * map.width + x;
        if (seen.has(k) || x < 0 || y < 0 || x >= map.width || y >= map.height || map.props[y][x] !== Prop.None) continue;
        seen.add(k);
        todo.push({ x, y });
      }
    }
    let changed = false;
    for (let y = lo; y <= hi; y++)
      for (let x = lo; x <= hi; x++) {
        if (map.props[y][x] !== Prop.None || seen.has(y * map.width + x)) continue;
        // shut in: open the first small thing next to it
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const p = map.props[y + dy]?.[x + dx];
          if (p !== undefined && small.includes(p)) {
            map.props[y + dy][x + dx] = Prop.None;
            delete map.decor?.[(y + dy) * map.width + x + dx];
            changed = true;
            break;
          }
        }
      }
    if (!changed) break;
  }
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
    { kind: "guard", x: 32, y: 7, radius: 1, count: 2, respawnMs: 20000 },
    { kind: "guard", x: 7, y: 33, radius: 1, count: 2, respawnMs: 20000 },
    { kind: "guard", x: 56, y: 33, radius: 1, count: 2, respawnMs: 20000 },
    { kind: "guard", x: 33, y: 56, radius: 1, count: 2, respawnMs: 20000 },
    { kind: "guard", x: 22, y: 23, radius: 1, count: 2, respawnMs: 20000 },
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
