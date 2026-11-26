/**
 * The pixel look of the interface: small PNG pieces for frames, slots, bars and
 * buttons (stretched with CSS border-image and drawn with nearest-neighbour
 * scaling), plus a tiny pixel font for Latin letters and numbers.
 *
 *   node art/pixelui.mjs        -> client/public/ui/*.png, client/public/ui/hvpixel.ttf
 *
 * Everything is drawn here pixel by pixel, so it can be changed and made again.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";

const OUT = path.resolve("client/public/ui");
fs.mkdirSync(OUT, { recursive: true });

// ---- a tiny PNG writer ------------------------------------------------------------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = px[y * w + x];
      const o = y * (w * 4 + 1) + 1 + x * 4;
      if (c === null) continue;
      raw[o] = (c >> 16) & 255;
      raw[o + 1] = (c >> 8) & 255;
      raw[o + 2] = c & 255;
      raw[o + 3] = 255;
    }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** A picture from rows of letters and a palette ("." = clear). */
function art(name, rows, pal) {
  const h = rows.length;
  const w = rows[0].length;
  const px = [];
  for (const r of rows) {
    if (r.length !== w) throw new Error(`${name}: row width ${r.length} != ${w}`);
    for (const ch of r) px.push(ch === "." ? null : pal[ch]);
  }
  fs.writeFileSync(path.join(OUT, `${name}.png`), png(w, h, px));
}

/**
 * A frame with rounded pixel corners. Layers from outside in:
 * outline, light top/left, band, dark bottom/right, inner line, fill.
 */
function frame(name, size, c, opts = {}) {
  const { band = 2, inner = true, round = 1 } = opts;
  const rows = [];
  for (let y = 0; y < size; y++) {
    let r = "";
    for (let x = 0; x < size; x++) {
      const d = Math.min(x, y, size - 1 - x, size - 1 - y);
      const corner = Math.min(x, size - 1 - x) + Math.min(y, size - 1 - y);
      if (corner < round) r += ".";
      else if (d === 0 || (corner === round && round > 0)) r += "o";
      else if (d <= band) {
        const topLeft = x < size / 2 && y < size / 2 ? x <= y : y < x;
        const lightSide = y === d || x === d;
        const darkSide = y === size - 1 - d || x === size - 1 - d;
        r += d === 1 && lightSide && !darkSide ? "l" : d === band && darkSide && !lightSide ? "d" : "b";
        void topLeft;
      } else if (inner && d === band + 1) r += "i";
      else if (inner && d === band + 2 && (y === band + 2 || x === band + 2)) r += "s";
      else r += "f";
    }
    rows.push(r);
  }
  art(name, rows, c);
}

// palettes, after the warm wood of the old interface
const WOOD = { o: 0x24130c, l: 0xe0a26a, b: 0xb5683d, d: 0x7a3f22, i: 0x3a1f12, s: 0xd2ad78, f: 0xe9cc98 };
const DARK = { o: 0x24130c, l: 0xd08a52, b: 0xa65d36, d: 0x6e381e, i: 0x2a160c, s: 0x4a2a18, f: 0x5a321d };
const SLOT = { o: 0x2a160c, l: 0x9a5530, b: 0xc27a48, d: 0xd48c58, i: 0xc27a48, s: 0xc27a48, f: 0xc8814e };
const BTN = { o: 0x24130c, l: 0xf0c48a, b: 0xc98450, d: 0x8a4a28, i: 0xc98450, s: 0xc98450, f: 0xd08c56 };
const RED = { o: 0x24130c, l: 0xe0785a, b: 0xb24a34, d: 0x6e2418, i: 0xb24a34, s: 0xb24a34, f: 0xb8503a };
const GOLD = { o: 0x3a2008, l: 0xfff0a0, b: 0xffd23a, d: 0xc8901a, i: 0xffd23a, s: 0xffd23a, f: 0xffd23a };

frame("panel", 16, WOOD, { band: 2, inner: true, round: 1 });
frame("panel-dark", 16, DARK, { band: 2, inner: true, round: 1 });
frame("slot", 10, SLOT, { band: 1, inner: false, round: 1 });
frame("btn", 10, BTN, { band: 1, inner: false, round: 1 });
frame("btn-red", 10, RED, { band: 1, inner: false, round: 1 });
frame("title", 10, { ...BTN, f: 0xb5683d, b: 0xb5683d, l: 0xd99a62 }, { band: 1, inner: false, round: 1 });

