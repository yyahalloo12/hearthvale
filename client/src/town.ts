import Phaser from "phaser";
import { GameMap, isWalkable, Prop, Tile } from "../../shared/map";
import { findPath, Point } from "../../shared/pathfinding";
import { StationKind, stationAt } from "../../shared/items";
import { place } from "./iso";
import type { Land } from "./land";
import { Folk, FOLK_COLS, PLAYER_SHEET, SCENERY_SCALE } from "./sprites";

/**
 * People of the capital. They live only on each player's screen: they walk the
 * streets, call out at the market, keep the shops, and pigeons scatter when
 * someone walks into them. The server knows nothing about them.
 */

const WALK_MS = 110;
const CHATTER = [
  "วันนี้อากาศดีจังเลย",
  "ได้ยินว่ามีโจรกุหลาบดำอยู่แถวธอร์นมาร์ช ระวังตัวด้วยนะ",
  "หอนาฬิกาตีบอกเวลาทุกชั่วโมงเลยนะ",
  "ขนมปังร้านมุมถนนอร่อยที่สุดในเมือง",
  "พระราชาไม่ได้ออกจากปราสาทมาหลายวันแล้ว",
  "เหมืองคอปเปอร์ฮิลล์ขุดเจอแร่ใหม่อีกแล้ว",
  "อย่าเข้าไปในหมอกตอนกลางคืนคนเดียวล่ะ",
  "พรุ่งนี้มีงานเทศกาลที่ลานน้ำพุ",
  "ฉันจะไปซื้อปลาที่ซันรีช",
  "นกพิราบพวกนี้ตัวอ้วนขึ้นทุกวัน",
];
const KID_TALK = ["วิ่งไล่จับกัน!", "จับไม่ได้หรอก!", "แม่เรียกแล้ว ไปก่อนนะ", "ฉันจะเป็นอัศวินให้ได้!"];
const CALLS: Record<string, string[]> = {
  stall0: ["แอปเปิลแดงสดๆ จากบรินเดิลจ้า!", "ผลไม้หวานฉ่ำ ลูกละเหรียญเดียว!", "ชิมก่อนได้นะ!"],
  stall1: ["ผ้าไหมจากซันรีช สีสวยที่สุด!", "ผ้าคลุมกันหนาวสำหรับนักผจญภัย!", "ด้ายทองเส้นงามมาแล้ว!"],
  stall2: ["สมุนไพรจากมอสเฟน รักษาได้ทุกโรค!", "ขนมปังเพิ่งออกจากเตา!", "ชาร้อนๆ สักแก้วไหม?"],
};
interface Keeper {
  folk: Folk;
  name: string;
  hello: string[];
}
const KEEPERS: Partial<Record<StationKind, Keeper>> = {
  board: { folk: "noble", name: "เลดี้เอลวีน่า นายหน้าประมูล", hello: ["ซื้อขายอะไรดีวันนี้คะ?", "กระดานประมูลเปิดทั้งวันทั้งคืน"] },
  storage: { folk: "scholar", name: "มาริส ผู้ดูแลคลัง", hello: ["ของของท่านปลอดภัยกับเรา", "ฝากหรือถอนดีครับ?"] },
  smith: { folk: "smith", name: "บอร์ก ช่างตีเหล็ก", hello: ["เหล็กร้อนอยู่พอดี!", "อยากได้ดาบดีๆ สักเล่มไหม?"] },
};

/** Facing (0..7) for a step on the grid, the same as the server's. */
function facingFor(dx: number, dy: number) {
  const sx = dx - dy;
  const sy = (dx + dy) / 2;
  if (sx === 0 && sy === 0) return 0;
  return ((Math.round(Math.atan2(-sx, sy) / (Math.PI / 4)) % 8) + 8) % 8;
}

class Person {
  readonly root: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Image;
  x: number;
  y: number;
  facing = 0;
  path: Point[] = [];
  wait = 0;
  anim = Math.random() * 1000;
  private bubble?: Phaser.GameObjects.Container;
  private bubbleUntil = 0;

