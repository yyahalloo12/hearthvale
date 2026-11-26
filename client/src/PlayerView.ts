import Phaser from "phaser";
import { ITEMS } from "../../shared/items";
import { place } from "./iso";
import { PLAYER_LAYERS, PLAYER_SHEET } from "./sprites";

/** Metal colour by tier. */
/** Wood colour of bows and staffs by tier. */
const WOOD_TINT = [0xffffff, 0xc08a58, 0x8fb06a, 0xb9b3c4, 0xd9a0e0, 0xffd23a, 0xff6f6f];
export const TIER_TINT = [0xffffff, 0xd88a4e, 0xc3ccd6, 0x8fd3ff, 0xd9a0e0, 0xffd23a, 0xff6f6f];

const ATTACK_MS = 340;
const WALK_FRAME_MS = 85;
type Layer = (typeof PLAYER_LAYERS)[number];

/**
 * One chibi character on screen. The server owns the real position; this
 * view smoothly follows it.
 */
export class PlayerView {
  readonly root: Phaser.GameObjects.Container;
  private layers = {} as Record<Layer, Phaser.GameObjects.Image>;
  private label: Phaser.GameObjects.Text;
  private bubble?: Phaser.GameObjects.Container;
  private bubbleTimer?: Phaser.Time.TimerEvent;
  private hpBar: Phaser.GameObjects.Graphics;
  private shield: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private mark: Phaser.GameObjects.Text;
  private figure: Phaser.GameObjects.Container;
  private dead = false;

  /** Displayed position in tile units. */
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  moving = false;
  private facing = 0;
  private animTime = 0;
  private attackLeft = 0;
  private frame = -1;

