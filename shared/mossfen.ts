/** Mossfen Forest (GDD 5.2): levels 10-20, peaceful, west entrance from Brindle. */
import { GameMap, Prop, rng, Tile } from "./map";

const SIZE = 64;

export function buildMossfen(): GameMap {
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
    id: "mossfen",
    name: "Mossfen Forest",
    pvp: false,
    width: SIZE,
    height: SIZE,
    tiles,
    props,
    spawn: { x: start[0] + 2, y: trail[4][1] },
    safe: { x: start[0] + 1, y: start[1], r: 5 },
    exits: [{ x: 2, y: trail[0][1], to: "brindle", at: { x: 41, y: 24 }, label: "หมู่บ้านบรินเดิล" }],
  };
}
