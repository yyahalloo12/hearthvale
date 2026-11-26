import Phaser from "phaser";
import { TILE_H, TILE_W } from "../../shared/constants";
import { GameMap, lookOf, Prop, Tile } from "../../shared/map";

/**
 * The ground colours (drawn with code) and which Blender-rendered scenery
 * frame goes where. Scenery itself is made in /art/scenery.py.
 */

const HW = TILE_W / 2;
const HH = TILE_H / 2;

function diamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, hw = HW, hh = HH) {
  g.beginPath();
  g.moveTo(cx, cy - hh);
  g.lineTo(cx + hw, cy);
  g.lineTo(cx, cy + hh);
  g.lineTo(cx - hw, cy);
  g.closePath();
}

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Seeded sprinkle of little dots so tiles do not look flat. */
function speckle(g: Phaser.GameObjects.Graphics, color: number, count: number, seed: number, alpha = 1) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle(color, alpha);
  for (let i = 0; i < count; i++) {
    // random point inside the diamond
    const u = (r() - 0.5) * 0.9;
    const v = (r() - 0.5) * 0.9;
    g.fillRect(Math.round(1 + HW + (u - v) * HW), Math.round(1 + HH + (u + v) * HH), 2, 1);
  }
}

/** One ground diamond, one pixel bigger all round so no gaps show between tiles. */
function tile(scene: Phaser.Scene, key: string, base: number, extra?: (g: Phaser.GameObjects.Graphics) => void) {
  // "-h1".."-h3": the same ground higher up, in brighter, sunnier colours
  for (let h = 0; h <= 3; h++)
    make(scene, h ? `${key}-h${h}` : key, TILE_W + 2, TILE_H + 2, (g) => {
      const k = h * 0.11;
      const mix = (v: number, to: number) => Math.round(v + (to - v) * k);
      g.fillStyle((mix((base >> 16) & 255, 255) << 16) | (mix((base >> 8) & 255, 250) << 8) | mix(base & 255, 170));
      diamond(g, HW + 1, HH + 1, HW + 1, HH + 1);
      g.fillPath();
      extra?.(g);
    });
}

export function makeTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("t-ash")) return; // already made for an earlier map
  tile(scene, "t-grass-0", 0x7cc95a, (g) => speckle(g, 0x8ad468, 9, 7));
  tile(scene, "t-grass-1", 0x79c657, (g) => speckle(g, 0x6bb84b, 8, 19));
  tile(scene, "t-grass-2", 0x80cd5e, (g) => speckle(g, 0x92da70, 8, 41));
  tile(scene, "t-path", 0xdcbb84, (g) => speckle(g, 0xc9a56c, 10, 5));
  tile(scene, "t-plaza", 0xa59d8f);
  // round street stones, warm and worn
  for (let v = 0; v < 3; v++)
    tile(scene, `t-cobble-${v}`, 0xb8a888, (g) => {
      let s = 11 + v * 17;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 26; i++) {
        const u = (r() - 0.5) * 0.92;
        const w = (r() - 0.5) * 0.92;
        const x = 1 + HW + (u - w) * HW;
        const y = 1 + HH + (u + w) * HH;
        g.fillStyle(r() < 0.5 ? 0xcbbd9e : 0xa8987a, 1);
        g.fillEllipse(x, y, 7 + r() * 3, 3.5 + r() * 1.5);
        g.fillStyle(0xe2d7bd, 0.6);
        g.fillEllipse(x - 1, y - 1, 3, 1.4);
      }
    });
  tile(scene, "t-water", 0x4fa8e0, (g) => {
    g.fillStyle(0x9bd6fb, 0.75);
    g.fillRoundedRect(HW - 12, HH - 4, 12, 2, 1);
    g.fillRoundedRect(HW + 5, HH + 5, 10, 2, 1);
  });
  tile(scene, "t-sand", 0xf0dc9c, (g) => speckle(g, 0xe2cc84, 10, 13));
  // The Hollow: grey, washed-out ground and torn holes.
  tile(scene, "t-ash", 0x75707e, (g) => speckle(g, 0x827c8c, 9, 17));
  tile(scene, "t-pale", 0x625d6c);
  // Mossfen: deep green, with lighter ferny patches.
  tile(scene, "t-moss-0", 0x5f9f4f, (g) => speckle(g, 0x6cae5a, 9, 7));
  tile(scene, "t-moss-1", 0x5b9a4c, (g) => speckle(g, 0x4e8a42, 8, 19));
  tile(scene, "t-fern", 0x68aa56, (g) => speckle(g, 0x7aba66, 10, 41));
  tile(scene, "t-trail", 0xb59a70, (g) => speckle(g, 0xa08860, 10, 5));
  tile(scene, "t-pool", 0x3f8f9a, (g) => {
    g.fillStyle(0x86c9c4, 0.7);
    g.fillRoundedRect(HW - 10, HH - 3, 11, 2, 1);
  });
  tile(scene, "t-bridge", 0x6b4226);
  tile(scene, "t-spring", 0x6f7fb8, (g) => {
    g.fillStyle(0xd8c8ff, 0.6);
    g.fillRoundedRect(HW - 10, HH - 3, 11, 2, 1);
  });
  tile(scene, "t-void", 0x1a1722, (g) => speckle(g, 0x6a4a9a, 5, 31, 0.8));

  make(scene, "c-shadow", 32, 12, (g) => {
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(16, 6, 30, 10);
  });
  // warm light round a street lamp at night
  make(scene, "lamp-glow", 120, 120, (g) => {
    for (let i = 12; i > 0; i--) {
      g.fillStyle(0xffc860, 0.075);
      g.fillCircle(60, 60, i * 5);
    }
  });
  // a falling leaf
  make(scene, "leaf", 10, 6, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(5, 3, 9, 4);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(1, 3, 8, 1);
  });
  make(scene, "click-marker", 40, 20, (g) => {
    g.lineStyle(2, 0xffffff, 0.9);
    diamond(g, 20, 10, 18, 9);
    g.strokePath();
  });
}

