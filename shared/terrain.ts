/**
 * Height: every tile has a whole level, and ramps join one level to the next.
 * You can only change level along a ramp, never up or down a cliff. Both sides
 * use this: the server to decide, the client to draw and to show where you can go.
 */
import { GameMap, isWalkable, Prop, Tile } from "./map";
import type { Point } from "./pathfinding";

/** The way uphill on a ramp tile: 1 = +x, 2 = -x, 3 = +y, 4 = -y (0 = not a ramp). */
export const RAMP_DIR: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

const inside = (map: GameMap, x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height;
/** Whole level of a tile (the low end, for ramps). */
export const levelOf = (map: GameMap, x: number, y: number) => map.level[y]?.[x] ?? 0;
export const rampOf = (map: GameMap, x: number, y: number) => map.ramp[y]?.[x] ?? 0;

/** Can you step from one tile to the tile right next to it (no diagonals)? Height only. */
function stepHeight(map: GameMap, ax: number, ay: number, bx: number, by: number): boolean {
  const ra = rampOf(map, ax, ay);
  const rb = rampOf(map, bx, by);
  const la = levelOf(map, ax, ay);
  const lb = levelOf(map, bx, by);
  const dx = bx - ax;
  const dy = by - ay;
  if (!ra && !rb) return la === lb;
  if (ra && rb) {
    if (ra !== rb) return false;
    const [ux, uy] = RAMP_DIR[ra];
    if (dx === ux && dy === uy) return lb === la + 1;
    if (dx === -ux && dy === -uy) return la === lb + 1;
    return la === lb; // side by side
  }
  if (rb) return stepHeight(map, bx, by, ax, ay);
  // from a ramp onto plain ground: only off its top or its bottom
  const [ux, uy] = RAMP_DIR[ra];
  if (dx === ux && dy === uy) return lb === la + 1;
  if (dx === -ux && dy === -uy) return lb === la;
  return false;
}

/** Can you walk from a tile to one of its eight neighbours? */
export function canStep(map: GameMap, ax: number, ay: number, bx: number, by: number): boolean {
  if (!isWalkable(map, bx, by)) return false;
  const dx = bx - ax;
  const dy = by - ay;
  if (!dx || !dy) return stepHeight(map, ax, ay, bx, by);
  // a diagonal must be fine both ways round, so nobody cuts a corner
  return (
    isWalkable(map, bx, ay) &&
    isWalkable(map, ax, by) &&
    stepHeight(map, ax, ay, bx, ay) &&
    stepHeight(map, bx, ay, bx, by) &&
    stepHeight(map, ax, ay, ax, by) &&
    stepHeight(map, ax, by, bx, by)
  );
}

/** Height of the ground under any point, also between tiles and on ramps. */
export function heightAt(map: GameMap, x: number, y: number): number {
  const tx = Math.max(0, Math.min(map.width - 1, Math.round(x)));
  const ty = Math.max(0, Math.min(map.height - 1, Math.round(y)));
  const l = map.level[ty][tx];
  const r = map.ramp[ty][tx];
  if (!r) return l;
  const [ux, uy] = RAMP_DIR[r];
  const t = 0.5 + (x - tx) * ux + (y - ty) * uy;
  return l + Math.max(0, Math.min(1, t));
}

/** Nothing solid in between: cliffs higher than both ends, houses and ruins block the view. */
export function lineOfSight(map: GameMap, a: Point, b: Point): boolean {
  const top = Math.max(heightAt(map, a.x, a.y), heightAt(map, b.x, b.y)) + 0.6;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.ceil(d / 0.3);
  for (let i = 1; i < n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const y = a.y + ((b.y - a.y) * i) / n;
    const tx = Math.round(x);
    const ty = Math.round(y);
    const prop = map.props[ty]?.[tx];
    if (prop === Prop.House || prop === Prop.Ruin || prop === Prop.Windmill) return false;
    if (heightAt(map, x, y) > top) return false;
  }
  return true;
}

/** Close enough to hit: near blows need nearly the same height, shots need a clear view. */
export function inReach(map: GameMap, a: Point, b: Point, range: number): boolean {
  if (Math.hypot(a.x - b.x, a.y - b.y) > range) return false;
  if (range > 2.5) return lineOfSight(map, a, b);
  return Math.abs(heightAt(map, a.x, a.y) - heightAt(map, b.x, b.y)) <= 0.75;
}

/** All tiles that can be walked to from `start` (numbered y * width + x). */
export function reachableFrom(map: GameMap, start: Point): Set<number> {
  const seen = new Set<number>([start.y * map.width + start.x]);
  const todo = [start];
  while (todo.length) {
    const { x, y } = todo.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (y + dy) * map.width + x + dx;
      if (seen.has(k) || !canStep(map, x, y, x + dx, y + dy)) continue;
      seen.add(k);
      todo.push({ x: x + dx, y: y + dy });
    }
  }
  return seen;
}