  constructor(
    private scene: Phaser.Scene,
    readonly folk: Folk,
    x: number,
    y: number,
    readonly speed: number,
    size = 1,
    name?: string,
  ) {
    this.x = x;
    this.y = y;
    const shadow = scene.add.image(0, 0, "c-shadow").setScale(size);
    this.body = scene.add
      .image(0, 0, `folk-${folk}`, 0)
      .setOrigin(0.5, PLAYER_SHEET.originY)
      .setScale(PLAYER_SHEET.scale * size);
    const parts: Phaser.GameObjects.GameObject[] = [shadow, this.body];
    if (name)
      parts.push(
        scene.add
          .text(0, -78 * size, name, { fontFamily: "Tahoma, sans-serif", fontSize: "12px", color: "#ffe9a8", stroke: "#000000", strokeThickness: 3 })
          .setOrigin(0.5, 1),
      );
    this.root = scene.add.container(0, 0, parts);
    this.place();
  }

  say(text: string, ms = 4000) {
    this.bubble?.destroy();
    const t = this.scene.add
      .text(0, -6, text, { fontFamily: "Tahoma, sans-serif", fontSize: "12px", color: "#3b2a1a", wordWrap: { width: 170, useAdvancedWrap: true }, align: "center" })
      .setOrigin(0.5, 1);
    const w = t.width + 12;
    const h = t.height + 6;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0xfffaf0, 0.95);
    bg.lineStyle(2, 0x6b4226);
    bg.fillRoundedRect(-w / 2, -h - 2, w, h, 6);
    bg.strokeRoundedRect(-w / 2, -h - 2, w, h, 6);
    bg.fillTriangle(-5, -2, 5, -2, 0, 5);
    this.bubble = this.scene.add.container(0, -84, [bg, t]);
    this.root.add(this.bubble);
    this.bubbleUntil = this.scene.time.now + ms;
  }

  update(dt: number, now: number) {
    this.anim += dt;
    let moving = false;
    if (this.wait > 0) this.wait -= dt;
    else if (this.path.length) {
      const next = this.path[0];
      const dx = next.x - this.x;
      const dy = next.y - this.y;
      const d = Math.hypot(dx, dy);
      const step = (this.speed * dt) / 1000;
      if (d <= step) {
        this.x = next.x;
        this.y = next.y;
        this.path.shift();
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
      }
      if (d > 0.01) this.facing = facingFor(Math.sign(Math.round(dx * 10)), Math.sign(Math.round(dy * 10)));
      moving = true;
    }
    const col = moving ? 2 + (Math.floor(this.anim / WALK_MS) % 6) : Math.floor(this.anim / 600) % 2;
    this.body.setFrame(this.facing * FOLK_COLS + col);
    if (this.bubble && now > this.bubbleUntil) {
      this.bubble.destroy();
      this.bubble = undefined;
    }
    this.place();
    return moving;
  }

  place() {
    const p = place(this.x, this.y);
    this.root.setPosition(p.x, p.y);
    this.root.setDepth(p.depth + 1);
  }

  destroy() {
    this.root.destroy();
  }
}

interface Pigeon {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  home: Point;
  away: boolean;
  hop: number;
}

