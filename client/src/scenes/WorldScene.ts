import { getStateCallbacks, Room } from "colyseus.js";
import Phaser from "phaser";
import { TILE_H } from "../../../shared/constants";
import { buildBrindleVillage, GameMap, isHouseAnchor, isWalkable, Prop } from "../../../shared/map";
import { ChatLine, CooldownEvent, HitEvent, Msg } from "../../../shared/protocol";
import { SKILLS } from "../../../shared/stats";
import { addChatLine } from "../chat";
import { initHud, setOnline, skillForKey, startCooldown, updateMe } from "../hud";
import { toScreen, toTile } from "../iso";
import { MonsterView } from "../MonsterView";
import { makeMonsterTextures } from "../monsterTextures";
import { PlayerView } from "../PlayerView";
import { groundKey, makeTextures } from "../textures";

const PROP_TEXTURE: Partial<Record<Prop, string>> = {
  [Prop.Tree]: "p-tree",
  [Prop.Well]: "p-well",
  [Prop.Fence]: "p-fence",
  [Prop.Rock]: "p-rock",
  [Prop.Bush]: "p-bush",
};

export class WorldScene extends Phaser.Scene {
  private room!: Room;
  private map!: GameMap;
  private views = new Map<string, PlayerView>();
  private monsters = new Map<string, MonsterView>();
  private marker!: Phaser.GameObjects.Image;
  private dragStart?: { x: number; y: number; scrollX: number; scrollY: number };
  private targetId: string | null = null;
  private me: any;

  constructor() {
    super("world");
  }

  init(data: { room: Room }) {
    this.room = data.room;
  }

  create() {
    makeTextures(this);
    makeMonsterTextures(this);
    this.map = buildBrindleVillage();
    this.drawMap();

    this.marker = this.add.image(0, 0, "click-marker").setVisible(false).setDepth(-1);
    this.cameras.main.setBackgroundColor("#2c5a34");
    this.cameras.main.setRoundPixels(true);

    initHud({
      useSkill: (id) => this.useSkill(id),
      learnSkill: (id) => this.room.send(Msg.LearnSkill, { skill: id }),
      changeJob: () => this.room.send(Msg.ChangeJob),
      respawn: () => this.room.send(Msg.Respawn),
    });
    this.bindRoom();
    this.bindInput();
    // handy in the browser console and for automated tests; the server checks everything anyway
    (window as any).__hv = { scene: this, room: this.room };
  }