// ---- building land -----------------------------------------------------------

export function grid<T>(w: number, h: number, v: T): T[][] {
  return Array.from({ length: h }, () => new Array<T>(w).fill(v));
}

/**
 * Raises an oval by one level (only ground that is exactly one lower), and cuts
 * ramps into it on the given sides: "s" = the ramp is on the south side, and so on.
 */
export function mesa(map: GameMap, cx: number, cy: number, rx: number, ry: number, ramps: string, width = 2) {
  const base = levelOf(map, Math.round(cx), Math.round(cy));
  const dry = (t: Tile) => t !== Tile.Water && t !== Tile.Void && t !== Tile.Bridge;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (!inside(map, x, y) || ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      if (map.level[y][x] === base && !map.ramp[y][x] && dry(map.tiles[y][x])) map.level[y][x] = base + 1;
    }
  for (const side of ramps) {
    // outward direction, sideways direction, and the code for "uphill"
    const [ox, oy, sx, sy, code] = { s: [0, 1, 1, 0, 4], n: [0, -1, 1, 0, 3], e: [1, 0, 0, 1, 2], w: [-1, 0, 0, 1, 1] }[side]!;
    // the ramp is cut straight into the hill, so all its columns line up
    let d = 0;
    const at = (k: number, w: number) => ({ x: Math.round(cx) + ox * k + sx * w, y: Math.round(cy) + oy * k + sy * w });
    const cols = Array.from({ length: width }, (_, i) => i);
    while (d < 60 && cols.every((w) => levelOf(map, at(d, w).x, at(d, w).y) > base)) d++;
    for (const w of cols) {
      const p = at(d, w);
      if (!inside(map, p.x, p.y)) continue;
      map.level[p.y][p.x] = base;
      map.ramp[p.y][p.x] = code;
      // clear the way above and below, and flatten what sticks out in front
      for (let k = 1; k <= 2; k++) {
        const out = at(d + k, w);
        if (inside(map, out.x, out.y)) {
          map.level[out.y][out.x] = base;
          map.ramp[out.y][out.x] = 0;
          map.props[out.y][out.x] = Prop.None;
        }
        const up = at(d - k, w);
        if (inside(map, up.x, up.y)) map.props[up.y][up.x] = Prop.None;
      }
      map.props[p.y][p.x] = Prop.None;
    }
  }
}

/** Draws a path through these points; it becomes a bridge where it meets water. */
export function road(map: GameMap, points: [number, number][], tile: Tile = Tile.Path) {
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1) * 2;
    for (let k = 0; k <= n; k++) {
      const x = Math.round(ax + ((bx - ax) * k) / n);
      const y = Math.round(ay + ((by - ay) * k) / n);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        if (!inside(map, x + dx, y + dy)) continue;
        const t = map.tiles[y + dy][x + dx];
        map.tiles[y + dy][x + dx] = t === Tile.Water || t === Tile.Bridge ? Tile.Bridge : tile;
        map.props[y + dy][x + dx] = Prop.None;
      }
    }
  }
}

/** A river: water along a curve x = f(y), `w` tiles wide. Land beside it stays as it is. */
export function river(map: GameMap, f: (y: number) => number, w: number, y0 = 0, y1 = map.height - 1) {
  for (let y = y0; y <= y1; y++) {
    const x0 = Math.round(f(y));
    for (let x = x0; x < x0 + w; x++)
      if (inside(map, x, y)) {
        map.tiles[y][x] = Tile.Water;
        map.props[y][x] = Prop.None;
        map.level[y][x] = 0;
      }
  }
}

/** Tile numbers inside an oval, for regions that open and close. */
export function oval(map: GameMap, cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) if (inside(map, x, y) && Math.hypot(x - cx, y - cy) <= r) out.push(y * map.width + x);
  return out;
}

/** Opens or closes a region of the map (fog, fallen ground). */
export function setRegion(map: GameMap, id: string, closed: boolean) {
  for (const k of map.regions[id] ?? []) {
    if (closed) map.closed.add(k);
    else map.closed.delete(k);
  }
}