// the yellow ring round a picked slot (just the edge, clear inside)
{
  const n = 10;
  const rows = [];
  for (let y = 0; y < n; y++) {
    let r = "";
    for (let x = 0; x < n; x++) {
      const d = Math.min(x, y, n - 1 - x, n - 1 - y);
      const corner = Math.min(x, n - 1 - x) + Math.min(y, n - 1 - y);
      r += corner < 1 ? "." : d === 0 ? "o" : d === 1 ? "b" : d === 2 ? "l" : ".";
    }
    rows.push(r);
  }
  art("slot-on", rows, { o: 0x3a2008, b: 0xffd23a, l: 0xfff0a0 });
}

// a bar track: rounded ends, dark inside
art(
  "bar",
  [
    "..oooooo..",
    ".oiiiiiio.",
    "oiffffffio",
    "oiffffffio",
    "oiffffffio",
    "oiffffffio",
    ".oiiiiiio.",
    "..oooooo..",
  ],
  { o: 0x24130c, i: 0x6e381e, f: 0x2a160c },
);

// round badges for the bars, with a little picture
const BADGE_RING = [
  "....oooooo....",
  "..oobbbbbboo..",
  ".obbllllllbbo.",
  ".obl......lbo.",
  "obl........lbo",
  "obl........lbo",
  "obl........lbo",
  "obl........lbo",
  "obl........lbo",
  "obl........lbo",
  ".obl......lbo.",
  ".obbddddddbbo.",
  "..oobbbbbboo..",
  "....oooooo....",
];
function badge(name, pic, pal) {
  const rows = BADGE_RING.map((r, y) =>
    r
      .split("")
      .map((ch, x) => {
        if (ch !== ".") return ch;
        const inside = Math.hypot(x - 6.5, y - 6.5) < 5.6;
        if (!inside) return ".";
        const p = pic[y - 3]?.[x - 3];
        return p && p !== "." ? p : "f";
      })
      .join(""),
  );
  art(name, rows, { o: 0x24130c, b: 0xb5683d, l: 0xe0a26a, d: 0x7a3f22, f: 0xe9cc98, ...pal });
}
badge("icon-hp", ["........", ".rr..rr.", "rRRrrrrr", "rRrrrrrr", ".rrrrrr.", "..rrrr..", "...rr...", "........"], { r: 0xd8323a, R: 0xff9a9a });
badge("icon-mp", ["...b....", "...bb...", "..bBbb..", "..bBbbb.", ".bbbbbb.", ".bbbbbb.", "..bbbb..", "........"], { b: 0x2f7fe0, B: 0x9ad0ff });
badge("icon-xp", ["...y....", "...y....", ".yyyyyy.", "..yYyy..", "..yyyy..", ".yy..yy.", ".y....y.", "........"], { y: 0xf2b82e, Y: 0xfff0a0 });
badge("icon-cr", ["..pppp..", ".pPPppp.", "pp.pp.pp", "pppppppp", ".pp..pp.", "..pppp..", "..p..p..", "........"], { p: 0x8a3ab0, P: 0xe0a8ff });

// the close button: a red pixel square with a pale X
art(
  "close",
  [
    ".oooooooooo.",
    "ollllllllllo",
    "olrrrrrrrrdo",
    "olrXrrrrXrdo",
    "olrrXrrXrrdo",
    "olrrrXXrrrdo",
    "olrrrXXrrrdo",
    "olrrXrrXrrdo",
    "olrXrrrrXrdo",
    "olrrrrrrrrdo",
    "oddddddddddo",
    ".oooooooooo.",
  ],
  { o: 0x24130c, l: 0xe0785a, r: 0xb24a34, d: 0x6e2418, X: 0xf6dcb4 },
);

// a little paper grain for the inside of panels
{
  const n = 8;
  const px = [];
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n * n; i++) {
    const v = r();
    px.push(v < 0.12 ? 0xe2c08a : v < 0.2 ? 0xefd6a6 : 0xe9cc98);
  }
  fs.writeFileSync(path.join(OUT, "grain.png"), png(n, n, px));
}

