import Phaser from "phaser";
import { TILE_H } from "../../shared/constants";
import { resourceAt, StationKind, stationAt } from "../../shared/items";
import { GameMap, isHouseAnchor, Prop, Tile } from "../../shared/map";
import { RAMP_DIR } from "../../shared/terrain";
import { LEVEL_H, place, toScreen } from "./iso";
import { SCENERY_SCALE } from "./sprites";
import { groundDetail, groundKey, houseFrame, PROP_SHADOW, propFrame } from "./textures";

/**
 * Draws the land in square pieces. A piece is made the first time it comes into
 * view and taken off the display list when it leaves, so big maps stay fast.
 */

const CH = 10;
const MARGIN = 170;

/** Cliff colours: left face, right face, and the lip of grass on top. */
const CLIFF: Record<string, [number, number, number]> = {
  brindle: [0xa97a4c, 0x8a6139, 0x63ad47],
  mossfen: [0x75624c, 0x5c4c3a, 0x4d8a44],
  hollow: [0x554f5f, 0x433e4c, 0x8a8494],
};
const RAMP_TOP: Record<string, number> = { brindle: 0xd3b27c, mossfen: 0xa98f68, hollow: 0x7c7686 };

export interface Usable {
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  kind: StationKind | "resource";
}

interface Piece {
  objects: Phaser.GameObjects.GameObject[];
  shown: boolean;
}

const STATION_LABEL: Partial<Record<StationKind, string>> = {
  smith: "ช่างฝีมือ",
  storage: "คลังเก็บของ",
  portal: "ทางเข้า Hollow",
  board: "กระดานประมูล",
  windmill: "กังหันลม",
  lantern: "โคมหิน",
  treasure: "หีบลานสมบัติ",
};
const LABEL_UP: Partial<Record<StationKind, number>> = { portal: 80, windmill: 150, lantern: 72 };

export class Land {
  /** rocks, trees and stations that can be clicked, by "x,y" */
  readonly usable = new Map<string, Usable>();
  private pieces = new Map<string, Piece>();
  private mills: Phaser.GameObjects.Image[] = [];
  private current!: Piece;

  constructor(
    private scene: Phaser.Scene,
    private map: GameMap,
    private isUsedUp: (key: string) => boolean,
    private isLit: (key: string) => boolean,
  ) {}

  /** Shows the pieces in view and hides the others. */
  update(view: Phaser.Geom.Rectangle, time: number) {
    const l = view.x - MARGIN;
    const r = view.right + MARGIN;
    const t = view.y - MARGIN;
    const b = view.bottom + MARGIN + LEVEL_H * 4;
    const nx = Math.ceil(this.map.width / CH);
    const ny = Math.ceil(this.map.height / CH);
    for (let cy = 0; cy < ny; cy++)
      for (let cx = 0; cx < nx; cx++) {
        // the piece's diamond on screen
        const c = toScreen((cx + 0.5) * CH, (cy + 0.5) * CH);
        const hw = CH * 32;
        const hh = CH * 16;
        const inView = c.x + hw > l && c.x - hw < r && c.y + hh > t && c.y - hh < b;
        const key = `${cx},${cy}`;
        let p = this.pieces.get(key);
        if (inView && !p) {
          p = { objects: [], shown: true };
          this.pieces.set(key, p);
          this.build(p, cx, cy);
        } else if (p && p.shown !== inView) {
          p.shown = inView;
          for (const o of p.objects) {
            if (inView) (o as Phaser.GameObjects.Image).addToDisplayList();
            else (o as Phaser.GameObjects.Image).removeFromDisplayList();
          }
        }
      }
    const frame = `windmill${Math.floor(time / 120) % 6}`;
    for (const m of this.mills) if (m.frame.name !== frame) m.setFrame(frame);
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.current.objects.push(o);
    return o;
  }

  private scenery(x: number, y: number, frame: string) {
    return this.keep(this.scene.add.image(x, y, "scenery", frame).setScale(SCENERY_SCALE));
  }

  private build(piece: Piece, cx: number, cy: number) {
    this.current = piece;
    for (let y = cy * CH; y < Math.min(this.map.height, (cy + 1) * CH); y++)
      for (let x = cx * CH; x < Math.min(this.map.width, (cx + 1) * CH); x++) this.tile(x, y);
  }

  /** Heights of a tile's corners: back, right, front, left (as seen on screen). */
  private corners(x: number, y: number): [number, number, number, number] {
    const l = this.map.level[y]?.[x];
    if (l === undefined) return [0, 0, 0, 0];
    const r = this.map.ramp[y][x];
    if (!r) return [l, l, l, l];
    const [ux, uy] = RAMP_DIR[r];
    // corner offsets: back (-,-), right (+,-), front (+,+), left (-,+)
    const up = (sx: number, sy: number) => l + (ux * sx + uy * sy > 0 ? 1 : 0);
    return [up(-1, -1), up(1, -1), up(1, 1), up(-1, 1)];
  }

