/** Mossfen Forest (GDD 5.2): levels 10-20, peaceful, west entrance from Brindle. */
import { GameMap, nearRamp, Prop, rng, Tile } from "./map";
import { grid, mesa, oval, river, road, setRegion } from "./terrain";

const BIG = 112;
const SIZE = 64;

/** The three lantern stones that open the fog. */
export const LANTERNS = [
  { x: 74, y: 22 },
  { x: 30, y: 92 },
  { x: 100, y: 52 },
];
export const GROVE = { x: 86, y: 80 };

export function buildMossfen(): GameMap {
  const old = buildOldForest();
  const rand = rng(5151);
  const map: GameMap = {
    ...old,
    width: BIG,
    height: BIG,
    tiles: grid<Tile>(BIG, BIG, Tile.Moss),
    props: grid<Prop>(BIG, BIG, Prop.None),
    level: grid(BIG, BIG, 0),
    ramp: grid(BIG, BIG, 0),
    regions: {},
    closed: new Set(),
    springs: [],
    exits: [{ x: 2, y: old.door, to: "brindle", at: { x: 77, y: 24 }, label: "หมู่บ้านบรินเดิล" }],
  };
  for (let y = 0; y < BIG; y++)
    for (let x = 0; x < BIG; x++) {
      if (x < SIZE && y < SIZE) {
        map.tiles[y][x] = old.tiles[y][x];
        map.props[y][x] = old.props[y][x] === Prop.Tree && (x >= 61 || y >= 61) ? Prop.None : old.props[y][x];
      } else if (rand() < 0.16) map.tiles[y][x] = Tile.Fern;
    }

  river(map, (y) => 67 + 3 * Math.sin(y / 8), 3);
  for (const [px, py, r] of [[92, 12, 3.4], [44, 78, 4], [14, 84, 3], [104, 78, 3.2], [58, 102, 3.4]])
    for (const k of oval(map, px, py, r)) map.tiles[Math.floor(k / BIG)][k % BIG] = Tile.Water;
  road(map, [[52, 20], [60, 30], [80, 32], [84, 48], [96, 60], [92, 100]]);
  road(map, [[30, 40], [34, 62], [26, 78], [40, 92], [66, 98], [92, 100]]);

  // Forest hills, rising towards the back.
  mesa(map, 80, 12, 10, 8, "sw");
  mesa(map, 80, 10, 6, 4.5, "s");
  mesa(map, 100, 34, 8, 9, "wn");
  mesa(map, 101, 32, 5, 5, "s");
  mesa(map, 20, 70, 9, 5, "se");
  mesa(map, 12, 102, 8, 6, "ne");
  mesa(map, 48, 68, 7, 5, "se");
  mesa(map, 48, 67, 4, 3, "e");
  mesa(map, 74, 60, 6, 5, "s");
  // The hidden grove: two storeys, and the only way up is a ramp wrapped in fog.
  mesa(map, GROVE.x, GROVE.y, 13, 11, "ws");
  mesa(map, GROVE.x, GROVE.y - 1, 7, 6, "s", 2);
  const fog: number[] = [];
  for (let y = GROVE.y; y < GROVE.y + 10; y++)
    for (let x = GROVE.x - 2; x <= GROVE.x + 3; x++)
      if (map.ramp[y][x] && map.level[y][x] === 1) fog.push(y * BIG + x);
  map.regions.fog = fog;

  for (let y = 0; y < BIG; y++)
    for (let x = 0; x < BIG; x++) {
      if (x < 61 && y < 61) continue;
      const t = map.tiles[y][x];
      if (map.props[y][x] !== Prop.None || t === Tile.Path || t === Tile.Water || t === Tile.Bridge) continue;
      const edge = Math.min(x, y, BIG - 1 - x, BIG - 1 - y);
      if (edge <= 1) {
        map.props[y][x] = Prop.Tree;
        continue;
      }
      if (map.ramp[y][x] || nearRamp(map, x, y) || Math.hypot(x - GROVE.x, y - GROVE.y + 1) < 8) continue;
      if (LANTERNS.some((l) => Math.hypot(x - l.x, y - l.y) < 2.5)) continue;
      if (rand() < 0.1) map.props[y][x] = Prop.Tree;
      else if (rand() < 0.022) map.props[y][x] = Prop.Rock;
      else if (rand() < 0.03) map.props[y][x] = Prop.Bush;
    }
  for (const l of LANTERNS) map.props[l.y][l.x] = Prop.Lantern;
  map.props[GROVE.y - 2][GROVE.x] = Prop.Treasure;
  // treasure grove: rich rocks and glowing mushrooms around the chest
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.round(GROVE.x + Math.cos(a) * 4.6);
    const y = Math.round(GROVE.y - 1 + Math.sin(a) * 3.8);
    if (map.level[y][x] === 2 && !map.ramp[y][x] && !nearRamp(map, x, y)) map.props[y][x] = i % 2 ? Prop.Rock : Prop.Bush;
  }
  setRegion(map, "fog", true);
  return map;
}