// ---- a pixel font (5 x 7 on a 6 x 9 cell) as a TrueType file ---------------------------
const G = {
  " ": [],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["###", ".#.", ".#.", ".#.", ".#.", ".#.", "###"],
  J: ["..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  a: [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
  b: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
  c: [".....", ".....", ".###.", "#....", "#....", "#....", ".###."],
  d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  f: ["..##", ".#..", "####", ".#..", ".#..", ".#..", ".#.."],
  g: [".....", ".####", "#...#", "#...#", ".####", "....#", ".###."],
  h: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
  i: [".#.", "...", "##.", ".#.", ".#.", ".#.", "###"],
  j: ["...#", "....", "..##", "...#", "...#", "#..#", ".##."],
  k: ["#...", "#...", "#..#", "#.#.", "##..", "#.#.", "#..#"],
  l: ["##.", ".#.", ".#.", ".#.", ".#.", ".#.", "###"],
  m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#...#"],
  n: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  o: [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
  p: [".....", "####.", "#...#", "#...#", "####.", "#....", "#...."],
  q: [".....", ".####", "#...#", "#...#", ".####", "....#", "....#"],
  r: [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
  s: [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  t: [".#..", ".#..", "####", ".#..", ".#..", ".#..", "..##"],
  u: [".....", ".....", "#...#", "#...#", "#...#", "#..##", ".##.#"],
  v: [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  w: [".....", ".....", "#...#", "#...#", "#.#.#", "#.#.#", ".#.#."],
  x: [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  y: [".....", "#...#", "#...#", "#...#", ".####", "....#", ".###."],
  z: [".....", ".....", "#####", "...#.", "..#..", ".#...", "#####"],
  0: [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  3: ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  6: [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  9: [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  ".": [".", ".", ".", ".", ".", ".", "#"],
  ",": ["..", "..", "..", "..", "..", ".#", "#."],
  ":": [".", ".", "#", ".", ".", "#", "."],
  ";": ["..", "..", ".#", "..", "..", ".#", "#."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "%": ["##..#", "##..#", "...#.", "..#..", ".#...", "#..##", "#..##"],
  "(": ["..#", ".#.", "#..", "#..", "#..", ".#.", "..#"],
  ")": ["#..", ".#.", "..#", "..#", "..#", ".#.", "#.."],
  "!": ["#", "#", "#", "#", "#", ".", "#"],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "'": ["#", "#", ".", ".", ".", ".", "."],
  '"': ["#.#", "#.#", "...", "...", "...", "...", "..."],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  "@": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#....", ".###."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "*": [".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  "<": ["...#", "..#.", ".#..", "#...", ".#..", "..#.", "...#"],
  ">": ["#...", ".#..", "..#.", "...#", "..#.", ".#..", "#..."],
  "[": ["##", "#.", "#.", "#.", "#.", "#.", "##"],
  "]": ["##", ".#", ".#", ".#", ".#", ".#", "##"],
  _: [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "×": [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  "·": [".", ".", ".", "#", ".", ".", "."],
};

const U = 128; // font units per pixel
const ASC = 8 * U; // rows above the baseline (7 + 1 spare)
const DESC = 2 * U;
const EM = 1280;

function glyphData(rows) {
  // one rectangle for each run of filled pixels in a row
  const rects = [];
  const h = rows.length;
  const down = rows === G.g || rows === G.p || rows === G.q || rows === G.y || rows === G.j || rows === G[","] || rows === G[";"] ? 1 : 0;
  rows.forEach((r, y) => {
    let x = 0;
    while (x < r.length) {
      if (r[x] !== "#") {
        x++;
        continue;
      }
      let e = x;
      while (e < r.length && r[e] === "#") e++;
      const top = (h - y - down) * U;
      rects.push([(x + 0.5) * U, top - U, (e + 0.5) * U, top]);
      x = e;
    }
  });
  const width = ((rows[0]?.length ?? 3) + 1) * U;
  if (!rects.length) return { buf: Buffer.alloc(0), width, box: [0, 0, 0, 0], pts: 0, cons: 0 };
  const xs = rects.flatMap((r) => [r[0], r[2]]);
  const ys = rects.flatMap((r) => [r[1], r[3]]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const n = rects.length;
  const head = Buffer.alloc(10);
  head.writeInt16BE(n, 0);
  head.writeInt16BE(box[0], 2);
  head.writeInt16BE(box[1], 4);
  head.writeInt16BE(box[2], 6);
  head.writeInt16BE(box[3], 8);
  const ends = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) ends.writeUInt16BE(i * 4 + 3, i * 2);
  const ins = Buffer.alloc(2);
  const pts = [];
  // clockwise: bottom-left, top-left, top-right, bottom-right
  for (const [x0, y0, x1, y1] of rects) pts.push([x0, y0], [x0, y1], [x1, y1], [x1, y0]);
  const flags = Buffer.alloc(pts.length, 1);
  const xb = Buffer.alloc(pts.length * 2);
  const yb = Buffer.alloc(pts.length * 2);
  let px = 0;
  let py = 0;
  pts.forEach(([x, y], i) => {
    xb.writeInt16BE(x - px, i * 2);
    yb.writeInt16BE(y - py, i * 2);
    px = x;
    py = y;
  });
  let buf = Buffer.concat([head, ends, ins, flags, xb, yb]);
  if (buf.length % 4) buf = Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4))]);
  return { buf, width, box, pts: pts.length, cons: n };
}

const chars = Object.keys(G).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
const glyphs = [{ buf: Buffer.alloc(0), width: 4 * U, box: [0, 0, 0, 0], pts: 0, cons: 0 }, ...chars.map((c) => glyphData(G[c]))];
const numGlyphs = glyphs.length;

function table(fields) {
  const parts = fields.map(([t, v]) => {
    const b = Buffer.alloc(t === "i8" ? 8 : t === "u32" || t === "i32" ? 4 : 2);
    if (t === "u16") b.writeUInt16BE(v);
    else if (t === "i16") b.writeInt16BE(v);
    else if (t === "u32") b.writeUInt32BE(v >>> 0);
    else if (t === "i32") b.writeInt32BE(v);
    else if (t === "i8") b.writeBigInt64BE(BigInt(v));
    return b;
  });
  return Buffer.concat(parts);
}

const glyf = Buffer.concat(glyphs.map((g) => g.buf));
const loca = Buffer.alloc((numGlyphs + 1) * 4);
let off = 0;
glyphs.forEach((g, i) => {
  loca.writeUInt32BE(off, i * 4);
  off += g.buf.length;
});
loca.writeUInt32BE(off, numGlyphs * 4);

const all = glyphs.filter((g) => g.pts);
const xMin = Math.min(...all.map((g) => g.box[0]));
const yMin = Math.min(...all.map((g) => g.box[1]));
const xMax = Math.max(...all.map((g) => g.box[2]));
const yMax = Math.max(...all.map((g) => g.box[3]));
const advMax = Math.max(...glyphs.map((g) => g.width));

const head = table([
  ["u32", 0x00010000], ["u32", 0x00010000], ["u32", 0], ["u32", 0x5f0f3cf5], ["u16", 0x000b], ["u16", EM],
  ["i8", 0], ["i8", 0], ["i16", xMin], ["i16", yMin], ["i16", xMax], ["i16", yMax], ["u16", 0], ["u16", 8], ["i16", 2], ["i16", 1], ["i16", 0],
]);
const hhea = table([
  ["u32", 0x00010000], ["i16", ASC], ["i16", -DESC], ["i16", 0], ["u16", advMax], ["i16", xMin], ["i16", 0], ["i16", xMax],
  ["i16", 1], ["i16", 0], ["i16", 0], ["i16", 0], ["i16", 0], ["i16", 0], ["i16", 0], ["i16", 0], ["u16", numGlyphs],
]);
const maxp = table([
  ["u32", 0x00010000], ["u16", numGlyphs], ["u16", Math.max(...glyphs.map((g) => g.pts))], ["u16", Math.max(...glyphs.map((g) => g.cons))],
  ["u16", 0], ["u16", 0], ["u16", 2], ["u16", 0], ["u16", 0], ["u16", 0], ["u16", 0], ["u16", 0], ["u16", 0], ["u16", 0], ["u16", 0],
]);
const hmtx = Buffer.concat(glyphs.map((g) => table([["u16", g.width], ["i16", g.box[0]]])));
const os2 = table([
  ["u16", 3], ["i16", 6 * U], ["u16", 400], ["u16", 5], ["u16", 0],
  ["i16", 650], ["i16", 600], ["i16", 0], ["i16", 75], ["i16", 650], ["i16", 600], ["i16", 0], ["i16", 350], ["i16", 50], ["i16", 300],
  ["i16", 0],
  ["u32", 0], ["u32", 0], ["u32", 0], ["u32", 0], // panose (10) + 6 bytes of unicode range start... laid out below
]);
// OS/2 v3 has a fixed layout; build it field by field to be exact
const os2b = Buffer.alloc(96);
{
  let o = 0;
  const w16 = (v) => (os2b.writeUInt16BE(v & 0xffff, o), (o += 2));
  const s16 = (v) => (os2b.writeInt16BE(v, o), (o += 2));
  const w32 = (v) => (os2b.writeUInt32BE(v >>> 0, o), (o += 4));
  w16(3); s16(6 * U); w16(400); w16(5); w16(0);
  s16(650); s16(600); s16(0); s16(75); s16(650); s16(600); s16(0); s16(350); s16(50); s16(300);
  s16(0);
  o += 10; // panose
  w32(1); w32(0); w32(0); w32(0); // unicode ranges: basic latin
  os2b.write("HVPX", o, "ascii"); o += 4;
  w16(0x40); // fsSelection: regular
  w16(0x20); w16(0xff);
  s16(ASC); s16(-DESC); s16(0);
  w16(ASC); w16(DESC);
  w32(1); w32(0); // code pages: latin 1
  s16(5 * U); s16(7 * U); w16(0); w16(0x20); w16(1);
}
void os2;

// cmap format 4: one segment per character, plus the end marker
const codes = chars.map((c) => c.codePointAt(0));
const segs = codes.length + 1;
const f4 = Buffer.alloc(16 + segs * 8);
{
  let o = 0;
  const w = (v) => (f4.writeUInt16BE(v & 0xffff, o), (o += 2));
  const pow = 2 ** Math.floor(Math.log2(segs));
  w(4); w(f4.length); w(0); w(segs * 2); w(pow * 2); w(Math.log2(pow)); w(segs * 2 - pow * 2);
  for (const c of codes) w(c);
  w(0xffff);
  w(0);
  for (const c of codes) w(c);
  w(0xffff);
  codes.forEach((c, i) => w((i + 1 - c) & 0xffff));
  w(1);
  for (let i = 0; i < segs; i++) w(0);
}
const cmap = Buffer.concat([table([["u16", 0], ["u16", 2], ["u16", 0], ["u16", 3], ["u32", 20], ["u16", 3], ["u16", 1], ["u32", 20]]), f4]);

// name: family "HV Pixel"
function nameTable() {
  const recs = [[1, "HV Pixel"], [2, "Regular"], [3, "HV Pixel Regular"], [4, "HV Pixel"], [5, "Version 1.0"], [6, "HVPixel-Regular"]];
  const strs = recs.map(([, s]) => Buffer.from(s, "utf16le").swap16());
  const hdr = Buffer.alloc(6 + recs.length * 12);
  hdr.writeUInt16BE(0, 0);
  hdr.writeUInt16BE(recs.length, 2);
  hdr.writeUInt16BE(hdr.length, 4);
  let so = 0;
  recs.forEach(([id], i) => {
    const o = 6 + i * 12;
    hdr.writeUInt16BE(3, o);
    hdr.writeUInt16BE(1, o + 2);
    hdr.writeUInt16BE(0x409, o + 4);
    hdr.writeUInt16BE(id, o + 6);
    hdr.writeUInt16BE(strs[i].length, o + 8);
    hdr.writeUInt16BE(so, o + 10);
    so += strs[i].length;
  });
  return Buffer.concat([hdr, ...strs]);
}
const post = table([["u32", 0x00030000], ["u32", 0], ["i16", -U], ["i16", U / 2], ["u32", 1], ["u32", 0], ["u32", 0], ["u32", 0], ["u32", 0]]);

const tables = { "OS/2": os2b, cmap, glyf, head, hhea, hmtx, loca, maxp, name: nameTable(), post };
const tags = Object.keys(tables).sort();
const n = tags.length;
const pow = 2 ** Math.floor(Math.log2(n));
const dir = Buffer.alloc(12 + n * 16);
dir.writeUInt32BE(0x00010000, 0);
dir.writeUInt16BE(n, 4);
dir.writeUInt16BE(pow * 16, 6);
dir.writeUInt16BE(Math.log2(pow), 8);
dir.writeUInt16BE(n * 16 - pow * 16, 10);
const sum = (b) => {
  const p = Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  let s = 0;
  for (let i = 0; i < p.length; i += 4) s = (s + p.readUInt32BE(i)) >>> 0;
  return s;
};
let at = dir.length;
const bodies = [];
tags.forEach((t, i) => {
  const b = tables[t];
  const o = 12 + i * 16;
  dir.write(t.padEnd(4, " "), o, "ascii");
  dir.writeUInt32BE(sum(b), o + 4);
  dir.writeUInt32BE(at, o + 8);
  dir.writeUInt32BE(b.length, o + 12);
  const padded = Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  bodies.push(padded);
  at += padded.length;
});
const font = Buffer.concat([dir, ...bodies]);
// checksum adjustment in head
const headAt = dir.readUInt32BE(12 + tags.indexOf("head") * 16 + 8);
font.writeUInt32BE((0xb1b0afba - sum(font)) >>> 0, headAt + 8);
fs.writeFileSync(path.join(OUT, "hvpixel.ttf"), font);
console.log("ui pieces and font written to", OUT, "glyphs", numGlyphs);