  private tile(x: number, y: number) {
    const { map, scene } = this;
    const flat = toScreen(x, y);
    const p = place(x, y);
    const me = this.corners(x, y);
    const nw = this.corners(x - 1, y); // shares our back-left edge
    const ne = this.corners(x, y - 1); // shares our back-right edge
    const se = this.corners(x + 1, y); // front-right
    const sw = this.corners(x, y + 1); // front-left
    // higher than the ground behind: hides whoever stands there
    const hides = me[0] > nw[1] + 0.01 || me[3] > nw[2] + 0.01 || me[0] > ne[3] + 0.01 || me[1] > ne[2] + 0.01;
    const depth = hides ? flat.y - 8 : -10000 + flat.y * 0.0005;
    const eps = hides ? 0.01 : 0.0001;
    const t = map.tiles[y][x];
    const ramp = map.ramp[y][x];

    const right = me[1] > se[0] + 0.01 || me[2] > se[3] + 0.01;
    const left = me[3] > sw[0] + 0.01 || me[2] > sw[1] + 0.01;
    if (right || left) this.cliff(x, y, me, right ? se : null, left ? sw : null, depth - eps);
    if (hides) {
      // a light rim where the land drops away behind
      const g = this.keep(scene.add.graphics({ x: flat.x, y: flat.y })).setDepth(depth + eps * 3);
      const [back, rt, , lt] = this.points(me);
      g.lineStyle(3, CLIFF[map.id][1], 1);
      if (me[0] > nw[1] + 0.01 || me[3] > nw[2] + 0.01) g.lineBetween(back[0], back[1] + 1, lt[0], lt[1] + 1);
      if (me[0] > ne[3] + 0.01 || me[1] > ne[2] + 0.01) g.lineBetween(back[0], back[1] + 1, rt[0], rt[1] + 1);
    }
    if (ramp) this.ramp(x, y, me, depth);
    else {
      this.keep(scene.add.image(flat.x, flat.y - me[0] * LEVEL_H, groundKey(t, x, y, map) + (me[0] ? `-h${me[0]}` : "")).setDepth(depth));
      const detail = groundDetail(t, x, y);
      if (detail) this.scenery(p.x, p.y, detail).setDepth(depth + eps);
    }

    const prop = map.props[y][x];
    if (prop === Prop.House || prop === Prop.Windmill) {
      if (isHouseAnchor(map, x, y)) {
        // centre of the 2x2 footprint, sorted by its front corner
        const c = place(x + 0.5, y + 0.5);
        const d = toScreen(x + 1.5, y + 1.5).y - TILE_H / 2;
        const mill = prop === Prop.Windmill;
        const img = this.scenery(c.x, c.y, mill ? "windmill0" : houseFrame(x, y)).setDepth(d);
        if (mill) {
          this.mills.push(img);
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) this.usable.set(`${x + dx},${y + dy}`, { x: x + dx, y: y + dy, img, kind: "windmill" });
          this.label(c.x, c.y - 150, STATION_LABEL.windmill!, d + 1);
        }
      }
      return;
    }
    const res = resourceAt(map, x, y);
    const frame = propFrame(map, x, y, res?.item);
    if (!frame) return;
    const key = `${x},${y}`;
    const shadow = PROP_SHADOW[prop];
    if (shadow) this.keep(scene.add.image(p.x, p.y + 2, "c-shadow").setScale(shadow).setDepth(depth + eps * 2));
    const img = this.scenery(p.x, p.y, prop === Prop.Lantern && this.isLit(key) ? "lantern1" : frame).setDepth(p.depth);
    const station = stationAt(map, x, y);
    if (res || station) this.usable.set(key, { x, y, img, kind: station ?? "resource" });
    if (res && this.isUsedUp(key)) img.setAlpha(0.35);
    if (station) this.label(p.x, p.y - (LABEL_UP[station] ?? 40), STATION_LABEL[station] ?? "", p.depth + 1);
  }

  private label(x: number, y: number, text: string, depth: number) {
    this.keep(
      this.scene.add
        .text(x, y, text, { fontFamily: "Tahoma, sans-serif", fontSize: "12px", color: "#ffe9a8", stroke: "#000000", strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setDepth(depth),
    );
  }

  /** Screen points of a tile's corners at given heights (relative to the tile centre). */
  private points(h: [number, number, number, number]): [number, number][] {
    return [
      [0, -16 - h[0] * LEVEL_H],
      [32, -h[1] * LEVEL_H],
      [0, 16 - h[2] * LEVEL_H],
      [-32, -h[3] * LEVEL_H],
    ];
  }

  private quad(g: Phaser.GameObjects.Graphics, pts: [number, number][], color: number) {
    g.fillStyle(color);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
    g.closePath();
    g.fillPath();
  }

  /** The faces of a cliff below this tile, on the two sides we can see. */
  private cliff(x: number, y: number, me: [number, number, number, number], se: [number, number, number, number] | null, sw: [number, number, number, number] | null, depth: number) {
    const f = toScreen(x, y);
    const g = this.keep(this.scene.add.graphics({ x: f.x, y: f.y })).setDepth(depth);
    const [L, R, LIP] = CLIFF[this.map.id];
    const top = this.points(me);
    const face = (a: [number, number], b: [number, number], ha: number, hb: number, color: number) => {
      // a, b: upper ends of the edge; ha, hb: ground height below them
      const a2: [number, number] = [a[0], (a[0] === 0 ? 16 : 0) - ha * LEVEL_H];
      const b2: [number, number] = [b[0], (b[0] === 0 ? 16 : 0) - hb * LEVEL_H];
      if (a2[1] - a[1] < 0.5 && b2[1] - b[1] < 0.5) return;
      this.quad(g, [a, b, [b2[0], b2[1] + 1], [a2[0], a2[1] + 1]], color);
      // bands of rock
      g.lineStyle(1.5, 0x000000, 0.14);
      const n = Math.max(1, Math.round((Math.max(a2[1] - a[1], b2[1] - b[1]) / LEVEL_H) * 3));
      for (let i = 1; i < n; i++) g.lineBetween(a[0], a[1] + ((a2[1] - a[1]) * i) / n, b[0], b[1] + ((b2[1] - b[1]) * i) / n);
      const k = ((x * 7 + y * 13) % 5) / 5;
      g.lineBetween(a[0] + (b[0] - a[0]) * (0.2 + k * 0.6), a[1] + (b[1] - a[1]) * (0.2 + k * 0.6) + 4, a[0] + (b[0] - a[0]) * (0.2 + k * 0.6), a[1] + (b[1] - a[1]) * (0.2 + k * 0.6) + 12);
      // grass hanging over the edge, and a dark foot
      this.quad(g, [a, b, [b[0], Math.min(b2[1], b[1] + 6)], [a[0], Math.min(a2[1], a[1] + 6)]], LIP);
      g.lineStyle(2, 0x2b1a10, 0.35);
      g.lineBetween(a2[0], a2[1], b2[0], b2[1]);
    };
    if (sw) face(top[3], top[2], sw[0], sw[1], L);
    if (se) face(top[2], top[1], se[3], se[0], R);
  }

  /** A slope with steps. */
  private ramp(x: number, y: number, me: [number, number, number, number], depth: number) {
    const f = toScreen(x, y);
    const g = this.keep(this.scene.add.graphics({ x: f.x, y: f.y })).setDepth(depth);
    const pts = this.points(me);
    const base = RAMP_TOP[this.map.id];
    this.quad(g, pts, base);
    const [ux, uy] = RAMP_DIR[this.map.ramp[y][x]];
    // step lines run across the slope
    const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    // ends of the two edges that run uphill, low end first
    const [a0, a1, b0, b1] = ux > 0 ? [pts[0], pts[1], pts[3], pts[2]] : ux < 0 ? [pts[1], pts[0], pts[2], pts[3]] : uy > 0 ? [pts[0], pts[3], pts[1], pts[2]] : [pts[3], pts[0], pts[2], pts[1]];
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      if (i % 2) this.quad(g, [lerp(a0, a1, t), lerp(b0, b1, t), lerp(b0, b1, t + 0.2), lerp(a0, a1, t + 0.2)], Phaser.Display.Color.IntegerToColor(base).darken(8).color);
      g.lineStyle(1.5, 0x3b2a1a, 0.35);
      const p = lerp(a0, a1, t);
      const q = lerp(b0, b1, t);
      g.lineBetween(p[0], p[1], q[0], q[1]);
    }
    g.lineStyle(2, 0x3b2a1a, 0.4);
    g.lineBetween(a0[0], a0[1], a1[0], a1[1]);
    g.lineBetween(b0[0], b0[1], b1[0], b1[1]);
  }
}

/** Colour of fallen ground. */
export const FALLEN = 0x14111b;
export const isGround = (t: Tile) => t !== Tile.Water && t !== Tile.Void;
