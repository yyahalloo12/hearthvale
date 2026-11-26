import type { ZoneId } from "../../shared/map";

/**
 * The whole land of Hearthvale drawn like an old map on parchment: ink coasts,
 * little drawings of each place, roads between them and a pin where you are.
 * Drawn with code on a 1000 x 720 sheet, then fitted to the window.
 */

interface Place {
  id: ZoneId;
  name: string;
  levels: string;
  x: number;
  y: number;
  r: number;
  tint: string;
  draw: (g: CanvasRenderingContext2D, x: number, y: number) => void;
}

const INK = "#4a3220";
const INK_SOFT = "rgba(74,50,32,0.55)";

/** A steady random sequence, so the map looks the same every time. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function line(g: CanvasRenderingContext2D, pts: [number, number][], w = 1.6, color = INK) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

function mountain(g: CanvasRenderingContext2D, x: number, y: number, s = 1, snow = false) {
  const h = 26 * s;
  const w = 20 * s;
  g.fillStyle = "#d8c294";
  g.beginPath();
  g.moveTo(x - w, y);
  g.lineTo(x, y - h);
  g.lineTo(x + w, y);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(90,60,30,0.35)";
  g.beginPath();
  g.moveTo(x, y - h);
  g.lineTo(x + w, y);
  g.lineTo(x + w * 0.2, y);
  g.closePath();
  g.fill();
  if (snow) {
    g.fillStyle = "#fbf6ea";
    g.beginPath();
    g.moveTo(x - w * 0.3, y - h * 0.7);
    g.lineTo(x, y - h);
    g.lineTo(x + w * 0.3, y - h * 0.7);
    g.lineTo(x + w * 0.1, y - h * 0.62);
    g.lineTo(x - w * 0.05, y - h * 0.74);
    g.closePath();
    g.fill();
  }
  line(g, [[x - w, y], [x, y - h], [x + w, y]], 1.6);
  for (let i = 1; i < 4; i++) line(g, [[x + w * 0.15 * i, y - h * (1 - 0.22 * i)], [x + w * 0.15 * i + 6 * s, y - h * (1 - 0.22 * i) + 7 * s]], 1, INK_SOFT);
}

function tree(g: CanvasRenderingContext2D, x: number, y: number, s = 1, color = "#7a9a52") {
  line(g, [[x, y], [x, y - 7 * s]], 1.4);
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y - 11 * s, 6 * s, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 1.3;
  g.stroke();
}

function pine(g: CanvasRenderingContext2D, x: number, y: number, s = 1, color = "#5e7f4a") {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - 18 * s);
  g.lineTo(x + 7 * s, y - 3 * s);
  g.lineTo(x - 7 * s, y - 3 * s);
  g.closePath();
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 1.3;
  g.stroke();
  line(g, [[x, y - 3 * s], [x, y]], 1.4);
}

function house(g: CanvasRenderingContext2D, x: number, y: number, s = 1, roof = "#b5553a") {
  g.fillStyle = "#efe0bc";
  g.fillRect(x - 6 * s, y - 8 * s, 12 * s, 8 * s);
  g.strokeStyle = INK;
  g.lineWidth = 1.2;
  g.strokeRect(x - 6 * s, y - 8 * s, 12 * s, 8 * s);
  g.fillStyle = roof;
  g.beginPath();
  g.moveTo(x - 8 * s, y - 8 * s);
  g.lineTo(x, y - 15 * s);
  g.lineTo(x + 8 * s, y - 8 * s);
  g.closePath();
  g.fill();
  g.stroke();
}

function castle(g: CanvasRenderingContext2D, x: number, y: number) {
  const tower = (tx: number, w: number, h: number) => {
    g.fillStyle = "#f4ecd8";
    g.fillRect(tx - w / 2, y - h, w, h);
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.strokeRect(tx - w / 2, y - h, w, h);
    g.fillStyle = "#5a78a8";
    g.beginPath();
    g.moveTo(tx - w / 2 - 3, y - h);
    g.lineTo(tx, y - h - w * 1.5);
    g.lineTo(tx + w / 2 + 3, y - h);
    g.closePath();
    g.fill();
    g.stroke();
    line(g, [[tx, y - h - w * 1.5], [tx, y - h - w * 1.5 - 9]], 1.2);
    g.fillStyle = "#c8453a";
    g.fillRect(tx, y - h - w * 1.5 - 9, 7, 4);
    g.fillStyle = INK;
    g.fillRect(tx - 1.5, y - h * 0.6, 3, 5);
  };
  g.fillStyle = "#f4ecd8";
  g.fillRect(x - 30, y - 22, 60, 22);
  g.strokeStyle = INK;
  g.lineWidth = 1.5;
  g.strokeRect(x - 30, y - 22, 60, 22);
  for (let i = 0; i < 8; i++) g.fillRect(x - 30 + i * 8, y - 26, 4, 4);
  tower(x - 30, 12, 34);
  tower(x + 30, 12, 34);
  tower(x - 13, 13, 46);
  tower(x + 14, 13, 44);
  tower(x, 16, 62);
  g.fillStyle = INK;
  g.beginPath();
  g.arc(x, y - 6, 6, Math.PI, 0);
  g.lineTo(x + 6, y);
  g.lineTo(x - 6, y);
  g.fill();
}

function windmill(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = "#efe0bc";
  g.beginPath();
  g.moveTo(x - 6, y);
  g.lineTo(x - 4, y - 18);
  g.lineTo(x + 4, y - 18);
  g.lineTo(x + 6, y);
  g.closePath();
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 1.3;
  g.stroke();
  for (const a of [0.4, 2, 3.5, 5.1]) line(g, [[x, y - 18], [x + Math.cos(a) * 14, y - 18 + Math.sin(a) * 14]], 1.6);
}

function waves(g: CanvasRenderingContext2D, x: number, y: number, n = 3) {
  for (let i = 0; i < n; i++) {
    const px = x + i * 14;
    g.strokeStyle = "rgba(60,90,100,0.7)";
    g.lineWidth = 1.3;
    g.beginPath();
    g.arc(px, y, 5, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  }
}

function ship(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = "#8a5a32";
  g.beginPath();
  g.moveTo(x - 14, y);
  g.lineTo(x + 14, y);
  g.lineTo(x + 9, y + 7);
  g.lineTo(x - 9, y + 7);
  g.closePath();
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 1.3;
  g.stroke();
  line(g, [[x, y], [x, y - 24]], 1.4);
  g.fillStyle = "#f6ecd2";
  g.beginPath();
  g.moveTo(x + 1, y - 22);
  g.quadraticCurveTo(x + 14, y - 13, x + 1, y - 4);
  g.closePath();
  g.fill();
  g.stroke();
}

function serpent(g: CanvasRenderingContext2D, x: number, y: number) {
  g.strokeStyle = "#3f6a5a";
  g.lineWidth = 5;
  g.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(x + i * 22, y, 9, Math.PI, 0);
    g.stroke();
  }
  g.fillStyle = "#3f6a5a";
  g.beginPath();
  g.arc(x - 12, y - 4, 6, 0, Math.PI * 2);
  g.fill();
  g.lineCap = "butt";
  g.lineWidth = 1;
}

function thorn(g: CanvasRenderingContext2D, x: number, y: number, s = 1) {
  line(g, [[x, y], [x - 2 * s, y - 16 * s]], 1.6, "#3a2a22");
  line(g, [[x - 1 * s, y - 8 * s], [x + 7 * s, y - 14 * s]], 1.3, "#3a2a22");
  line(g, [[x - 1.5 * s, y - 12 * s], [x - 9 * s, y - 17 * s]], 1.3, "#3a2a22");
}

function reeds(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = "rgba(80,120,110,0.45)";
  g.beginPath();
  g.ellipse(x, y, 16, 6, 0, 0, Math.PI * 2);
  g.fill();
  for (let i = -2; i <= 2; i++) line(g, [[x + i * 5, y - 2], [x + i * 6, y - 14]], 1.2, "#4a5a3a");
}

const PLACES: Place[] = [
  {
    id: "brindle",
    name: "หมู่บ้านบรินเดิล",
    levels: "Lv 1–10",
    x: 480,
    y: 150,
    r: 82,
    tint: "rgba(140,190,90,0.22)",
    draw: (g, x, y) => {
      house(g, x - 22, y + 4);
      house(g, x + 2, y + 10, 1, "#3f6fa5");
      house(g, x + 22, y + 2, 1, "#d98a2e");
      windmill(g, x - 44, y + 12);
      for (const [dx, dy] of [[40, 18], [52, 6], [-60, -10], [30, 34], [-28, 30]]) tree(g, x + dx, y + dy);
    },
  },
  {
    id: "mossfen",
    name: "ป่ามอสเฟน",
    levels: "Lv 10–20",
    x: 765,
    y: 150,
    r: 92,
    tint: "rgba(70,120,70,0.25)",
    draw: (g, x, y) => {
      const r = seeded(9);
      for (let i = 0; i < 26; i++) pine(g, x - 60 + r() * 120, y - 20 + r() * 70, 0.8 + r() * 0.4);
    },
  },
  {
    id: "hollow",
    name: "Hollow",
    levels: "Lv 30+ PvP",
    x: 190,
    y: 140,
    r: 86,
    tint: "rgba(90,60,120,0.3)",
    draw: (g, x, y) => {
      for (let i = 0; i < 4; i++) {
        g.strokeStyle = `rgba(110,60,150,${0.7 - i * 0.12})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y + 6, 10 + i * 9, i, i + Math.PI * 1.4);
        g.stroke();
      }
      for (const [dx, dy] of [[-48, 24], [44, 20], [-30, -20], [40, -18]]) thorn(g, x + dx, y + dy);
    },
  },
  {
    id: "aldermere",
    name: "เมืองหลวงอัลเดอเมียร์",
    levels: "เมืองปลอดภัย",
    x: 480,
    y: 375,
    r: 95,
    tint: "rgba(230,200,120,0.3)",
    draw: (g, x, y) => {
      // the city wall round it
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.setLineDash([6, 3]);
      g.beginPath();
      g.ellipse(x, y + 4, 70, 40, 0, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      castle(g, x, y + 8);
      for (const [dx, dy, c] of [[-50, 22, "#b5553a"], [-38, 32, "#3f6fa5"], [44, 24, "#d98a2e"], [56, 14, "#8a4a3a"], [-56, 8, "#4f7a5a"], [30, 36, "#b5553a"]] as const) house(g, x + dx, y + dy, 0.8, c);
    },
  },
  {
    id: "copperhill",
    name: "เหมืองคอปเปอร์ฮิลล์",
    levels: "Lv 15–25",
    x: 775,
    y: 385,
    r: 92,
    tint: "rgba(200,140,80,0.25)",
    draw: (g, x, y) => {
      mountain(g, x - 30, y + 8, 1.4, true);
      mountain(g, x + 10, y - 4, 1.8, true);
      mountain(g, x + 48, y + 14, 1.2);
      mountain(g, x - 58, y + 26, 1);
      // a mine door
      g.fillStyle = INK;
      g.beginPath();
      g.arc(x + 4, y + 30, 7, Math.PI, 0);
      g.lineTo(x + 11, y + 34);
      g.lineTo(x - 3, y + 34);
      g.fill();
      line(g, [[x - 20, y + 40], [x + 40, y + 40]], 1.2, INK_SOFT);
    },
  },
  {
    id: "sunreach",
    name: "ชายฝั่งซันรีช",
    levels: "Lv 20–30",
    x: 500,
    y: 590,
    r: 88,
    tint: "rgba(240,220,150,0.35)",
    draw: (g, x, y) => {
      house(g, x - 20, y - 6, 0.9, "#3f6fa5");
      house(g, x + 4, y - 2, 0.9);
      // a lighthouse
      g.fillStyle = "#f4ecd8";
      g.fillRect(x + 36, y - 30, 9, 30);
      g.strokeStyle = INK;
      g.lineWidth = 1.3;
      g.strokeRect(x + 36, y - 30, 9, 30);
      g.fillStyle = "#c8453a";
      g.fillRect(x + 36, y - 20, 9, 4);
      g.fillStyle = "#ffd36a";
      g.fillRect(x + 37, y - 36, 7, 6);
      for (const [dx, dy] of [[-50, 14], [-40, 22]]) tree(g, x + dx, y + dy, 0.9, "#9ab05a");
    },
  },
  {
    id: "thornmarsh",
    name: "ชายแดนธอร์นมาร์ช",
    levels: "Lv 25–40 ชายแดน",
    x: 200,
    y: 390,
    r: 92,
    tint: "rgba(120,60,60,0.22)",
    draw: (g, x, y) => {
      const r = seeded(4);
      for (let i = 0; i < 12; i++) thorn(g, x - 60 + r() * 120, y - 10 + r() * 50, 0.9 + r() * 0.5);
      // crossed swords: players fight here
      line(g, [[x - 10, y - 30], [x + 10, y - 10]], 2.2, "#7a2a2a");
      line(g, [[x + 10, y - 30], [x - 10, y - 10]], 2.2, "#7a2a2a");
    },
  },
  {
    id: "greywater",
    name: "หนองเกรย์วอเตอร์",
    levels: "Lv 35–50 ชายแดน",
    x: 205,
    y: 600,
    r: 86,
    tint: "rgba(90,110,110,0.28)",
    draw: (g, x, y) => {
      reeds(g, x - 30, y);
      reeds(g, x + 24, y + 14);
      reeds(g, x + 10, y - 22);
      for (const [dx, dy] of [[-56, -16], [50, -10], [-10, 34]]) thorn(g, x + dx, y + dy, 0.8);
    },
  },
];

const ROADS: [ZoneId, ZoneId][] = [
  ["brindle", "mossfen"],
  ["brindle", "aldermere"],
  ["aldermere", "copperhill"],
  ["aldermere", "sunreach"],
  ["aldermere", "thornmarsh"],
  ["thornmarsh", "greywater"],
];

let paper: HTMLCanvasElement | null = null;

/** The sheet itself: paper, sea, coast, places and roads. Made once. */
function sheet(): HTMLCanvasElement {
  if (paper) return paper;
  const c = document.createElement("canvas");
  c.width = 1000;
  c.height = 720;
  const g = c.getContext("2d")!;
  const r = seeded(77);
  // old paper
  g.fillStyle = "#ead7a8";
  g.fillRect(0, 0, 1000, 720);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(120,80,30,0.05)" : "rgba(255,250,230,0.08)";
    g.fillRect(r() * 1000, r() * 720, 2 + r() * 6, 1 + r() * 3);
  }
  for (let i = 0; i < 14; i++) {
    g.fillStyle = "rgba(140,90,40,0.05)";
    g.beginPath();
    g.arc(r() * 1000, r() * 720, 20 + r() * 70, 0, Math.PI * 2);
    g.fill();
  }
  // the sea round the south and east, and the coast in ink
  const coast: [number, number][] = [];
  for (let i = 0; i <= 80; i++) {
    const a = (i / 80) * Math.PI * 2;
    const wob = 1 + 0.06 * Math.sin(a * 5 + 1) + 0.04 * Math.sin(a * 11) + 0.03 * Math.sin(a * 17 + 2);
    coast.push([500 + Math.cos(a) * 455 * wob, 360 + Math.sin(a) * 320 * wob]);
  }
  g.fillStyle = "rgba(120,160,160,0.55)";
  g.fillRect(0, 0, 1000, 720);
  g.save();
  g.beginPath();
  coast.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.clip();
  g.fillStyle = "#ead7a8";
  g.fillRect(0, 0, 1000, 720);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(120,80,30,0.05)" : "rgba(255,250,230,0.08)";
    g.fillRect(r() * 1000, r() * 720, 2 + r() * 6, 1 + r() * 3);
  }
  for (const p of PLACES) {
    const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.3);
    grad.addColorStop(0, p.tint);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(p.x - p.r * 1.4, p.y - p.r * 1.4, p.r * 2.8, p.r * 2.8);
  }
  g.restore();
  // coast lines: a strong one and fainter ones out to sea
  for (let k = 0; k < 4; k++) {
    g.strokeStyle = k ? `rgba(60,70,60,${0.35 - k * 0.08})` : INK;
    g.lineWidth = k ? 1 : 2.4;
    g.beginPath();
    coast.forEach(([x, y], i) => {
      const dx = x - 500;
      const dy = y - 360;
      const d = Math.hypot(dx, dy);
      const px = x + (dx / d) * k * 7;
      const py = y + (dy / d) * k * 7;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    });
    g.closePath();
    g.stroke();
  }
  // a river from the mountains to the southern sea
  line(g, [[740, 330], [690, 380], [640, 440], [610, 500], [575, 560], [560, 640], [555, 700]], 3, "rgba(70,120,140,0.8)");
  // mountains along the north edge
  for (let i = 0; i < 9; i++) mountain(g, 300 + i * 50 + (i % 2) * 10, 60 + (i % 3) * 6, 0.9 + (i % 2) * 0.3, i % 3 === 0);
  // roads between places, as dashes
  g.setLineDash([7, 5]);
  for (const [a, b] of ROADS) {
    const p = PLACES.find((q) => q.id === a)!;
    const q = PLACES.find((q) => q.id === b)!;
    const mx = (p.x + q.x) / 2 + (p.y - q.y) * 0.08;
    const my = (p.y + q.y) / 2 + (q.x - p.x) * 0.08;
    g.strokeStyle = "rgba(110,60,30,0.85)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.quadraticCurveTo(mx, my, q.x, q.y);
    g.stroke();
  }
  g.setLineDash([]);
  // the Hollow is reached through a portal in Brindle
  g.setLineDash([2, 5]);
  g.strokeStyle = "rgba(110,60,150,0.8)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(420, 150);
  g.lineTo(270, 140);
  g.stroke();
  g.setLineDash([]);
  for (const p of PLACES) p.draw(g, p.x, p.y);
  // sea life
  ship(g, 860, 620);
  ship(g, 120, 690);
  serpent(g, 760, 690);
  waves(g, 650, 670);
  waves(g, 900, 520);
  waves(g, 60, 500);
  waves(g, 330, 700);
  // a compass rose
  const cx = 905;
  const cy = 95;
  g.strokeStyle = INK;
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(cx, cy, 34, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, 26, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const long = i % 2 === 0;
    const len = long ? 44 : 26;
    g.fillStyle = i === 0 ? "#b5402a" : long ? INK : "#a08060";
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.lineTo(cx + Math.cos(a + 0.35) * 8, cy + Math.sin(a + 0.35) * 8);
    g.lineTo(cx + Math.cos(a - 0.35) * 8, cy + Math.sin(a - 0.35) * 8);
    g.closePath();
    g.fill();
  }
  g.font = "bold 14px Georgia, serif";
  g.textAlign = "center";
  g.fillStyle = INK;
  g.fillText("N", cx, cy - 50);
  // the title in a banner
  g.fillStyle = "#f3e4bc";
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(40, 40);
  g.lineTo(300, 40);
  g.lineTo(285, 62);
  g.lineTo(300, 84);
  g.lineTo(40, 84);
  g.lineTo(55, 62);
  g.closePath();
  g.fill();
  g.stroke();
  g.font = "bold 22px Georgia, 'Tahoma', serif";
  g.fillStyle = "#5a2a1a";
  g.fillText("ดินแดนเฮิร์ธเวล", 170, 70);
  // worn edges
  const edge = g.createRadialGradient(500, 360, 280, 500, 360, 640);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(90,50,20,0.55)");
  g.fillStyle = edge;
  g.fillRect(0, 0, 1000, 720);
  g.strokeStyle = "#6b4226";
  g.lineWidth = 6;
  g.strokeRect(3, 3, 994, 714);
  g.strokeStyle = "rgba(107,66,38,0.6)";
  g.lineWidth = 1.5;
  g.strokeRect(14, 14, 972, 692);
  paper = c;
  return c;
}

