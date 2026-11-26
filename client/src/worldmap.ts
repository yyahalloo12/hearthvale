import { GameMap } from "../../shared/map";
import { RARITY_COLORS } from "../../shared/rift";
import { WORLD_BOSS } from "../../shared/events";
import { minimapBase } from "./minimap";
import { drawContinent, placeAt } from "./atlas";
import type { ZoneId } from "../../shared/map";

/**
 * The world map (key M): the whole map turned like the game, with zoom and
 * drag, everything worth finding marked, and a click to walk there.
 */

const $ = (id: string) => document.getElementById(id) as HTMLElement;

let map: GameMap | null = null;
let state: any = null;
let myId = "";
let friends: () => Set<string> = () => new Set();
let walk: (x: number, y: number) => void = () => {};
const view = { zoom: 1, x: 0, y: 0 };
let started = false;
let goal: { x: number; y: number } | null = null;
/** the whole land on parchment, or just this map */
let continent = false;
let hover: ZoneId | null = null;
let fitted = { k: 1, ox: 0, oy: 0 };

function setMode(world: boolean) {
  continent = world;
  $("worldmap").classList.toggle("continent", world);
  const hint = document.getElementById("wm-hint");
  if (hint) hint.hidden = world;
  $("wm-world").classList.toggle("on", world);
  $("wm-here").classList.toggle("on", !world);
  draw();
}

export function initWorldMap(go: (x: number, y: number) => void, party: () => Set<string>) {
  walk = go;
  friends = party;
  $("map-open").hidden = false;
  if (started) return;
  started = true;
  $("map-open").onclick = () => toggleMap();
  $("map-big").onclick = () => toggleMap();
  $("worldmap-close").onclick = () => toggleMap(false);
  $("wm-in").onclick = () => zoom(1.3);
  $("wm-out").onclick = () => zoom(1 / 1.3);
  $("wm-me").onclick = () => centreOnMe();
  $("wm-world").onclick = () => setMode(true);
  $("wm-here").onclick = () => setMode(false);
  window.addEventListener("keydown", (e) => {
    const el = document.activeElement as HTMLInputElement | null;
    if ((el?.tagName === "INPUT" && el.type !== "checkbox") || el?.tagName === "SELECT" || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === "KeyM") toggleMap();
    else if (e.code === "Escape") toggleMap(false);
  });
  const c = $("worldmap-canvas") as HTMLCanvasElement;
  let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
  c.addEventListener("pointerdown", (e) => (drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }));
  c.addEventListener("pointermove", (e) => {
    if (continent) {
      const box = c.getBoundingClientRect();
      const p = placeAt((e.clientX - box.left - fitted.ox) / fitted.k, (e.clientY - box.top - fitted.oy) / fitted.k);
      const h = p?.id ?? null;
      if (h !== hover) {
        hover = h;
        draw();
      }
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    view.x = drag.vx + dx;
    view.y = drag.vy + dy;
    draw();
  });
  c.addEventListener("pointerup", (e) => {
    const d = drag;
    drag = null;
    if (!d || d.moved || !map || continent) return;
    const box = c.getBoundingClientRect();
    const t = toTile(e.clientX - box.left, e.clientY - box.top);
    if (t.x < 0 || t.y < 0 || t.x >= map.width || t.y >= map.height) return;
    goal = t;
    walk(t.x, t.y);
    draw();
  });
  c.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (continent) return;
      const box = c.getBoundingClientRect();
      zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - box.left, e.clientY - box.top);
    },
    { passive: false },
  );
  setInterval(() => !$("worldmap").hidden && draw(), 400);
}

export function setWorldMap(m: GameMap, s: any, me: string) {
  map = m;
  state = s;
  myId = me;
  goal = null;
  if (!$("worldmap").hidden) fit();
}

/** The place we walk to was reached or changed. */
export function clearGoal() {
  goal = null;
}

export function toggleMap(open = $("worldmap").hidden) {
  $("worldmap").hidden = !open;
  if (open) {
    fit();
    draw();
  }
}

// ---- turning tiles into canvas pixels: the map is turned 45 degrees like the game

function k() {
  return view.zoom;
}
function toScreen(x: number, y: number) {
  const s = k();
  return { x: view.x + (x - y) * s * 0.7071, y: view.y + (x + y) * s * 0.7071 };
}
function toTile(px: number, py: number) {
  const s = k() * 0.7071;
  const a = (px - view.x) / s;
  const b = (py - view.y) / s;
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}

function fit() {
  if (!map) return;
  const c = $("worldmap-canvas") as HTMLCanvasElement;
  const box = c.getBoundingClientRect();
  c.width = box.width;
  c.height = box.height;
  const span = (map.width + map.height) * 0.7071;
  view.zoom = Math.min(box.width / span, box.height / span) * 0.95;
  view.x = 0;
  view.y = 0;
  const mid = toScreen(map.width / 2, map.height / 2);
  view.x += box.width / 2 - mid.x;
  view.y += box.height / 2 - mid.y;
}

