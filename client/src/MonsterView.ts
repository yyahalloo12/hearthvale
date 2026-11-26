import { setting } from "./settings";
import Phaser from "phaser";
import { MONSTERS } from "../../shared/stats";
import { place } from "./iso";
import { MONSTER_COLS, MONSTER_SHEETS } from "./sprites";

/** One monster on screen, smoothly following the server position. */
export class MonsterView {
  readonly root: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Image;
  private hpBar: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Image;
  private stunStars: Phaser.GameObjects.Text;
  private mark: Phaser.GameObjects.Text;
  private slowed = false;
  readonly size: { h: number; r: number };
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  moving = false;
  hp = 1;
  maxHp = 1;
  dying = false;
  private animTime = Math.random() * 1000;
  private attackLeft = 0;
  private facing = 0;
  private frame = -1;

  private baseTint: number | null = null;
  nameLabel!: Phaser.GameObjects.Text;
  private plain() {
    if (this.baseTint !== null) this.sprite.setTint(this.baseTint);
    else this.sprite.clearTint();
  }

  constructor(private scene: Phaser.Scene, readonly kind: string, level: number, x: number, y: number) {
    this.x = this.targetX = x;
    this.y = this.targetY = y;
    const sheet = MONSTER_SHEETS[kind];
    this.size = { h: sheet?.height ?? 40, r: sheet?.r ?? 22 };
    const def = MONSTERS[kind];
    this.ring = scene.add.image(0, 0, "target-ring").setVisible(false);
    if (def?.boss) this.ring.setScale(1.5);
    const shadow = scene.add.image(0, 0, "c-shadow").setScale(this.size.r / 16, 1);
    this.sprite = scene.add.image(0, 0, `mon-${sheet?.tex ?? kind}`, 0).setOrigin(0.5, sheet?.originY ?? 1).setScale(sheet?.scale ?? 1);
    this.baseTint = sheet?.tint ?? null;
    if (this.baseTint !== null) this.sprite.setTint(this.baseTint);
    const label = scene.add
      .text(0, -this.size.h - 6, `${def?.name ?? kind} Lv${level}`, {
        fontFamily: "Tahoma, sans-serif",
        fontSize: def?.boss ? "13px" : "11px",
        color: def?.boss ? "#ffb347" : "#ffe9c4",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setVisible(setting("monsterNames"));
    this.nameLabel = label;
    this.hpBar = scene.add.graphics();
    this.stunStars = scene.add
      .text(0, -this.size.h - 22, "✦ ✦", { fontSize: "12px", color: "#ffe14d", stroke: "#000", strokeThickness: 2 })
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.mark = scene.add
      .text(0, -this.size.h - 20, "◎", { fontSize: "18px", color: "#ff6a6a", stroke: "#000", strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.root = scene.add.container(0, 0, [this.ring, shadow, this.sprite, label, this.hpBar, this.stunStars, this.mark]);
    this.place();
  }

  setFacing(f: number) {
    this.facing = f;
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

  /** Cold (slowed) monsters turn blue; marked ones show a target sign. */
  setEffects(slowed: boolean, marked: boolean) {
    this.slowed = slowed;
    if (slowed) this.sprite.setTint(0x9fd0ff);
    else this.plain();
    this.mark.setVisible(marked);
  }

  setStunned(on: boolean) {
    this.stunStars.setVisible(on);
  }

  /** Show the attack frames for a moment. */
  attack() {
    this.attackLeft = 320;
  }

  flash() {
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => (this.slowed ? this.sprite.setTint(0x9fd0ff) : this.plain()));
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
    this.animTime += dtMs;
    this.attackLeft = Math.max(0, this.attackLeft - dtMs);
    // columns: idle, walk x4, attack x2
    let col = 0;
    if (this.attackLeft > 0) col = this.attackLeft > 190 ? 5 : 6;
    else if (this.moving) col = 1 + (Math.floor(this.animTime / 110) % 4);
    const frame = this.facing * MONSTER_COLS + col;
    if (frame !== this.frame) {
      this.frame = frame;
      this.sprite.setFrame(frame);
    }
    this.place();
  }

  private place() {
    const p = place(this.x, this.y);
    this.root.setPosition(p.x, p.y);
    this.root.setDepth(p.depth + 1);
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
