import { GameMap, isWalkable } from "./map";

export interface Point {
  x: number;
  y: number;
}

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * A* on the tile grid with 8 directions. Diagonal steps may not cut the
 * corner of a blocked tile. Returns the tiles to walk through, excluding the
 * start, or null when there is no path within `maxSteps`.
 */
export function findPath(map: GameMap, start: Point, goal: Point, maxSteps = 80): Point[] | null {
  if (!isWalkable(map, goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const W = map.width;
  const key = (x: number, y: number) => y * W + x;
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  if (h(start.x, start.y) > maxSteps) return null;

  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const closed = new Set<number>();
  // Simple binary heap of [f, key].
  const heap: [number, number][] = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  const sk = key(start.x, start.y);
  const gk = key(goal.x, goal.y);
  g.set(sk, 0);
  push([h(start.x, start.y), sk]);
  let expanded = 0;

  while (heap.length) {
    const [, k] = pop();
    if (k === gk) break;
    if (closed.has(k)) continue;
    closed.add(k);
    if (++expanded > 4000) return null;
    const x = k % W;
    const y = (k - x) / W;
    const gc = g.get(k)!;
    if (gc > maxSteps) continue;
    for (const [dx, dy, cost] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(map, nx, ny)) continue;
      if (dx && dy && (!isWalkable(map, x + dx, y) || !isWalkable(map, x, y + dy))) continue;
      const nk = key(nx, ny);
      const ng = gc + cost;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, k);
        push([ng + h(nx, ny), nk]);
      }
    }
  }

  if (!came.has(gk)) return null;
  const path: Point[] = [];
  let k = gk;
  while (k !== sk) {
    path.push({ x: k % W, y: Math.floor(k / W) });
    k = came.get(k)!;
  }
  path.reverse();
  return path.length <= maxSteps ? path : null;
}