/** A steady random number 0..1 for a tile, so every visit looks the same. */
export function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + salt * 1013 + 1274126177, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const pick = (x: number, y: number, n: number, salt: number) => Math.floor(hash(x, y, salt) * n);

export function groundKey(t: Tile, x: number, y: number, map?: GameMap): string {
  if (map && lookOf(map) === "mossfen") {
    if (t === Tile.Path) return "t-trail";
    if (t === Tile.Water) return "t-pool";
    if (t === Tile.Flowers) return "t-fern";
  }
  switch (t) {
    case Tile.Bridge:
      return "t-bridge";
    case Tile.Spring:
      return "t-spring";
    case Tile.Moss:
      return `t-moss-${pick(x, y, 2, 1)}`;
    case Tile.Fern:
      return "t-fern";
    case Tile.Path:
      return "t-path";
    case Tile.Plaza:
      return "t-plaza";
    case Tile.Cobble:
      return `t-cobble-${pick(x, y, 3, 5)}`;
    case Tile.Water:
      return "t-water";
    case Tile.Sand:
      return "t-sand";
    case Tile.Ash:
      return "t-ash";
    case Tile.Pale:
      return "t-pale";
    case Tile.Void:
      return "t-void";
    default:
      return `t-grass-${pick(x, y, 3, 1)}`;
  }
}

/** Small detail lying on this ground tile, if any. */
export function groundDetail(t: Tile, x: number, y: number): string | null {
  const r = hash(x, y, 2);
  switch (t) {
    case Tile.Grass:
      return r < 0.3 ? `g-tuft${pick(x, y, 3, 3)}` : null;
    case Tile.Flowers:
      return `g-flower${pick(x, y, 3, 3)}`;
    case Tile.Path:
      return r < 0.28 ? `g-pebble${pick(x, y, 2, 3)}` : null;
    case Tile.Plaza:
      return `g-plaza${pick(x, y, 2, 3)}`;
    case Tile.Water:
      return r < 0.07 ? "g-lily" : null;
    case Tile.Sand:
      return r < 0.14 ? "g-shell" : null;
    case Tile.Bridge:
      return `g-plank${pick(x, y, 2, 3)}`;
    case Tile.Spring:
      return r < 0.7 ? `g-spring${pick(x, y, 2, 3)}` : null;
    case Tile.Moss:
      return r < 0.1 ? `g-shroom${pick(x, y, 2, 3)}` : r < 0.3 ? `g-tuft${pick(x, y, 3, 3)}` : null;
    case Tile.Fern:
      return r < 0.6 ? `g-fern${pick(x, y, 2, 3)}` : null;
    case Tile.Ash:
      return r < 0.12 ? `g-crack${pick(x, y, 2, 3)}` : null;
    case Tile.Pale:
      return `g-pale${pick(x, y, 2, 3)}`;
    default:
      return null;
  }
}

