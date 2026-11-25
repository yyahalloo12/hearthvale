import { getStateCallbacks, Room } from "colyseus.js";
import Phaser from "phaser";
import { TILE_H } from "../../../shared/constants";
import { GLOW_AT } from "../../../shared/hollow";
import { findStation, ITEMS, resourceAt, STATION_RANGE, stationAt } from "../../../shared/items";
import { BoardData, STALL_RANGE, StallData } from "../../../shared/market";
import { GameMap, isHouseAnchor, isWalkable, Prop, ZoneId } from "../../../shared/map";
import { buildZone, ZONE_NAMES } from "../../../shared/zones";
import { ChatLine, CooldownEvent, GatheringEvent, HitEvent, LootEvent, Msg, OpenStationEvent, PrivateData, TravelEvent } from "../../../shared/protocol";
import { SKILLS } from "../../../shared/stats";
import { addChatLine } from "../chat";
import { askEnterHollow, initHud, setCorruption, setOnline, setZone, skillForKey, startCooldown, updateMe } from "../hud";
import { closeStation, initInventory, openStation, openStationKind, setInventory, setItemLevel, showGathering } from "../inventory";
import { toScreen, toTile } from "../iso";
import { closeMarket, initMarket, marketMode, openBoard, setBoard, setMarketInventory, setStall, visitedStall } from "../market";
import { drawMinimap, setMinimap } from "../minimap";
import { MonsterView } from "../MonsterView";
import { makeMonsterTextures } from "../monsterTextures";
import { initPassiveTree, setTreeCharacter, setTreePrivate } from "../passiveTree";
import { PlayerView, TIER_TINT } from "../PlayerView";
import { loadSprites, PLAYER_SHEET, SCENERY_SCALE } from "../sprites";
import { groundDetail, groundKey, houseFrame, makeTextures, PROP_SHADOW, propFrame } from "../textures";

const STATION_LABEL = { smith: "ช่างตีเหล็ก", storage: "คลังเก็บของ", portal: "ทางเข้า Hollow", board: "กระดานประมูล" } as const;

export class WorldScene extends Phaser.Scene {
  private room!: Room;
  private zone: ZoneId = "brindle";
  private travel!: (e: TravelEvent) => void;
  private bundles = new Map<string, Phaser.GameObjects.Container>();
  private gates: Phaser.GameObjects.GameObject[] = [];
  private stalls = new Map<string, { root: Phaser.GameObjects.Container; keeper: Phaser.GameObjects.Container; owner: string; x: number; y: number }>();
  private mapTimer = 0;
  private travelling = false;
  private onKey?: (e: KeyboardEvent) => void;
  private map!: GameMap;
  private views = new Map<string, PlayerView>();
  private monsters = new Map<string, MonsterView>();
  private marker!: Phaser.GameObjects.Image;
  private dragStart?: { x: number; y: number; scrollX: number; scrollY: number };
  private targetId: string | null = null;
  private me: any;
  private gold: number | null = null;
  /** rocks, trees and stations that can be clicked, by "x,y" */
  private usable = new Map<string, { x: number; y: number; img: Phaser.GameObjects.Image }>();

  constructor() {
    super(""); // the key comes from scene.add(), so each map visit can have its own
  }

  init(data: { room: Room; zone: ZoneId; travel: (e: TravelEvent) => void }) {
    this.room = data.room;
    this.zone = data.zone;
    this.travel = data.travel;
  }

  preload() {
    loadSprites(this);
  }

