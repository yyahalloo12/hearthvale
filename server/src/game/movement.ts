import { Point } from "../../../shared/pathfinding";

/** Turns a step on the tile grid into one of 8 facings on screen. */
export function facingFor(dx: number, dy: number): number {
  const sx = dx - dy;
  const sy = (dx + dy) / 2;
  if (sx === 0 && sy === 0) return 0;
  // angle 0 = screen down, increasing clockwise (towards screen left).
  const angle = Math.atan2(-sx, sy);
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}

export interface Body {
  x: number;
  y: number;
  facing: number;
  moving: boolean;
}

/** Moves `body` along `path` (consuming reached tiles) by `speed * dt` tiles. */
export function stepAlong(body: Body, path: Point[], speed: number, dt: number) {
  let budget = speed * dt;
  while (budget > 0 && path.length) {
    const next = path[0];
    const dx = next.x - body.x;
    const dy = next.y - body.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1e-4) body.facing = facingFor(Math.sign(Math.round(dx * 10)), Math.sign(Math.round(dy * 10)));
    if (dist <= budget) {
      body.x = next.x;
      body.y = next.y;
      budget -= dist;
      path.shift();
    } else {
      body.x += (dx / dist) * budget;
      body.y += (dy / dist) * budget;
      budget = 0;
    }
  }
  const moving = path.length > 0;
  if (body.moving !== moving) body.moving = moving;
}

/** Face from one body towards another. */
export function faceTowards(body: Body, to: { x: number; y: number }) {
  const dx = to.x - body.x;
  const dy = to.y - body.y;
  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;
  const sx = dx - dy;
  const sy = (dx + dy) / 2;
  const angle = Math.atan2(-sx, sy);
  body.facing = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}

/** The tile to plan a new path from: the one being stepped into, or the nearest. */
export function planFrom(body: Body, path: Point[]): Point {
  return path.length ? path[0] : { x: Math.round(body.x), y: Math.round(body.y) };
}

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