/** Where on the sheet a click landed, as a place (or none). */
export function placeAt(sx: number, sy: number): Place | null {
  return PLACES.find((p) => Math.hypot(p.x - sx, p.y - sy) < p.r * 0.7) ?? null;
}

/** Draws the continent fitted into the canvas; returns how to turn canvas pixels back into sheet pixels. */
export function drawContinent(c: HTMLCanvasElement, here: ZoneId | null, time: number, hover: ZoneId | null) {
  const g = c.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "#2a1d12";
  g.fillRect(0, 0, c.width, c.height);
  const k = Math.min(c.width / 1000, c.height / 720);
  const ox = (c.width - 1000 * k) / 2;
  const oy = (c.height - 720 * k) / 2;
  g.setTransform(k, 0, 0, k, ox, oy);
  g.imageSmoothingEnabled = true;
  g.drawImage(sheet(), 0, 0);
  for (const p of PLACES) {
    const on = p.id === hover;
    g.textAlign = "center";
    g.font = `bold ${on ? 19 : 17}px Georgia, 'Tahoma', serif`;
    g.lineWidth = 4;
    g.strokeStyle = "rgba(243,228,188,0.95)";
    g.strokeText(p.name, p.x, p.y + p.r * 0.62);
    g.fillStyle = on ? "#8a2a1a" : "#3a2414";
    g.fillText(p.name, p.x, p.y + p.r * 0.62);
    g.font = "italic 13px Georgia, 'Tahoma', serif";
    g.strokeText(p.levels, p.x, p.y + p.r * 0.62 + 17);
    g.fillStyle = p.levels.includes("ชายแดน") || p.levels.includes("PvP") ? "#8a2a1a" : "#5a3a22";
    g.fillText(p.levels, p.x, p.y + p.r * 0.62 + 17);
  }
  const at = PLACES.find((p) => p.id === here);
  if (at) {
    // a red pin that bobs, with "you are here"
    const bob = Math.sin(time / 300) * 3;
    const x = at.x + 40;
    const y = at.y - 50 + bob;
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.beginPath();
    g.ellipse(x, at.y - 22, 6, 2.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#c8302a";
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, y - 12, 8, Math.PI, 0);
    g.lineTo(x, y + 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(x, y - 13, 3, 0, Math.PI * 2);
    g.fill();
    g.font = "bold 13px Tahoma, sans-serif";
    g.lineWidth = 3;
    g.strokeStyle = "#f3e4bc";
    g.strokeText("คุณอยู่ที่นี่", x, y - 24);
    g.fillStyle = "#8a2a1a";
    g.fillText("คุณอยู่ที่นี่", x, y - 24);
  }
  return { k, ox, oy };
}