  create() {
    makeTextures(this);
    makeMonsterTextures(this);
    this.map = buildZone(this.zone);
    this.drawMap();

    this.marker = this.add.image(0, 0, "click-marker").setVisible(false).setDepth(-1);
    this.cameras.main.setBackgroundColor(this.map.pvp ? "#211d2a" : this.zone === "mossfen" ? "#1f4a36" : "#2c5a34");
    setMinimap(this.map);
    this.cameras.main.setRoundPixels(true);

    initHud({
      useSkill: (id) => this.useSkill(id),
      learnSkill: (id) => this.room.send(Msg.LearnSkill, { skill: id }),
      changeJob: () => this.room.send(Msg.ChangeJob),
      respawn: () => this.room.send(Msg.Respawn),
    });
    setZone(ZONE_NAMES[this.zone], this.map.pvp);
    initPassiveTree({
      learn: (id) => this.room.send(Msg.LearnPassive, { id }),
      refund: (id) => this.room.send(Msg.RefundPassive, { id }),
    });
    initInventory({
      equip: (uid) => this.room.send(Msg.Equip, { uid }),
      unequip: (slot) => this.room.send(Msg.Unequip, { slot }),
      craft: (item, crystal) => this.room.send(Msg.Craft, { item, crystal }),
      buy: (item) => this.room.send(Msg.Buy, { item }),
      sell: (uid) => this.room.send(Msg.Sell, { uid }),
      deposit: (uid) => this.room.send(Msg.Deposit, { uid }),
      withdraw: (uid) => this.room.send(Msg.Withdraw, { uid }),
    });
    initMarket({
      refresh: () => this.room.send(Msg.Board),
      sell: (uid, qty, price) => this.room.send(Msg.BoardSell, { uid, qty, price }),
      buy: (id, qty) => this.room.send(Msg.BoardBuy, { id, qty }),
      cancel: (id) => this.room.send(Msg.BoardCancel, { id }),
      order: (item, qty, price) => this.room.send(Msg.OrderPlace, { item, qty, price }),
      fill: (id, uid, qty) => this.room.send(Msg.OrderFill, { id, uid, qty }),
      claim: (id) => this.room.send(Msg.Claim, { id }),
      stallOpen: (title, items) => this.room.send(Msg.StallOpen, { title, items }),
      stallClose: () => this.room.send(Msg.StallClose),
      stallBuy: (id, uid, qty) => this.room.send(Msg.StallBuy, { id, uid, qty }),
    });
    this.bindRoom();
    this.bindInput();
    this.room.send(Msg.Sync);
    // handy in the browser console and for automated tests; the server checks everything anyway
    (window as any).__hv = { scene: this, room: this.room };
  }

  /** A scenery frame with its foot on this point (the atlas knows where that is). */
  private scenery(x: number, y: number, frame: string) {
    return this.add.image(x, y, "scenery", frame).setScale(SCENERY_SCALE);
  }

  private drawMap() {
    const { map } = this;
    for (const e of map.exits) {
      const p = toScreen(e.x, e.y);
      this.scenery(p.x, p.y, "exit").setDepth(p.y - 1);
      this.add
        .text(p.x, p.y - 66, `ไป${e.label}`, { fontFamily: "Tahoma, sans-serif", fontSize: "12px", color: "#d8ffd0", stroke: "#000", strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setDepth(p.y + 1);
    }
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const p = toScreen(x, y);
        this.add.image(p.x, p.y, groundKey(map.tiles[y][x], x, y, map)).setDepth(-10000);
        const detail = groundDetail(map.tiles[y][x], x, y);
        if (detail) this.scenery(p.x, p.y, detail).setDepth(-9990);
        const prop = map.props[y][x];
        if (prop === Prop.House) {
          if (isHouseAnchor(map, x, y)) {
            // centre of the 2x2 footprint, sorted by its front corner
            const c = toScreen(x + 0.5, y + 0.5);
            this.scenery(c.x, c.y, houseFrame(x, y)).setDepth(toScreen(x + 1.5, y + 1.5).y - TILE_H / 2);
          }
          continue;
        }
        const res = resourceAt(map, x, y);
        const frame = propFrame(map, x, y, res?.item);
        if (frame) {
          const shadow = PROP_SHADOW[prop];
          if (shadow) this.add.image(p.x, p.y + 2, "c-shadow").setScale(shadow).setDepth(-9980);
          const img = this.scenery(p.x, p.y, frame).setDepth(p.y);
          const station = stationAt(map, x, y);
          if (res || station) this.usable.set(`${x},${y}`, { x, y, img });
          if (station)
            this.add
              .text(p.x, p.y - (station === "portal" ? 80 : 40), STATION_LABEL[station], {
                fontFamily: "Tahoma, sans-serif",
                fontSize: "12px",
                color: "#ffe9a8",
                stroke: "#000000",
                strokeThickness: 3,
              })
              .setOrigin(0.5, 1)
              .setDepth(p.y + 1);
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
      view.setGear(player.weapon, player.helm);
      view.setStatus(player.offline, player.shielded, player.corruption >= GLOW_AT, player.gm);
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
        view.setGear(player.weapon, player.helm);
        view.setStatus(player.offline, player.shielded, player.corruption >= GLOW_AT, player.gm);
        if (this.targetId === id && player.dead) this.setTarget(null);
        if (isMe) {
          if (!player.moving) this.marker.setVisible(false);
          this.refreshMe();
        }
      });
      if (isMe) this.refreshMe();
      setOnline(this.views.size);
      this.showKeepers();
    });