  constructor(private scene: Phaser.Scene, readonly name: string, color: number, x: number, y: number, private isMe: boolean) {
    this.x = this.targetX = x;
    this.y = this.targetY = y;

    const shadow = scene.add.image(0, 0, "c-shadow");
    this.glow = scene.add.image(0, -22, "aura").setTint(0xff5ad2).setScale(1.1, 2.2).setAlpha(0.8).setVisible(false);
    for (const l of PLAYER_LAYERS)
      this.layers[l] = scene.add
        .image(0, 0, `player-${l}`, 0)
        .setOrigin(0.5, PLAYER_SHEET.originY)
        .setScale(PLAYER_SHEET.scale)
        .setVisible(l === "base" || l === "tunic");
    this.layers.tunic.setTint(color);
    this.label = scene.add
      .text(0, -73, name, {
        fontFamily: "Tahoma, sans-serif",
        fontSize: "13px",
        color: isMe ? "#fff3a0" : "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1);

    this.mark = scene.add.text(0, -90, "◎", { fontSize: "18px", color: "#ff6a6a", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5, 1).setVisible(false);
    this.hpBar = scene.add.graphics();
    this.shield = scene.add.image(12, -14, "shield").setVisible(false);
    this.figure = scene.add.container(0, 0, [...PLAYER_LAYERS.map((l) => this.layers[l]), this.shield]);
    this.root = scene.add.container(0, 0, [shadow, this.glow, this.figure, this.label, this.hpBar, this.mark]);
    this.animate(0);
    this.place();
  }

  setFacing(f: number) {
    this.facing = f;
  }

  setHp(hp: number, max: number) {
    this.hpBar.clear();
    const w = 36;
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(-w / 2 - 1, -71, w + 2, 6);
    this.hpBar.fillStyle(hp / max > 0.3 ? 0x5bd15b : 0xe85c5c);
    this.hpBar.fillRect(-w / 2, -70, (w * Math.max(0, hp)) / max, 4);
  }

  /** Show the worn weapon and helmet ("" = none). */
  setGear(weapon: string, helm: string) {
    const w = ITEMS[weapon];
    const tint = (tier?: number) => TIER_TINT[tier ?? 0] ?? 0xffffff;
    this.layers.axe.setVisible(w?.look === "axe").setTint(tint(w?.tier));
    this.layers.sword.setVisible(w?.look === "sword").setTint(tint(w?.tier));
    for (const l of ["bow", "staff"] as const) this.layers[l].setVisible(w?.look === l).setTint(WOOD_TINT[w?.tier ?? 0] ?? 0xffffff);
    const h = ITEMS[helm];
    this.layers.helm.setVisible(h?.look === "helm").setTint(tint(h?.tier));
  }

  /** Faded name and body: logged out but still standing here. */
  setStatus(offline: boolean, shielded: boolean, glowing: boolean, gm = false) {
    this.root.setAlpha(offline ? 0.55 : 1);
    this.label.setText(`${gm ? "★ " : ""}${this.name}${offline ? " (ออฟไลน์)" : ""}`);
    this.figure.setAlpha(this.dead ? 0.7 : shielded ? 0.55 : 1);
    this.glow.setVisible(glowing || this.aura !== null);
    this.glow.setTint(glowing ? 0xff5ad2 : (this.aura ?? 0xffffff));
  }

  /** Colour round the body while a spell protects it. */
  private aura: number | null = null;

  setEffects(blessed: boolean, manaShield: boolean, slowed: boolean, marked: boolean) {
    this.aura = manaShield ? 0x5ab0ff : blessed ? 0xffe27a : null;
    if (slowed) this.layers.base.setTint(0x9fd0ff);
    else this.layers.base.clearTint();
    this.mark.setVisible(marked);
  }

  private friend = false;
  private targeted = false;
  /** Red name while we are attacking this player. */
  setTargeted(on: boolean) {
    this.targeted = on;
    this.label.setColor(on ? "#ff6a6a" : this.isMe ? "#fff3a0" : this.friend ? "#8dff7a" : "#ffffff");
  }

  /** Green name for party members. */
  setFriend(on: boolean) {
    if (this.friend === on) return;
    this.friend = on;
    this.setTargeted(this.targeted);
  }

  /** Body centre in world pixels, for click picking. */
  center() {
    return { x: this.root.x, y: this.root.y - 28 };
  }

  setGuarding(on: boolean) {
    this.shield.setVisible(on && !this.dead);
  }

  setDead(on: boolean) {
    if (on === this.dead) return;
    this.dead = on;
    this.figure.setAlpha(on ? 0.7 : 1);
    if (on) this.shield.setVisible(false);
  }

  /** Quick lunge towards where we face (attack animation). */
  lunge() {
    if (this.dead) return;
    const dirs = [[0, 1], [-1, 0.5], [-1, 0], [-1, -0.5], [0, -1], [1, -0.5], [1, 0], [1, 0.5]];
    const [dx, dy] = dirs[this.facing] ?? [0, 0];
    this.attackLeft = ATTACK_MS;
    this.scene.tweens.add({ targets: this.figure, x: dx * 6, y: dy * 4, duration: 80, yoyo: true });
  }

  /** Point (world pixels) where hit numbers should appear. */
  headPoint() {
    return { x: this.root.x, y: this.root.y - 60 };
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
    this.bubble = this.scene.add.container(0, -92, [bg, t]);
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
    this.animate(dtMs);
    this.place();
  }

  /** Picks the frame for what we are doing and shows it on every layer. */
  private animate(dtMs: number) {
    this.animTime += dtMs;
    this.attackLeft = Math.max(0, this.attackLeft - dtMs);
    const s = PLAYER_SHEET;
    let col: number;
    if (this.dead) col = s.dead;
    else if (this.attackLeft > 0) col = s.attack[Math.min(3, Math.floor((1 - this.attackLeft / ATTACK_MS) * 4))];
    else if (this.moving) col = s.walk[Math.floor(this.animTime / WALK_FRAME_MS) % s.walk.length];
    else col = s.idle[Math.floor(this.animTime / 600) % s.idle.length];
    const frame = this.facing * s.cols + col;
    if (frame === this.frame) return;
    this.frame = frame;
    for (const l of PLAYER_LAYERS) this.layers[l].setFrame(frame);
  }

  private place() {
    const p = place(this.x, this.y);
    this.root.setPosition(p.x, p.y);
    this.root.setDepth(p.depth + 1);
  }

  destroy() {
    this.bubbleTimer?.remove();
    this.root.destroy();
  }
}
