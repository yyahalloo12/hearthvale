import { TILE_H, TILE_W } from "../../shared/constants";

/** Tile coordinates to world pixels (centre of the tile diamond). */
export function toScreen(x: number, y: number) {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

/** World pixels back to the tile under them. */
export function toTile(px: number, py: number) {
  const a = px / (TILE_W / 2);
  const b = py / (TILE_H / 2);
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}