    $(state).players.onRemove((_player: any, id: string) => {
      if (this.targetId === id) this.targetId = null;
      this.views.get(id)?.destroy();
      this.views.delete(id);
      setOnline(this.views.size);
      this.showKeepers();
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

    $(state).depleted.onAdd((_v: boolean, key: string) => this.usable.get(key)?.img.setAlpha(0.35));
    $(state).depleted.onRemove((_v: boolean, key: string) => this.usable.get(key)?.img.setAlpha(1));

    $(state).gates.onAdd((gate: any) => this.addGate(gate.x, gate.y));
    $(state).gates.onRemove(() => this.redrawGates());
    $(state).bundles.onAdd((b: any, id: string) => {
      const p = toScreen(b.x, b.y);
      const img = this.scenery(0, 0, "bundle");
      const label = this.add
        .text(0, -36, `ห่อของ ${b.owner}`, { fontFamily: "Tahoma, sans-serif", fontSize: "12px", color: "#ffe9a8", stroke: "#000", strokeThickness: 3 })
        .setOrigin(0.5, 1);
      this.bundles.set(id, this.add.container(p.x, p.y, [img, label]).setDepth(p.y));
    });
    $(state).bundles.onRemove((_b: any, id: string) => {
      this.bundles.get(id)?.destroy();
      this.bundles.delete(id);
    });

    $(state).stalls.onAdd((s: any, id: string) => this.addStall(id, s));
    $(state).stalls.onRemove((_s: any, id: string) => {
      this.stalls.get(id)?.root.destroy();
      this.stalls.delete(id);
      if (visitedStall() === id) setStall(null);
    });
    this.room.onMessage(Msg.BoardData, (d: BoardData) => setBoard(d));
    this.room.onMessage(Msg.StallData, (d: StallData | null) => setStall(d));

    this.room.onMessage(Msg.Travel, (e: TravelEvent) => {
      this.travelling = true;
      this.travel(e);
    });
    this.room.onMessage(Msg.OpenStation, (e: OpenStationEvent) => {
      if (e.kind === "portal") askEnterHollow(() => this.room.send(Msg.EnterHollow));
      else if (e.kind === "board") openBoard();
      else openStation(e.kind);
    });
    this.room.onMessage(Msg.Gathering, (e: GatheringEvent) => showGathering(e.ms, e.name));
    this.room.onMessage(Msg.Loot, (e: LootEvent) => {
      const v = this.views.get(this.room.sessionId);
      if (!v) return;
      e.items.forEach((it, i) =>
        this.floatText(v.headPoint().x, v.headPoint().y - 46 - i * 16, `+${it.qty} ${ITEMS[it.id]?.name ?? it.id}`, "#b8f0b0", 13),
      );
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
    this.room.onMessage(Msg.Private, (d: PrivateData) => {
      const gained = this.gold === null ? 0 : d.gold - this.gold;
      this.gold = d.gold;
      setTreePrivate(d.gold, d.nodes);
      setInventory(d.inv, d.gold);
      setMarketInventory(d.inv, d.gold);
      const v = this.views.get(this.room.sessionId);
      if (gained > 0 && v) this.floatText(v.headPoint().x, v.headPoint().y - 30, `+${gained} เหรียญ`, "#ffe08a", 13);
    });
    this.room.onMessage(Msg.LevelUp, (e: { id: string; level: number }) => {
      const v = this.views.get(e.id);
      if (!v) return;
      this.levelUpEffect(v);
      const name = this.room.state.players.get(e.id)?.name ?? "";
      addChatLine({ from: "", name: "", text: `${name} เลเวลอัปเป็น ${e.level}!`, system: true });
    });

    this.room.onLeave((code) => {
      if (code !== 1000 && !this.travelling) addChatLine({ from: "", name: "", text: "หลุดการเชื่อมต่อกับเซิร์ฟเวอร์ ลองรีเฟรชหน้านี้" }, "notice");
    });
  }

  /** A stall with its keeper; the keeper is drawn here only while the owner is away. */
  private addStall(id: string, s: any) {
    const p = toScreen(s.x, s.y);
    const layer = (l: string) => this.add.image(0, 0, `player-${l}`, 0).setOrigin(0.5, PLAYER_SHEET.originY).setScale(PLAYER_SHEET.scale);
    const parts = [layer("base"), layer("tunic").setTint(s.color)];
    const helm = ITEMS[s.helm];
    if (helm) parts.push(layer("helm").setTint(TIER_TINT[helm.tier] ?? 0xffffff));
    const keeper = this.add.container(0, 0, parts).setAlpha(0.85);
    const stand = this.scenery(0, 0, `stall${(s.x + s.y) % 3}`);
    const text = (y: number, t: string, color: string, size: number) =>
      this.add.text(0, y, t, { fontFamily: "Tahoma, sans-serif", fontSize: `${size}px`, color, stroke: "#000", strokeThickness: 3 }).setOrigin(0.5, 1);
    const root = this.add.container(p.x, p.y, [keeper, stand, text(-84, s.title, "#ffe9a8", 13), text(-100, s.owner, "#ffffff", 11)]);
    root.setDepth(p.y + 2);
    this.stalls.set(id, { root, keeper, owner: s.owner, x: s.x, y: s.y });
    this.showKeepers();
  }

  private showKeepers() {
    const here = new Set([...this.views.values()].map((v) => v.name));
    for (const s of this.stalls.values()) s.keeper.setVisible(!here.has(s.owner));
  }

  private pickStall(wx: number, wy: number): string | null {
    for (const [id, s] of this.stalls) if (Math.abs(wx - s.root.x) < 30 && wy < s.root.y + 22 && wy > s.root.y - 80) return id;
    return null;
  }

  private addGate(x: number, y: number) {
    const p = toScreen(x, y);
    const img = this.scenery(p.x, p.y, "gate").setDepth(p.y - 1);
    const label = this.add
      .text(p.x, p.y - 68, "ประตูทางออก", { fontFamily: "Tahoma, sans-serif", fontSize: "13px", color: "#ffd23a", stroke: "#000", strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(p.y);
    this.tweens.add({ targets: img, alpha: 0.65, duration: 900, yoyo: true, repeat: -1 });
    this.gates.push(img, label);
  }

  private redrawGates() {
    this.gates.forEach((g) => g.destroy());
    this.gates = [];
    (this.room.state as any).gates.forEach((g: any) => this.addGate(g.x, g.y));
  }

  private refreshMe() {
    const p = this.me;
    if (!p) return;
    setTreeCharacter(p.level, p.job);
    setItemLevel(p.level);
    const mode = marketMode();
    if (mode === "board" || mode === "stall") {
      const at = mode === "board" ? findStation(this.map, "board") : this.stalls.get(visitedStall() ?? "");
      if (p.dead || !at || Math.hypot(p.x - at.x, p.y - at.y) > (mode === "board" ? STATION_RANGE : STALL_RANGE)) closeMarket();
    }
    const kind = openStationKind();
    if (kind) {
      const at = findStation(this.map, kind);
      if (p.dead || !at || Math.hypot(p.x - at.x, p.y - at.y) > STATION_RANGE) closeStation();
    }
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
    this.monsters.get(h.from)?.attack();
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
      if (h.miss) {
        this.floatText(p.x, p.y, "หลบ!", "#9fe8ff", 14);
        return;
      }
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
    if (this.targetId) (this.monsters.get(this.targetId) ?? this.views.get(this.targetId))?.setTargeted(false);
    this.targetId = id;
    if (id) (this.monsters.get(id) ?? this.views.get(id))?.setTargeted(true);
  }

  /** Screen position of a monster (for tests / debugging). */
  monsterScreenPos(id: string) {
    const m = this.monsters.get(id);
    if (!m) return null;
    const c = m.center();
    const cam = this.cameras.main;
    return { x: c.x - cam.worldView.x, y: c.y - cam.worldView.y };
  }

  /** The rock, tree or station under the pointer (only the lower part of a tree, so you can walk behind it). */
  private pickUsable(wx: number, wy: number): { x: number; y: number } | null {
    let best: { x: number; y: number; img: Phaser.GameObjects.Image } | null = null;
    for (const u of this.usable.values()) {
      const { img } = u;
      const h = Math.min(img.displayHeight, 56);
      if (Math.abs(wx - img.x) > Math.min(img.displayWidth, 46) / 2 || wy > img.y + 12 || wy < img.y - h) continue;
      if (!best || img.depth > best.img.depth) best = u;
    }
    return best;
  }

  /** Another player under the pointer (only where players can fight). */
  private pickPlayer(wx: number, wy: number): string | null {
    if (!this.map.pvp) return null;
    for (const [id, v] of this.views) {
      if (id === this.room.sessionId || (this.room.state as any).players.get(id)?.dead) continue;
      const c = v.center();
      if (Math.hypot((wx - c.x) / 18, (wy - c.y) / 30) < 1) return id;
    }
    return null;
  }

  private pickBundle(wx: number, wy: number): string | null {
    for (const [id, b] of this.bundles) if (Math.abs(wx - b.x) < 20 && wy < b.y + 10 && wy > b.y - 32) return id;
    return null;
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

      const stall = this.pickStall(pointer.worldX, pointer.worldY);
      if (stall) {
        this.setTarget(null);
        this.room.send(Msg.StallVisit, { id: stall });
        return;
      }
      const bundle = this.pickBundle(pointer.worldX, pointer.worldY);
      if (bundle) {
        this.setTarget(null);
        this.room.send(Msg.LootBundle, { id: bundle });
        return;
      }
      const monsterId = this.pickMonster(pointer.worldX, pointer.worldY) ?? this.pickPlayer(pointer.worldX, pointer.worldY);
      if (monsterId) {
        this.setTarget(monsterId);
        this.room.send(Msg.Attack, { id: monsterId });
        this.marker.setVisible(false);
        return;
      }
      const usable = this.pickUsable(pointer.worldX, pointer.worldY);
      if (usable) {
        this.setTarget(null);
        this.room.send(Msg.Interact, { x: usable.x, y: usable.y });
        const at = toScreen(usable.x, usable.y);
        this.marker.setPosition(at.x, at.y).setVisible(true).setAlpha(1);
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

    this.onKey = (e) => {
      if (/^(INPUT|SELECT)$/.test(document.activeElement?.tagName ?? "")) return;
      const skill = skillForKey(e.key);
      if (skill) this.useSkill(skill);
    };
    window.addEventListener("keydown", this.onKey);
    const off = () => this.onKey && window.removeEventListener("keydown", this.onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    this.events.once(Phaser.Scenes.Events.DESTROY, off);
  }

  update(time: number, delta: number) {
    for (const v of this.views.values()) v.update(delta);
    for (const m of this.monsters.values()) m.update(delta);
    if (time - this.mapTimer > 200) {
      this.mapTimer = time;
      drawMinimap(this.room.state, this.room.sessionId);
      if (this.map.pvp && this.me) setCorruption(this.me.corruption, (this.room.state as any).gatesUntil);
    }
    if (this.marker.visible) this.marker.setAlpha(0.6 + Math.sin(time / 120) * 0.4);
  }
}
