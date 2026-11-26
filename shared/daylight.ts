/** Day and night. Everyone works it out from the clock, so it is the same for all. */

export const DAY_MS = 8 * 60_000;
export const NIGHT_MS = 4 * 60_000;
const CYCLE = DAY_MS + NIGHT_MS;
/** How long dusk and dawn take. */
const FADE = 25_000;

export function isNight(now = Date.now()): boolean {
  return now % CYCLE >= DAY_MS;
}

/** 0 = bright day, 1 = full night, in between at dusk and dawn. */
export function darkness(now = Date.now()): number {
  const t = now % CYCLE;
  if (t < FADE) return 1 - t / FADE; // dawn
  if (t < DAY_MS - FADE) return 0;
  if (t < DAY_MS) return (t - (DAY_MS - FADE)) / FADE; // dusk
  return 1;
}

/** Milliseconds until day turns to night, or night to day. */
export function untilChange(now = Date.now()): number {
  const t = now % CYCLE;
  return t < DAY_MS ? DAY_MS - t : CYCLE - t;
}
