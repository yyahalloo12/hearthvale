import { TILE_H, TILE_W } from "../../shared/constants";
import type { GameMap } from "../../shared/map";
import { heightAt } from "../../shared/terrain";

/** Pixels one level of height lifts things on screen. */
export const LEVEL_H = 24;

let map: GameMap | null = null;
export function setIsoMap(m: GameMap) {
  map = m;
}

/** Tile coordinates to world pixels (centre of the tile diamond), as if the land were flat. */
export function toScreen(x: number, y: number) {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

/** Where something standing here is drawn, and how it sorts with what is around it. */
export function place(x: number, y: number) {
  const p = toScreen(x, y);
  return { x: p.x, y: p.y - (map ? heightAt(map, x, y) * LEVEL_H : 0), depth: p.y };
}

/** World pixels back to the tile under them; the highest (front-most) ground wins. */
export function toTile(px: number, py: number) {
  const at = (y: number) => {
    const a = px / (TILE_W / 2);
    const b = y / (TILE_H / 2);
    return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
  };
  if (map)
    for (let h = 3.5; h > 0; h -= 0.5) {
      const t = at(py + h * LEVEL_H);
      const level = map.level[t.y]?.[t.x];
      if (level === undefined) continue;
      if (level + (map.ramp[t.y][t.x] ? 0.5 : 0) === h) return t;
    }
  return at(py);
}