export class Town {
  private walkers: Person[] = [];
  private sellers: { p: Person; calls: string[]; next: number }[] = [];
  private keepers: { p: Person; hello: string[] }[] = [];
  private pigeons: Pigeon[] = [];
  private hits: Phaser.GameObjects.Image[] = [];
  private streets: Point[] = [];
  private square: Point[] = [];
  private leaves?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(
    private scene: Phaser.Scene,
    private map: GameMap,
    land: Land,
  ) {
    if (map.id !== "aldermere") return;
    const rnd = Phaser.Math.RND;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (!isWalkable(map, x, y)) continue;
        const t = map.tiles[y][x];
        if (t === Tile.Cobble || t === Tile.Plaza) this.streets.push({ x, y });
        if (t === Tile.Plaza && Math.hypot(x - 32.5, y - 32.5) < 7) this.square.push({ x, y });
      }
    // townsfolk walking about
    const adults: Folk[] = ["man", "woman", "noble", "elder", "merchant", "baker", "scholar", "man", "woman"];
    for (let i = 0; i < 26; i++) {
      const kid = i % 6 === 5;
      const at = rnd.pick(this.streets);
      const folk: Folk = kid ? rnd.pick(["kid", "girl"] as Folk[]) : adults[i % adults.length];
      const p = new Person(scene, folk, at.x, at.y, kid ? 2.8 : 1.3 + Math.random() * 0.5, kid ? 0.78 : 1);
      p.wait = Math.random() * 3000;
      this.walkers.push(p);
    }
    // a seller behind every market stall
    const sellerFolk: Folk[] = ["merchant", "woman", "baker", "girl", "man"];
    let n = 0;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (map.props[y][x] !== Prop.Stall) continue;
        const spot = this.behind(x, y);
        if (!spot) continue;
        const p = new Person(scene, sellerFolk[n++ % sellerFolk.length], spot.x, spot.y, 0);
        p.facing = facingFor(Math.sign(x - spot.x), Math.sign(y - spot.y));
        const frame = map.decor?.[y * map.width + x] ?? "stall0";
        this.sellers.push({ p, calls: CALLS[frame] ?? CALLS.stall0, next: scene.time.now + 2000 + Math.random() * 9000 });
      }
    // shopkeepers beside the stations: click them to use the station
    const kept = new Set<StationKind>();
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const kind = stationAt(map, x, y);
        const k = kind && KEEPERS[kind];
        if (!k || kept.has(kind)) continue;
        kept.add(kind);
        const spot = this.behind(x, y);
        if (!spot) continue;
        const p = new Person(scene, k.folk, spot.x, spot.y, 0, 1, k.name);
        p.facing = facingFor(Math.sign(x - spot.x), Math.sign(y - spot.y));
        this.keepers.push({ p, hello: k.hello });
        // an unseen box round the keeper, so a click on them uses the station
        const feet = place(spot.x, spot.y);
        const hit = scene.add.image(feet.x, feet.y, "c-shadow").setOrigin(0.5, 1).setDisplaySize(40, 70).setVisible(false);
        this.hits.push(hit);
        land.usable.set(`npc${spot.x},${spot.y}`, { x, y, img: hit, kind });
      }
    // pigeons on the square
    for (let i = 0; i < 12; i++) {
      const h = rnd.pick(this.square);
      const img = scene.add.image(0, 0, "city", "pigeon0").setScale(SCENERY_SCALE).setFlipX(Math.random() < 0.5);
      const pg: Pigeon = { img, x: h.x + Math.random() - 0.5, y: h.y + Math.random() - 0.5, home: h, away: false, hop: Math.random() * 2000 };
      this.pigeons.push(pg);
      this.placePigeon(pg);
    }
    // golden leaves drifting down over the city
    const cam = scene.cameras.main;
    this.leaves = scene.add.particles(0, 0, "leaf", {
      x: { min: -200, max: cam.width + 200 },
      y: -20,
      lifespan: 9000,
      speedY: { min: 25, max: 55 },
      speedX: { min: -30, max: 10 },
      rotate: { start: 0, end: 540 },
      scale: { min: 0.7, max: 1.2 },
      alpha: { start: 0.95, end: 0.6 },
      tint: [0xf2b83a, 0xe08a32, 0xe8c84a, 0xc9683a],
      frequency: 260,
    });
    this.leaves.setScrollFactor(0).setDepth(99980);
  }

  /** A free tile next to (x, y), the one furthest back on screen first. */
  private behind(x: number, y: number): Point | null {
    const options = [
      [-1, -1],
      [-1, 0],
      [0, -1],
      [1, -1],
      [-1, 1],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    for (const [dx, dy] of options) if (isWalkable(this.map, x + dx, y + dy)) return { x: x + dx, y: y + dy };
    return null;
  }

  private placePigeon(pg: Pigeon) {
    const p = place(pg.x, pg.y);
    pg.img.setPosition(p.x, p.y).setDepth(p.depth + 0.5);
  }

  /** Someone clicked a shopkeeper: they say hello. */
  greet(x: number, y: number) {
    for (const k of this.keepers) if (Math.abs(k.p.x - x) + Math.abs(k.p.y - y) <= 2) k.p.say(Phaser.Math.RND.pick(k.hello), 3000);
  }

  update(dt: number, now: number, people: Point[]) {
    if (this.map.id !== "aldermere") return;
    const rnd = Phaser.Math.RND;
    for (const w of this.walkers) {
      const moving = w.update(dt, now);
      if (!moving && w.wait <= 0 && !w.path.length) {
        // pick somewhere not too far and walk there
        for (let tries = 0; tries < 6; tries++) {
          const to = rnd.pick(this.streets);
          if (Math.hypot(to.x - w.x, to.y - w.y) > 16) continue;
          const path = findPath(this.map, { x: Math.round(w.x), y: Math.round(w.y) }, to, 400);
          if (path?.length) {
            w.path = path;
            break;
          }
        }
        w.wait = 1500 + Math.random() * 5000;
        if (Math.random() < 0.08) w.say(rnd.pick(w.folk === "kid" || w.folk === "girl" ? KID_TALK : CHATTER));
      }
    }
    for (const s of this.sellers) {
      s.p.update(dt, now);
      if (now > s.next) {
        s.p.say(rnd.pick(s.calls), 3500);
        s.next = now + 8000 + Math.random() * 14000;
      }
    }
    for (const k of this.keepers) k.p.update(dt, now);
    for (const pg of this.pigeons) {
      if (pg.away) continue;
      const near = people.some((p) => Math.hypot(p.x - pg.x, p.y - pg.y) < 1.6) || this.walkers.some((w) => w.speed > 2 && Math.hypot(w.x - pg.x, w.y - pg.y) < 1.2);
      if (near) {
        pg.away = true;
        pg.img.setFrame("pigeon1");
        const dir = Math.random() < 0.5 ? -1 : 1;
        pg.img.setFlipX(dir > 0);
        this.scene.tweens.add({
          targets: pg.img,
          x: pg.img.x + dir * (160 + Math.random() * 120),
          y: pg.img.y - 220 - Math.random() * 100,
          alpha: 0,
          duration: 1600,
          ease: "Quad.easeIn",
          onComplete: () => {
            // land again somewhere on the square later on
            this.scene.time.delayedCall(6000 + Math.random() * 10000, () => {
              const h = rnd.pick(this.square);
              pg.x = h.x + Math.random() - 0.5;
              pg.y = h.y + Math.random() - 0.5;
              pg.img.setFrame("pigeon0").setAlpha(1);
              this.placePigeon(pg);
              pg.away = false;
            });
          },
        });
        continue;
      }
      pg.hop -= dt;
      if (pg.hop <= 0) {
        pg.hop = 800 + Math.random() * 2500;
        const nx = pg.x + (Math.random() - 0.5) * 0.6;
        const ny = pg.y + (Math.random() - 0.5) * 0.6;
        if (Math.hypot(nx - pg.home.x, ny - pg.home.y) < 2.5 && isWalkable(this.map, Math.round(nx), Math.round(ny))) {
          pg.img.setFlipX(nx - ny > pg.x - pg.y);
          pg.x = nx;
          pg.y = ny;
          this.placePigeon(pg);
          this.scene.tweens.add({ targets: pg.img, y: pg.img.y - 4, duration: 90, yoyo: true });
        }
      }
    }
  }

  destroy() {
    for (const w of this.walkers) w.destroy();
    for (const s of this.sellers) s.p.destroy();
    for (const k of this.keepers) k.p.destroy();
    for (const p of this.pigeons) p.img.destroy();
    for (const h of this.hits) h.destroy();
    this.leaves?.destroy();
  }
}
