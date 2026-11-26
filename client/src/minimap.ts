import { GLOW_AT } from "../../shared/hollow";
import { GameMap, Prop, Tile } from "../../shared/map";

/** Small map in the corner. In the Hollow it also shows the exits and anyone who glows. */

const canvas = () => document.getElementById("minimap") as HTMLCanvasElement;

const COLORS: Record<number, string> = {
  [Tile.Grass]: "#7cc95a",
  [Tile.Flowers]: "#8ed46c",
  [Tile.Path]: "#d9b77e",
  [Tile.Plaza]: "#c9c3b8",
  [Tile.Water]: "#4fa8e0",
  [Tile.Sand]: "#f0dc9c",
  [Tile.Ash]: "#75707e",
  [Tile.Pale]: "#858090",
  [Tile.Void]: "#1a1722",
  [Tile.Moss]: "#5c9a4c",
  [Tile.Fern]: "#68a855",
  [Tile.Bridge]: "#9a6a3a",
  [Tile.Spring]: "#b9a0ff",
};

let base: HTMLCanvasElement | null = null;
let current: GameMap | null = null;

export function setMinimap(map: GameMap) {
  current = map;
  base = document.createElement("canvas");
  base.width = map.width;
  base.height = map.height;
  const g = base.getContext("2d")!;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const prop = map.props[y][x];
      g.fillStyle = COLORS[map.tiles[y][x]] ?? "#000";
      if (prop === Prop.Tree) g.fillStyle = map.id === "hollow" ? "#4b4654" : map.id === "mossfen" ? "#2c6a46" : "#2f8a3e";
      else if (prop === Prop.House) g.fillStyle = "#c8453a";
      else if (prop === Prop.Ruin) g.fillStyle = "#38333f";
      else if (prop === Prop.Anvil || prop === Prop.Chest || prop === Prop.Board) g.fillStyle = "#6b4226";
      else if (prop === Prop.Portal) g.fillStyle = "#b04fe0";
      else if (prop === Prop.Windmill) g.fillStyle = "#ffffff";
      else if (prop === Prop.Lantern || prop === Prop.Treasure) g.fillStyle = "#ffd76a";
      g.fillRect(x, y, 1, 1);
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
export function drawMinimap(state: any, myId: string) {
  if (!base || !current) return;
  const c = canvas();
  const g = c.getContext("2d")!;
  const S = c.width;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, S, S);
  // turned 45 degrees, like the world on screen, and centred on you
  const centre = state.players?.get(myId) ?? { x: current.width / 2, y: current.height / 2 };
  const k = 2.6;
  g.fillStyle = current.pvp ? "#211d2a" : current.id === "mossfen" ? "#1f4a36" : "#2c5a34";
  g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  g.rotate(Math.PI / 4);
  g.scale(k, k);
  g.translate(-centre.x, -centre.y);
  g.imageSmoothingEnabled = false;
  g.drawImage(base, 0, 0);
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
  state.players?.forEach((p: any, id: string) => {
    if (id !== myId && (p.corruption >= GLOW_AT || p.inSpring) && !p.dead) dot(p, "#ff5a5a", 4);
  });
  const me = state.players?.get(myId);
  if (me) dot(me, "#ffffff", 4);
}
