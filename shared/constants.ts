/** Shared numbers that both the server and the client must agree on. */

/** Server simulation ticks per second. */
export const TICK_RATE = 20;

/** Walking speed in tiles per second. */
export const WALK_SPEED = 4;

/** Longest path (in steps) the server will plan for one click. */
export const MAX_PATH_STEPS = 80;

/** Most players allowed in one map room (GDD: under 100 online). */
export const MAX_PLAYERS_PER_ROOM = 100;

export const NAME_MIN = 2;
export const NAME_MAX = 16;
export const CHAT_MAX = 120;
/** Minimum milliseconds between two chat messages from one player. */
export const CHAT_COOLDOWN_MS = 600;

/** Tunic colours a new wanderer can pick on the login screen. */
export const TUNIC_COLORS = [
  0xd94f4f, // red
  0xe8913a, // orange
  0xe6c84a, // yellow
  0x5bb85b, // green
  0x4a90d9, // blue
  0x9b6bd6, // purple
] as const;

/** Isometric tile size in pixels (2:1 diamond). */
export const TILE_W = 64;
export const TILE_H = 32;
