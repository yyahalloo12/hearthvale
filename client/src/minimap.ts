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
      if (prop === Prop.Tree) g.fillStyle = map.id === "hollow" ? "#4b4654" : "#2f8a3e";
      else if (prop === Prop.House) g.fillStyle = "#c8453a";
      else if (prop === Prop.Ruin) g.fillStyle = "#38333f";
      else if (prop === Prop.Portal) g.fillStyle = "#b04fe0";
      g.fillRect(x, y, 1, 1);
    }
  canvas().hidden = false;
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
  // turned 45 degrees, like the world on screen
  const k = S / (current.width * Math.SQRT2);
  g.translate(S / 2, S / 2);
  g.rotate(Math.PI / 4);
  g.scale(k, k);
  g.translate(-current.width / 2, -current.height / 2);
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
  state.gates?.forEach((p: Dot) => dot(p, "#ffd23a", 5));
  state.players?.forEach((p: any, id: string) => {
    if (id !== myId && p.corruption >= GLOW_AT && !p.dead) dot(p, "#ff5a5a", 4);
  });
  const me = state.players?.get(myId);
  if (me) dot(me, "#ffffff", 4);
}
