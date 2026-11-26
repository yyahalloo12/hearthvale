import Phaser from "phaser";

/**
 * Sprite sheets rendered from the Blender scripts in /art. Every sheet has 8
 * rows (facings 0-7) and one column per animation frame.
 */

/** Where the feet are in a frame, from the camera numbers in art/*.py. */
const feet = (view: number, look: number) => 0.5 + (look * Math.cos(Math.PI / 6)) / view;

export const PLAYER_SHEET = {
  w: 128,
  h: 144,
  cols: 13,
  scale: 0.68,
  originY: feet(2.42, 0.8),
  idle: [0, 1],
  walk: [2, 3, 4, 5, 6, 7],
  attack: [8, 9, 10, 11],
  dead: 12,
};
/** The scenery atlas is drawn at twice its size on screen. */
export const SCENERY_SCALE = 0.5;
export const PLAYER_LAYERS = ["base", "tunic", "helm", "sword", "axe", "bow", "staff"] as const;

export interface MonsterSheet {
  w: number;
  h: number;
  scale: number;
  originY: number;
  /** rough size on screen, for clicking and labels */
  height: number;
  r: number;
  /** uses another monster's pictures (giants are big, tinted copies) */
  tex?: string;
  tint?: number;
}
const mon = (w: number, h: number, view: number, look: number, scale: number, height: number, r: number): MonsterSheet => ({
  w,
  h,
  scale,
  originY: feet(view, look),
  height,
  r,
});
export const MONSTER_COLS = 7;
export const MONSTER_SHEETS: Record<string, MonsterSheet> = {
  hen: mon(120, 96, 1.75, 0.5, 0.78, 44, 22),
  rat: mon(112, 96, 1.92, 0.42, 0.85, 38, 24),
  scarecrow: mon(128, 144, 2.45, 0.78, 0.7, 70, 26),
  henqueen: mon(224, 192, 2.1, 0.6, 0.75, 84, 38),
  shadow: mon(96, 120, 2.05, 0.64, 0.78, 54, 24),
  hunter: mon(144, 168, 3.0, 0.92, 0.82, 80, 28),
  wolf: mon(136, 112, 1.95, 0.48, 0.8, 46, 26),
  wisp: mon(112, 112, 2.0, 0.66, 0.78, 58, 24),
  bear: mon(152, 152, 2.35, 0.74, 0.8, 66, 32),
  treant: mon(296, 296, 3.7, 1.2, 0.82, 150, 56),
  threadknight: mon(176, 184, 2.95, 0.9, 0.76, 78, 32),
};
MONSTER_SHEETS.scarecrowking = { ...MONSTER_SHEETS.scarecrow, scale: 1.75, height: 150, r: 48, tex: "scarecrow", tint: 0xffc08a };
MONSTER_SHEETS.bearking = { ...MONSTER_SHEETS.bear, scale: 1.9, height: 150, r: 62, tex: "bear", tint: 0xffd36a };

/** Loads all sheets once; later maps reuse them. */
export function loadSprites(scene: Phaser.Scene) {
  const sheet = (key: string, w: number, h: number) => {
    if (!scene.textures.exists(key)) scene.load.spritesheet(key, `/art/${key}.png`, { frameWidth: w, frameHeight: h });
  };
  if (!scene.textures.exists("scenery")) scene.load.atlas("scenery", "/art/scenery.png", "/art/scenery.json");
  for (const l of PLAYER_LAYERS) sheet(`player-${l}`, PLAYER_SHEET.w, PLAYER_SHEET.h);
  for (const [k, s] of Object.entries(MONSTER_SHEETS)) if (!s.tex) sheet(`mon-${k}`, s.w, s.h);
}