function centreOnMe() {
  const me = state?.players?.get(myId);
  if (!me) return;
  const c = $("worldmap-canvas") as HTMLCanvasElement;
  view.zoom = Math.max(view.zoom, 6);
  const p = toScreen(me.x, me.y);
  view.x += c.width / 2 - p.x;
  view.y += c.height / 2 - p.y;
  draw();
}

function zoom(f: number, mx?: number, my?: number) {
  const c = $("worldmap-canvas") as HTMLCanvasElement;
  const x = mx ?? c.width / 2;
  const y = my ?? c.height / 2;
  const z = Math.max(1, Math.min(24, view.zoom * f));
  view.x = x - ((x - view.x) / view.zoom) * z;
  view.y = y - ((y - view.y) / view.zoom) * z;
  view.zoom = z;
  draw();
}

function draw() {
  const base = minimapBase();
  if (!map || !base) return;
  const c = $("worldmap-canvas") as HTMLCanvasElement;
  if (continent) {
    const here = (map.rift ? null : map.id) as ZoneId | null;
    fitted = drawContinent(c, here, performance.now(), hover);
    $("wm-title").textContent = "แผนที่ทวีป";
    return;
  }
  const g = c.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  // the same old paper as the continent map, with this map inked on it
  g.fillStyle = "#e6d2a2";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "rgba(104,78,39,0.10)";
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x < c.width; x += 32) { g.moveTo(x, 0); g.lineTo(x, c.height); }
  for (let y = 0; y < c.height; y += 32) { g.moveTo(0, y); g.lineTo(c.width, y); }
  g.stroke();
  const s = k();
  g.save();
  g.translate(view.x, view.y);
  g.rotate(Math.PI / 4);
  g.scale(s, s);
  g.imageSmoothingEnabled = false;

  g.drawImage(base, 0, 0, map.width, map.height);

  g.strokeStyle = "#4a3220";
  g.lineWidth = 2 / s;
  g.strokeRect(0, 0, map.width, map.height);
  g.restore();
  const edge = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(90,50,20,0.45)");
  g.fillStyle = edge;
  g.fillRect(0, 0, c.width, c.height);

  const mark = (x: number, y: number, color: string, r: number, label?: string, ring = false) => {
    const p = toScreen(x, y);
    g.beginPath();
    g.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
    g.fillStyle = "#000";
    g.fill();
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    if (ring) {
      g.strokeStyle = "#fff";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
      g.stroke();
    }
    if (label) {
      g.font = "bold 12px Tahoma, sans-serif";
      g.textAlign = "center";
      g.lineWidth = 3;
      g.strokeStyle = "#f3e4bc";
      const labelY = label === "คุณ" ? p.y + r + 16 : p.y - r - 6;
      g.strokeText(label, p.x, labelY);
      g.fillStyle = "#3a2414";
      g.fillText(label, p.x, labelY);
    }
  };
  // quiet places
  for (const q of map.quiet) mark(q.x, q.y, "rgba(220,255,200,0.9)", 4, `🌿 ${q.name}`);
  for (const e of map.exits) mark(e.x, e.y, "#b8f0b0", 6, `ไป${e.label}`);
  state?.gates?.forEach((p: any) => mark(p.x, p.y, "#ffd23a", 7, "ประตูทางออก"));
  state?.portals?.forEach((p: any) => mark(p.x, p.y, p.dungeon ? "#ffffff" : p.dark ? "#2a1032" : "#" + RARITY_COLORS[p.rarity].toString(16).padStart(6, "0"), 7, p.dungeon ? "🗝 ดันเจี้ยน" : p.dark ? "พอร์ทัลดำ" : "พอร์ทัล", true));
  if (map.id === "brindle" || map.id === "mossfen") {
    const b = WORLD_BOSS[map.id];
    const up = state?.bossId && state.monsters?.get(state.bossId);
    mark(b.at.x, b.at.y, up ? "#ff2a2a" : "#7a3a3a", up ? 9 : 5, up ? "👑 บอสตื่นแล้ว!" : "บอสโลก");
  }
  for (const id of friends()) {
    const p = state?.players?.get(id);
    if (p) mark(p.x, p.y, "#6dff5a", 5, p.name);
  }
  if (goal) mark(goal.x, goal.y, "#7fe0ff", 4, "จุดหมาย");
  const me = state?.players?.get(myId);
  if (me) mark(me.x, me.y, "#ffffff", 6, "คุณ", true);
  $("wm-title").textContent = `${$("map-name").textContent || map.name} · ${me ? `${Math.round(me.x)}, ${Math.round(me.y)}` : ""}`;
}
