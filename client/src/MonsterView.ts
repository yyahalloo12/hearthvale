import Phaser from "phaser";
import { MONSTERS } from "../../shared/stats";
import { toScreen } from "./iso";
import { MONSTER_SIZE } from "./monsterTextures";

/** One monster on screen, smoothly following the server position. */
export class MonsterView {
  readonly root: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Image;
  private hpBar: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Image;
  private stunStars: Phaser.GameObjects.Text;
  readonly size: { h: number; r: number };
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  moving = false;
  hp = 1;
  maxHp = 1;
  dying = false;
  private walkTime = 0;

  constructor(private scene: Phaser.Scene, readonly kind: string, level: number, x: number, y: number) {
    this.x = this.targetX = x;
    this.y = this.targetY = y;
    this.size = MONSTER_SIZE[kind] ?? { h: 40, r: 22 };
    const def = MONSTERS[kind];
    this.ring = scene.add.image(0, 0, "target-ring").setVisible(false);
    if (def?.boss) this.ring.setScale(1.5);
    const shadow = scene.add.image(0, 0, "c-shadow").setScale(this.size.r / 16, 1);
    this.sprite = scene.add.image(0, 2, `mon-${kind}`).setOrigin(0.5, 1);
    const label = scene.add
      .text(0, -this.size.h - 6, `${def?.name ?? kind} Lv${level}`, {
        fontFamily: "Tahoma, sans-serif",
        fontSize: def?.boss ? "13px" : "11px",
        color: def?.boss ? "#ffb347" : "#ffe9c4",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1);
    this.hpBar = scene.add.graphics();
    this.stunStars = scene.add
      .text(0, -this.size.h - 22, "✦ ✦", { fontSize: "12px", color: "#ffe14d", stroke: "#000", strokeThickness: 2 })
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.root = scene.add.container(0, 0, [this.ring, shadow, this.sprite, label, this.hpBar, this.stunStars]);
    this.place();
  }

  setFacing(f: number) {
    // texture faces screen-left; mirror for right-ish facings
    this.sprite.setFlipX(f >= 5 && f <= 7);
  }

  setHp(hp: number, max: number) {
    this.hp = hp;
    this.maxHp = max;
    this.hpBar.clear();
    if (hp >= max) return;
    const w = Math.max(30, this.size.r * 1.6);
    const y = -this.size.h - 4;
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(-w / 2 - 1, y - 1, w + 2, 6);
    this.hpBar.fillStyle(0xe85c5c);
    this.hpBar.fillRect(-w / 2, y, (w * Math.max(0, hp)) / max, 4);
  }

  setTargeted(on: boolean) {
    this.ring.setVisible(on);
  }

  setStunned(on: boolean) {
    this.stunStars.setVisible(on);
  }

  flash() {
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.sprite.clearTint());
  }

  /** Point (world pixels) where hit numbers should appear. */
  head() {
    return { x: this.root.x, y: this.root.y - this.size.h };
  }

  /** Body centre in world pixels, for click picking. */
  center() {
    return { x: this.root.x, y: this.root.y - this.size.h / 2 };
  }

  update(dtMs: number) {
    if (this.dying) return;
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    if (Math.hypot(dx, dy) > 3) {
      this.x = this.targetX;
      this.y = this.targetY;
    } else {
      const k = Math.min(1, (dtMs / 1000) * 14);
      this.x += dx * k;
      this.y += dy * k;
    }
    if (this.moving) this.walkTime += dtMs;
    else this.walkTime = 0;
    this.sprite.y = 2 - (this.moving ? Math.abs(Math.sin(this.walkTime / 80)) * 3 : 0);
    this.place();
  }

  private place() {
    const p = toScreen(this.x, this.y);
    this.root.setPosition(p.x, p.y);
    this.root.setDepth(p.y + 1);
  }

  /** Fade out and remove. */
  die() {
    this.dying = true;
    this.ring.setVisible(false);
    this.scene.tweens.add({
      targets: this.root,
      alpha: 0,
      y: this.root.y + 6,
      duration: 500,
      onComplete: () => this.root.destroy(),
    });
  }

  destroy() {
    this.root.destroy();
  }
}
