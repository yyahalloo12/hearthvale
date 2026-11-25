import Phaser from "phaser";
import { toScreen } from "./iso";

/** Facing 3,4,5 look away from the camera (we see the back of the head). */
const BACK_FACING = new Set([3, 4, 5]);
/** Sideways eye offset in pixels for each facing (negative = screen left). */
const EYE_SHIFT = [0, -4, -6, 0, 0, 0, 6, 4];

/**
 * One chibi character on screen. The server owns the real position; this
 * view smoothly follows it.
 */
export class PlayerView {
  readonly root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private head: Phaser.GameObjects.Container;
  private hair: Phaser.GameObjects.Image;
  private hairBack: Phaser.GameObjects.Image;
  private eyes: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private bubble?: Phaser.GameObjects.Container;
  private bubbleTimer?: Phaser.Time.TimerEvent;
  private hpBar: Phaser.GameObjects.Graphics;
  private shield: Phaser.GameObjects.Image;
  private figure: Phaser.GameObjects.Container;
  private dead = false;

  /** Displayed position in tile units. */
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  moving = false;
  private facing = -1;
  private walkTime = 0;

  constructor(private scene: Phaser.Scene, name: string, color: number, x: number, y: number, isMe: boolean) {
    this.x = this.targetX = x;
    this.y = this.targetY = y;

    const shadow = scene.add.image(0, 0, "c-shadow");
    this.body = scene.add.image(0, -10, "c-body").setTint(color);
    this.hairBack = scene.add.image(0, 0, "c-hair-back").setVisible(false);
    const face = scene.add.image(0, 0, "c-head");
    this.eyes = scene.add.graphics();
    this.hair = scene.add.image(0, -9, "c-hair");
    this.head = scene.add.container(0, -36, [face, this.eyes, this.hair, this.hairBack]);
    this.label = scene.add
      .text(0, -66, name, {
        fontFamily: "Tahoma, sans-serif",
        fontSize: "13px",
        color: isMe ? "#fff3a0" : "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1);

    this.hpBar = scene.add.graphics();
    this.shield = scene.add.image(12, -14, "shield").setVisible(false);
    this.figure = scene.add.container(0, 0, [this.body, this.head, this.shield]);
    this.root = scene.add.container(0, 0, [shadow, this.figure, this.label, this.hpBar]);
    this.setFacing(0);
    this.place();
  }

  setFacing(f: number) {
    if (f === this.facing) return;
    this.facing = f;
    const back = BACK_FACING.has(f);
    this.hairBack.setVisible(back);
    this.eyes.clear();
    if (back) return;
    const s = EYE_SHIFT[f] ?? 0;
    const twoEyes = Math.abs(s) < 6;
    this.eyes.fillStyle(0x2b1a10);
    if (twoEyes) {
      this.eyes.fillEllipse(-5 + s, 2, 4, 6);
      this.eyes.fillEllipse(5 + s, 2, 4, 6);
    } else {
      this.eyes.fillEllipse(s, 2, 4, 6);
    }
    this.eyes.fillStyle(0xff9b9b, 0.6);
    this.eyes.fillCircle(-9 + s, 7, 3);
    this.eyes.fillCircle(9 + s, 7, 3);
  }

  setHp(hp: number, max: number) {
    this.hpBar.clear();
    const w = 36;
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(-w / 2 - 1, -63, w + 2, 6);
    this.hpBar.fillStyle(hp / max > 0.3 ? 0x5bd15b : 0xe85c5c);
    this.hpBar.fillRect(-w / 2, -62, (w * Math.max(0, hp)) / max, 4);
  }

  setGuarding(on: boolean) {
    this.shield.setVisible(on && !this.dead);
  }

  setDead(on: boolean) {
    if (on === this.dead) return;
    this.dead = on;
    this.figure.setAngle(on ? -90 : 0).setPosition(on ? -14 : 0, on ? -6 : 0);
    this.figure.setAlpha(on ? 0.7 : 1);
    if (on) this.shield.setVisible(false);
  }

  /** Quick lunge towards where we face (attack animation). */
  lunge() {
    if (this.dead) return;
    const dirs = [[0, 1], [-1, 0.5], [-1, 0], [-1, -0.5], [0, -1], [1, -0.5], [1, 0], [1, 0.5]];
    const [dx, dy] = dirs[this.facing] ?? [0, 0];
    this.scene.tweens.add({ targets: this.figure, x: dx * 7, y: dy * 5, duration: 70, yoyo: true });
  }

  /** Point (world pixels) where hit numbers should appear. */
  headPoint() {
    return { x: this.root.x, y: this.root.y - 56 };
  }

  say(text: string) {
    this.bubble?.destroy();
    this.bubbleTimer?.remove();
    const t = this.scene.add
      .text(0, 0, text, {
        fontFamily: "Tahoma, sans-serif",
        fontSize: "13px",
        color: "#3b2a1a",
        wordWrap: { width: 180, useAdvancedWrap: true },
        align: "center",
      })
      .setOrigin(0.5, 1);
    const w = t.width + 14;
    const h = t.height + 8;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0xfffaf0, 0.95);
    bg.lineStyle(2, 0x6b4226);
    bg.fillRoundedRect(-w / 2, -h - 2, w, h, 6);
    bg.strokeRoundedRect(-w / 2, -h - 2, w, h, 6);
    bg.fillTriangle(-5, -2, 5, -2, 0, 5);
    t.setPosition(0, -6);
    this.bubble = this.scene.add.container(0, -84, [bg, t]);
    this.root.add(this.bubble);
    this.bubbleTimer = this.scene.time.delayedCall(5000, () => {
      this.bubble?.destroy();
      this.bubble = undefined;
    });
  }

  update(dtMs: number) {
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
    // little hop while walking
    if (this.moving) this.walkTime += dtMs;
    else this.walkTime = 0;
    const bob = this.moving && !this.dead ? Math.abs(Math.sin(this.walkTime / 90)) * 3 : 0;
    this.body.y = -10 - bob;
    this.head.y = -36 - bob;
    this.place();
  }

  private place() {
    const p = toScreen(this.x, this.y);
    this.root.setPosition(p.x, p.y);
    this.root.setDepth(p.y + 1);
  }

  destroy() {
    this.bubbleTimer?.remove();
    this.root.destroy();
  }
}
