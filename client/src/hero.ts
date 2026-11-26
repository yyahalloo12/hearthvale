import { Inventory, ITEMS } from "../../shared/items";
import { TIER_TINT } from "./PlayerView";

/**
 * The big picture of your own character (inventory) and the face in the round
 * frame (HUD), put together from layers rendered in Blender (art/player.py
 * hero). Layers are tinted here: the tunic in your colour, metal and wood by
 * the tier of what you wear.
 */

const WOOD_TINT = [0xffffff, 0xc08a58, 0x8fb06a, 0xb9b3c4, 0xd9a0e0, 0xffd23a, 0xff6f6f];
const CLOAK_TINT = [0x8a5a3a, 0x7a4a2a, 0x3f6f9f, 0x4f8f5a, 0x8a4ab0, 0xc8902a, 0xb8302a];
const HERO_W = 400;
const HERO_H = 480;
const LAYERS = ["cloak", "base", "tunic", "helm", "cap", "hat", "sword", "axe", "bow", "staff"] as const;
type Layer = (typeof LAYERS)[number];

const cache = new Map<string, Promise<HTMLImageElement>>();
function load(src: string) {
  let p = cache.get(src);
  if (!p) {
    p = new Promise((ok, fail) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = fail;
      img.src = src;
    });
    cache.set(src, p);
  }
  return p;
}

/** What to show: which layers, and the colour of each. */
export interface Look {
  color: number;
  layers: Partial<Record<Layer, number>>;
}

export function lookOf(color: number, inv: Inventory): Look {
  const layers: Partial<Record<Layer, number>> = { base: 0xffffff, tunic: color };
  const w = inv.equip.weapon && ITEMS[inv.equip.weapon.id];
  if (w?.look === "sword" || w?.look === "axe") layers[w.look] = TIER_TINT[w.tier] ?? 0xffffff;
  if (w?.look === "bow" || w?.look === "staff") layers[w.look] = WOOD_TINT[w.tier] ?? 0xffffff;
  const h = inv.equip.head && ITEMS[inv.equip.head.id];
  if (h?.look === "helm") layers.helm = TIER_TINT[h.tier] ?? 0xffffff;
  if (h?.look === "cap" || h?.look === "hat") layers[h.look] = CLOAK_TINT[h.tier] ?? 0xffffff;
  const c = inv.equip.cloak && ITEMS[inv.equip.cloak.id];
  if (c) layers.cloak = CLOAK_TINT[c.tier] ?? 0x8a5a3a;
  return { color, layers };
}

const keyOf = (l: Look) => JSON.stringify(l.layers);

/** Draws one tinted layer: the picture multiplied by the colour, keeping its own transparency. */
function tinted(g: CanvasRenderingContext2D, img: HTMLImageElement, sx: number, sw: number, sh: number, tint: number, scratch: HTMLCanvasElement) {
  if (tint === 0xffffff) {
    g.drawImage(img, sx, 0, sw, sh, 0, 0, g.canvas.width, g.canvas.height);
    return;
  }
  scratch.width = sw;
  scratch.height = sh;
  const s = scratch.getContext("2d")!;
  s.clearRect(0, 0, sw, sh);
  s.drawImage(img, sx, 0, sw, sh, 0, 0, sw, sh);
  s.globalCompositeOperation = "multiply";
  s.fillStyle = `#${tint.toString(16).padStart(6, "0")}`;
  s.fillRect(0, 0, sw, sh);
  s.globalCompositeOperation = "destination-in";
  s.drawImage(img, sx, 0, sw, sh, 0, 0, sw, sh);
  s.globalCompositeOperation = "source-over";
  g.drawImage(scratch, 0, 0, sw, sh, 0, 0, g.canvas.width, g.canvas.height);
}

const scratch = document.createElement("canvas");
let drawing = 0;

/** The standing hero, turned to one of 8 facings. */
export async function drawHero(canvas: HTMLCanvasElement, look: Look, facing: number) {
  const ticket = ++drawing;
  const want = LAYERS.filter((l) => look.layers[l] !== undefined);
  const imgs = await Promise.all(want.map((l) => load(`/art/hero-${l}.png`)));
  if (ticket !== drawing) return; // a newer picture was asked for meanwhile
  const g = canvas.getContext("2d")!;
  g.clearRect(0, 0, canvas.width, canvas.height);
  want.forEach((l, i) => tinted(g, imgs[i], (((facing % 8) + 8) % 8) * HERO_W, HERO_W, HERO_H, look.layers[l]!, scratch));
}

let portraitKey = "";
/** The face for the round frame; returns a picture to put in an <img>. */
export async function portraitOf(look: Look): Promise<string | null> {
  const key = keyOf(look);
  if (key === portraitKey) return null;
  portraitKey = key;
  const want = (["cloak", "base", "tunic", "helm", "cap", "hat"] as const).filter((l) => look.layers[l] !== undefined);
  const imgs = await Promise.all(want.map((l) => load(`/art/portrait-${l}.png`)));
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  want.forEach((l, i) => tinted(g, imgs[i], 0, 256, 256, look.layers[l]!, scratch));
  return c.toDataURL();
}

/** The standing hero facing us, as a picture (for the character window). */
export async function heroImage(look: Look): Promise<string> {
  const c = document.createElement("canvas");
  c.width = HERO_W;
  c.height = HERO_H;
  const want = LAYERS.filter((l) => look.layers[l] !== undefined);
  const imgs = await Promise.all(want.map((l) => load(`/art/hero-${l}.png`)));
  const g = c.getContext("2d")!;
  want.forEach((l, i) => tinted(g, imgs[i], 0, HERO_W, HERO_H, look.layers[l]!, document.createElement("canvas")));
  return c.toDataURL();
}
