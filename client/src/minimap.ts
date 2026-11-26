import { GLOW_AT } from "../../shared/hollow";
import { GameMap, lookOf, Prop, Tile } from "../../shared/map";
import { setting, setSetting } from "./settings";

let zoomButtons = false;
/** + and - beside the round map. */
export function bindMinimapZoom() {
  if (zoomButtons) return;
  zoomButtons = true;
  const step = (f: number) => setSetting("mmZoom", Math.max(1, Math.min(6, Math.round(setting("mmZoom") * f * 10) / 10)));
  (document.getElementById("mm-in") as HTMLElement).onclick = () => step(1.3);
  (document.getElementById("mm-out") as HTMLElement).onclick = () => step(1 / 1.3);
}
import { RARITY_COLORS } from "../../shared/rift";

/** Small map in the corner. In the Hollow it also shows the exits and anyone who glows. */

const canvas = () => document.getElementById("minimap") as HTMLCanvasElement;

const COLORS: Record<number, string> = {
  [Tile.Grass]: "#a3b987",
  [Tile.Flowers]: "#b4c693",
  [Tile.Path]: "#e5c58c",
  [Tile.Plaza]: "#d0bc9b",
  [Tile.Water]: "#609eaa",
  [Tile.Sand]: "#eddaa7",
  [Tile.Ash]: "#75707e",
  [Tile.Pale]: "#858090",
  [Tile.Void]: "#1a1722",
  [Tile.Moss]: "#5c9a4c",
  [Tile.Fern]: "#68a855",
  [Tile.Bridge]: "#9a6a3a",
  [Tile.Spring]: "#b9a0ff",
  [Tile.Cobble]: "#d8c8a8",
};

let base: HTMLCanvasElement | null = null;
/** The whole map drawn once, for the world map too. */
export function minimapBase() {
  return base;
}
let current: GameMap | null = null;

export function setMinimap(map: GameMap) {
  current = map;
  base = document.createElement("canvas");
  const detail = 6;
  base.width = map.width * detail;
  base.height = map.height * detail;
  const g = base.getContext("2d")!;
  g.scale(detail, detail);
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const prop = map.props[y][x];
      g.fillStyle = COLORS[map.tiles[y][x]] ?? "#000";
      if (prop === Prop.Tree) g.fillStyle = lookOf(map) === "hollow" ? "#4b4654" : lookOf(map) === "mossfen" ? "#2c6a46" : "#527c59";
      else if (prop === Prop.House) g.fillStyle = "#ab6450";
      else if (prop === Prop.Big) g.fillStyle = map.id === "aldermere" && x < 20 && y < 20 ? (x >= 7 && y >= 7 && x < 16 && y < 16 ? "#f4efe4" : "#6fbf5a") : "#b8573a";
      else if (prop === Prop.Wall) g.fillStyle = "#9a9284";
      else if (prop === Prop.Stall) g.fillStyle = "#e8b83a";
      else if (prop === Prop.Ruin) g.fillStyle = "#38333f";
      else if (prop === Prop.Anvil || prop === Prop.Chest || prop === Prop.Board) g.fillStyle = "#6b4226";
      else if (prop === Prop.Portal) g.fillStyle = "#b04fe0";
      else if (prop === Prop.Windmill) g.fillStyle = "#ffffff";
      else if (prop === Prop.Lantern || prop === Prop.Treasure) g.fillStyle = "#ffd76a";
      g.fillRect(x, y, 1, 1);
      // Small ink silhouettes stay anchored to the same tiles at every zoom.
      if (prop === Prop.Tree) {
        g.fillStyle = "#355945";
        g.beginPath();
        g.moveTo(x + 0.5, y);
        g.lineTo(x + 0.95, y + 0.85);
        g.lineTo(x + 0.12, y + 0.85);
        g.fill();
      } else if (prop === Prop.House) {
        g.fillStyle = "#e4b595";
        g.fillRect(x, y, 0.33, 1);
      } else if (map.tiles[y][x] === Tile.Water && (x + y * 3) % 7 === 0) {
        g.fillStyle = "#99c3be";
        g.fillRect(x + 0.15, y + 0.5, 0.7, 0.16);
      }
      // higher ground is lighter
      const h = map.level[y][x] + (map.ramp[y][x] ? 0.5 : 0);
      if (h > 0) {
        g.fillStyle = `rgba(255,255,255,${0.13 * h})`;
        g.fillRect(x, y, 1, 1);
      }
    }
}

interface Dot {
  x: number;
  y: number;
}

/** Redraws the map. `players` is everyone in the room; only you and those who glow are shown. */
export function drawMinimap(state: any, myId: string, friends: Set<string> = new Set()) {
  if (!base || !current) return;
  const c = canvas();
  const g = c.getContext("2d")!;
  const S = c.width;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, S, S);
  // North stays up, with the player at the centre.
  const centre = state.players?.get(myId) ?? { x: current.width / 2, y: current.height / 2 };
  const k = setting("mmZoom");
  g.fillStyle = current.pvp ? "#211d2a" : current.id === "mossfen" ? "#1f4a36" : "#2c5a34";
  g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  g.scale(k, k);
  g.translate(-centre.x, -centre.y);
  g.imageSmoothingEnabled = false;
  g.drawImage(base, 0, 0, current.width, current.height);
  const dot = (p: Dot, color: string, r: number) => {
    g.fillStyle = "#000";
    g.beginPath();
    g.arc(p.x, p.y, (r + 1) / k, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(p.x, p.y, r / k, 0, Math.PI * 2);
    g.fill();
  };
  // ground about to fall (red), and regions closed now
  const tiles = (id: string, color: string) => {
    g.fillStyle = color;
    for (const k of current!.regions[id] ?? []) g.fillRect(k % current!.width, Math.floor(k / current!.width), 1, 1);
  };
  // quiet places: no monsters
  g.lineWidth = 1.6 / k;
  g.setLineDash([3 / k, 2 / k]);
  g.strokeStyle = "rgba(220, 255, 200, 0.95)";
  for (const q of current.quiet) {
    g.beginPath();
    g.arc(q.x, q.y, q.r, 0, Math.PI * 2);
    g.stroke();
  }
  g.setLineDash([]);
  if (state.cracking) tiles(state.cracking, "#ff4a4a");
  state.closed?.forEach((_v: boolean, id: string) => tiles(id, current!.pvp ? "#0d0b12" : "#e6f2ea"));
  for (const e of current.exits) dot(e, "#b8f0b0", 4);
  state.gates?.forEach((p: Dot) => dot(p, "#ffd23a", 5));
  state.portals?.forEach((p: any) => dot(p, p.dark ? "#1a1022" : "#" + RARITY_COLORS[p.rarity].toString(16).padStart(6, "0"), 6));
  state.players?.forEach((p: any, id: string) => {
    if (id !== myId && (p.corruption >= GLOW_AT || p.inSpring) && !p.dead) dot(p, "#ff5a5a", 4);
  });
  for (const id of friends) {
    const p = state.players?.get(id);
    if (p) dot(p, "#6dff5a", 4);
  }
  const boss = state.bossId ? state.monsters?.get(state.bossId) : null;
  if (boss) dot(boss, "#ff2a2a", 7);
  const me = state.players?.get(myId);
  if (me) dot(me, "#ffffff", 4);
}