  private drawMap() {
    const { map } = this;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const p = toScreen(x, y);
        this.add.image(p.x, p.y, groundKey(map.tiles[y][x], x, y)).setDepth(-10000);
        const prop = map.props[y][x];
        if (prop === Prop.House) {
          if (isHouseAnchor(map, x, y)) {
            // bottom vertex of the 2x2 footprint
            const b = toScreen(x + 1.5, y + 1.5);
            this.add.image(b.x, b.y, "p-house").setOrigin(0.5, 1).setDepth(b.y - TILE_H / 2);
          }
          continue;
        }
        const key = PROP_TEXTURE[prop];
        if (key) {
          this.add
            .image(p.x, p.y + TILE_H / 2 - 4, key)
            .setOrigin(0.5, 1)
            .setDepth(p.y);
        }
      }
    }
  }

  private bindRoom() {
    const $ = getStateCallbacks(this.room);
    const state = this.room.state as any;

    $(state).players.onAdd((player: any, id: string) => {
      const isMe = id === this.room.sessionId;
      const view = new PlayerView(this, player.name, player.color, player.x, player.y, isMe);
      view.setFacing(player.facing);
      view.setHp(player.hp, player.maxHp);
      view.setDead(player.dead);
      this.views.set(id, view);
      if (isMe) {
        this.me = player;
        this.cameras.main.startFollow(view.root, true, 0.15, 0.15);
        $(player).skills.onAdd(() => this.refreshMe());
        $(player).skills.onChange(() => this.refreshMe());
      }
      $(player).onChange(() => {
        view.targetX = player.x;
        view.targetY = player.y;
        view.moving = player.moving;
        view.setFacing(player.facing);
        view.setHp(player.hp, player.maxHp);
        view.setDead(player.dead);
        view.setGuarding(player.guarding);
        if (isMe) {
          if (!player.moving) this.marker.setVisible(false);
          this.refreshMe();
        }
      });
      if (isMe) this.refreshMe();
      setOnline(this.views.size);
    });

    $(state).players.onRemove((_player: any, id: string) => {
      this.views.get(id)?.destroy();
      this.views.delete(id);
      setOnline(this.views.size);
    });

    $(state).monsters.onAdd((m: any, id: string) => {
      const view = new MonsterView(this, m.kind, m.level, m.x, m.y);
      view.setFacing(m.facing);
      view.setHp(m.hp, m.maxHp);
      this.monsters.set(id, view);
      $(m).onChange(() => {
        view.targetX = m.x;
        view.targetY = m.y;
        view.moving = m.moving;
        view.setFacing(m.facing);
        view.setHp(m.hp, m.maxHp);
        view.setStunned(m.stunned);
      });
    });

    $(state).monsters.onRemove((_m: any, id: string) => {
      const view = this.monsters.get(id);
      this.monsters.delete(id);
      if (this.targetId === id) this.targetId = null;
      if (!view) return;
      if (view.dying) return; // already fading (we saw the killing blow)
      view.die();
    });

    this.room.onMessage(Msg.ChatLine, (line: ChatLine) => {
      addChatLine(line);
      if (line.from) this.views.get(line.from)?.say(line.text);
    });
    this.room.onMessage(Msg.Notice, (n: { text: string }) => addChatLine({ from: "", name: "", text: n.text }, "notice"));
    this.room.onMessage(Msg.Hit, (h: HitEvent) => this.showHit(h));
    this.room.onMessage(Msg.Cooldown, (c: CooldownEvent) => startCooldown(c.skill, c.ms));
    this.room.onMessage(Msg.ExpGain, (e: { amount: number }) => {
      const v = this.views.get(this.room.sessionId);
      if (v) this.floatText(v.headPoint().x, v.headPoint().y - 14, `+${e.amount} EXP`, "#d7b6ff", 13);
    });
    this.room.onMessage(Msg.LevelUp, (e: { id: string; level: number }) => {
      const v = this.views.get(e.id);
      if (!v) return;
      this.levelUpEffect(v);
      const name = this.room.state.players.get(e.id)?.name ?? "";
      addChatLine({ from: "", name: "", text: `${name} เลเวลอัปเป็น ${e.level}!`, system: true });
    });

    this.room.onLeave((code) => {
      if (code !== 1000) addChatLine({ from: "", name: "", text: "หลุดการเชื่อมต่อกับเซิร์ฟเวอร์ ลองรีเฟรชหน้านี้" }, "notice");
    });
  }

  private refreshMe() {
    const p = this.me;
    if (!p) return;
    updateMe({
      name: p.name,
      level: p.level,
      exp: p.exp,
      job: p.job,
      hp: p.hp,
      maxHp: p.maxHp,
      dead: p.dead,
      skills: new Map(p.skills.entries()),
    });
  }

  // ---- effects --------------------------------------------------------------

  private showHit(h: HitEvent) {
    const attackerPlayer = this.views.get(h.from);
    attackerPlayer?.lunge();
    const myId = this.room.sessionId;
    const targetMonster = this.monsters.get(h.to);
    if (targetMonster) {
      targetMonster.flash();
      const p = targetMonster.head();
      const mine = h.from === myId;
      const skillName = h.skill ? SKILLS[h.skill]?.name : "";
      this.floatText(
        p.x,
        p.y,
        `${skillName ? skillName + " " : ""}${h.dmg}${h.crit ? "!" : ""}`,
        h.crit ? "#ffa53a" : mine ? "#ffffff" : "#d8d8d8",
        h.crit || skillName ? 18 : 15,
      );
      if (h.killed) {
        this.monsters.delete(h.to);
        if (this.targetId === h.to) this.targetId = null;
        targetMonster.die();
      }
      return;
    }
    const targetPlayer = this.views.get(h.to);
    if (targetPlayer) {
      const p = targetPlayer.headPoint();
      this.floatText(p.x, p.y, `-${h.dmg}`, h.to === myId ? "#ff5a5a" : "#ff9b9b", h.crit ? 18 : 14);
    }
  }

  private floatText(x: number, y: number, text: string, color: string, size: number) {
    const t = this.add
      .text(x + Phaser.Math.Between(-8, 8), y, text, {
        fontFamily: "Tahoma, sans-serif",
        fontSize: `${size}px`,
        fontStyle: "bold",
        color,
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(100000);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  private levelUpEffect(v: PlayerView) {
    const p = v.headPoint();
    this.floatText(p.x, p.y - 20, "LEVEL UP!", "#ffd23a", 22);
    for (let i = 0; i < 14; i++) {
      const s = this.add.image(v.root.x, v.root.y - 20, "sparkle").setTint(0xffd23a).setDepth(99999);
      const a = (i / 14) * Math.PI * 2;
      this.tweens.add({
        targets: s,
        x: v.root.x + Math.cos(a) * 40,
        y: v.root.y - 20 + Math.sin(a) * 26 - 20,
        alpha: 0,
        scale: 0.3,
        duration: 800,
        onComplete: () => s.destroy(),
      });
    }
  }

  // ---- input ----------------------------------------------------------------

  private setTarget(id: string | null) {
    if (this.targetId) this.monsters.get(this.targetId)?.setTargeted(false);
    this.targetId = id;
    if (id) this.monsters.get(id)?.setTargeted(true);
  }

  /** Screen position of a monster (for tests / debugging). */
  monsterScreenPos(id: string) {
    const m = this.monsters.get(id);
    if (!m) return null;
    const c = m.center();
    const cam = this.cameras.main;
    return { x: c.x - cam.worldView.x, y: c.y - cam.worldView.y };
  }

  private pickMonster(wx: number, wy: number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const [id, m] of this.monsters) {
      if (m.dying) continue;
      const c = m.center();
      const d = Math.hypot((wx - c.x) / m.size.r, (wy - c.y) / (m.size.h / 2));
      if (d < 1 && d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private useSkill(id: string) {
    if (!this.me || this.me.dead) return;
    const def = SKILLS[id];
    if (!def) return;
    if (def.range > 0 && !this.targetId) {
      addChatLine({ from: "", name: "", text: "เลือกเป้าหมายก่อน (คลิกที่มอนสเตอร์)" }, "notice");
      return;
    }
    this.room.send(Msg.Skill, { skill: id, target: this.targetId ?? undefined });
  }

  private bindInput() {
    // Left click: walk or attack. Right drag: look around (camera snaps back when you act).
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        const cam = this.cameras.main;
        cam.stopFollow();
        this.dragStart = { x: pointer.x, y: pointer.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
        return;
      }
      if (!this.me || this.me.dead) return;
      const me = this.views.get(this.room.sessionId);
      if (me) this.cameras.main.startFollow(me.root, true, 0.15, 0.15);

      const monsterId = this.pickMonster(pointer.worldX, pointer.worldY);
      if (monsterId) {
        this.setTarget(monsterId);
        this.room.send(Msg.Attack, { id: monsterId });
        this.marker.setVisible(false);
        return;
      }
      const t = toTile(pointer.worldX, pointer.worldY);
      if (!isWalkable(this.map, t.x, t.y)) return;
      this.setTarget(null);
      this.room.send(Msg.Move, { x: t.x, y: t.y });
      const p = toScreen(t.x, t.y);
      this.marker.setPosition(p.x, p.y).setVisible(true).setAlpha(1);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart || !pointer.rightButtonDown()) return;
      const cam = this.cameras.main;
      cam.scrollX = this.dragStart.scrollX - (pointer.x - this.dragStart.x);
      cam.scrollY = this.dragStart.scrollY - (pointer.y - this.dragStart.y);
    });
    this.input.on("pointerup", () => (this.dragStart = undefined));

    window.addEventListener("keydown", (e) => {
      if (document.activeElement?.tagName === "INPUT") return;
      const skill = skillForKey(e.key);
      if (skill) this.useSkill(skill);
    });
  }

  update(time: number, delta: number) {
    for (const v of this.views.values()) v.update(delta);
    for (const m of this.monsters.values()) m.update(delta);
    if (this.marker.visible) this.marker.setAlpha(0.6 + Math.sin(time / 120) * 0.4);
  }
}