/** Frame of the thing standing on this tile, if any (houses are handled apart). */
export function propFrame(map: GameMap, x: number, y: number, rockItem?: string): string | null {
  switch (map.props[y][x]) {
    case Prop.Tree:
      return map.pvp ? `dead${pick(x, y, 2, 4)}` : lookOf(map) === "mossfen" ? `moss${pick(x, y, 3, 4)}` : `tree${pick(x, y, 3, 4)}`;
    case Prop.Rock:
      return `rock-${rockItem ?? "ore_1"}`;
    case Prop.Bush:
      return `${lookOf(map) === "mossfen" ? "shroom" : "bush"}${pick(x, y, 2, 4)}`;
    case Prop.Ruin:
      return `ruin${pick(x, y, 2, 4)}`;
    case Prop.Well:
      return "well";
    case Prop.Anvil:
      return "anvil";
    case Prop.Chest:
      return "chest";
    case Prop.Portal:
      return "portal";
    case Prop.Board:
      return "board";
    case Prop.Lantern:
      return "lantern0";
    case Prop.Treasure:
      return "treasure";
    case Prop.Fence:
      return fenceFrame(map, x, y);
    default:
      return null;
  }
}

/** Fences join up with their neighbours. */
function fenceFrame(map: GameMap, x: number, y: number): string {
  const is = (dx: number, dy: number) => map.props[y + dy]?.[x + dx] === Prop.Fence;
  const r = is(1, 0);
  const l = is(-1, 0);
  const d = is(0, 1);
  const u = is(0, -1);
  if ((r || l) && (d || u)) return r ? (d ? "fence-c0" : "fence-c2") : d ? "fence-c1" : "fence-c3";
  if (r && l) return "fence-x";
  if (d && u) return "fence-y";
  return r ? "fence-ex" : l ? "fence-eX" : d ? "fence-ey" : "fence-eY";
}

export const houseFrame = (x: number, y: number) => `house${(x * 7 + y * 3) % 3}`;

/** Width of the soft shadow under each thing. */
export const PROP_SHADOW: Partial<Record<Prop, number>> = {
  [Prop.Tree]: 1.35,
  [Prop.Rock]: 1.35,
  [Prop.Bush]: 1.25,
  [Prop.Well]: 1.7,
  [Prop.Anvil]: 1.5,
  [Prop.Chest]: 1.5,
  [Prop.Board]: 1.6,
  [Prop.Ruin]: 1.5,
  [Prop.Lantern]: 1.2,
  [Prop.Treasure]: 1.5,
  [Prop.Lamp]: 0.9,
  [Prop.Clutter]: 1.3,
  [Prop.Stall]: 1.7,
};

/**
 * The capital's own things, from the city atlas: big buildings are drawn apart;
 * this covers lamps, walls, clutter and the golden trees.
 */
export function cityFrame(map: GameMap, x: number, y: number, lit: boolean): { atlas: "city" | "scenery"; frame: string } | null {
  const p = map.props[y][x];
  switch (p) {
    case Prop.Lamp:
      return { atlas: "city", frame: lit ? "lamp1" : "lamp0" };
    case Prop.Wall:
      return { atlas: "city", frame: wallFrame(map, x, y) };
    case Prop.Clutter:
    case Prop.Stall: {
      const f = map.decor?.[y * map.width + x];
      if (!f) return null;
      return { atlas: f.startsWith("stall") ? "scenery" : "city", frame: f };
    }
    case Prop.Tree:
      if (map.id === "aldermere" && hash(x, y, 9) < 0.55) return { atlas: "city", frame: `gold${pick(x, y, 3, 6)}` };
      return null;
    default:
      return null;
  }
}

/** City walls join up with their neighbours, and with the towers. */
function wallFrame(map: GameMap, x: number, y: number): string {
  const is = (dx: number, dy: number) => {
    const p = map.props[y + dy]?.[x + dx];
    return p === Prop.Wall || (p === Prop.Clutter && map.decor?.[(y + dy) * map.width + x + dx] === "walltower");
  };
  const r = is(1, 0);
  const l = is(-1, 0);
  const d = is(0, 1);
  const u = is(0, -1);
  if ((r || l) && (d || u)) return r ? (d ? "wall-c0" : "wall-c2") : d ? "wall-c1" : "wall-c3";
  if (r && l) return "wall-x";
  if (d && u) return "wall-y";
  return r ? "wall-ex" : l ? "wall-eX" : d ? "wall-ey" : "wall-eY";
}