function buildOldForest() {
  const rand = rng(4242);
  const tiles: Tile[][] = [];
  const props: Prop[][] = [];
  for (let y = 0; y < SIZE; y++) {
    tiles.push(new Array(SIZE).fill(Tile.Moss));
    props.push(new Array(SIZE).fill(Prop.None));
  }
  const set = (x: number, y: number, t: Tile) => {
    if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) tiles[y][x] = t;
  };

  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) if (rand() < 0.16) tiles[y][x] = Tile.Fern;

  // Still forest pools.
  const pools = [
    [20, 33, 3.4], [33, 25, 3.0], [40, 47, 3.8], [12, 52, 2.8], [26, 8, 2.6], [54, 36, 2.8],
  ];
  for (const [px, py, r] of pools)
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) if (Math.hypot(x - px, (y - py) * 1.1) < r) tiles[y][x] = Tile.Water;

  // A winding trail from the entrance in the west to the glade of the old tree.
  const trail: [number, number][] = [];
  for (let x = 2; x <= 52; x++) trail.push([x, Math.round(40 + 6 * Math.sin(x / 7) - Math.max(0, x - 20) * 0.75)]);
  for (let i = 0; i < trail.length; i++) {
    const [x, y] = trail[i];
    const prev = trail[i - 1]?.[1] ?? y;
    for (let yy = Math.min(y, prev); yy <= Math.max(y, prev) + 1; yy++) set(x, yy, Tile.Path);
  }
  const glade = { x: 54, y: 14 };
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - glade.x, y - glade.y);
      if (d < 7) tiles[y][x] = d < 3.2 ? Tile.Flowers : Tile.Fern;
    }

  const start = trail[2];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const t = tiles[y][x];
      if (t === Tile.Path || t === Tile.Water) continue;
      const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
      const open = Math.hypot(x - glade.x, y - glade.y) < 6.5 || Math.hypot(x - start[0], y - start[1]) < 4;
      if (edge <= 1) props[y][x] = Prop.Tree;
      else if (open) continue;
      else if (rand() < 0.1) props[y][x] = Prop.Tree;
      else if (rand() < 0.022) props[y][x] = Prop.Rock;
      else if (rand() < 0.03) props[y][x] = Prop.Bush;
    }
  // the way out stays clear
  for (let x = 0; x <= 3; x++) {
    const y = trail[0][1];
    tiles[y][x] = Tile.Path;
    props[y][x] = Prop.None;
  }
  props[trail[0][1]][0] = Prop.Tree;

  return {
    id: "mossfen" as const,
    name: "Mossfen Forest",
    pvp: false,
    door: trail[0][1],
    tiles,
    props,
    spawn: { x: start[0] + 2, y: trail[4][1] },
    safe: { x: start[0] + 1, y: start[1], r: 5 },
  };
}
