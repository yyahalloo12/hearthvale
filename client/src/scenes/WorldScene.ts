import { getStateCallbacks, Room } from "colyseus.js";
import Phaser from "phaser";
import { GLOW_AT } from "../../../shared/hollow";
import { findStation, ITEMS, nearestStation, STATION_RANGE } from "../../../shared/items";
import { darkness, isNight, untilChange } from "../../../shared/daylight";
import { setRegion } from "../../../shared/terrain";
import { EventKind, EVENTS, WORLD_BOSS } from "../../../shared/events";
import { PORTAL_MAX, riftName, RiftInfo, RARITY_COLORS } from "../../../shared/rift";
import { BoardData, STALL_RANGE, StallData } from "../../../shared/market";
import { GameMap, isCalm, isWalkable, ZoneId } from "../../../shared/map";
import { buildZone, ZONE_NAMES } from "../../../shared/zones";
import { ChatLine, CooldownEvent, GatheringEvent, HitEvent, LootEvent, Msg, OpenStationEvent, PrivateData, TravelEvent } from "../../../shared/protocol";
import { ENEMY_SKILLS, Job, SKILLS } from "../../../shared/stats";
import { addChatLine } from "../chat";
import { askEnterHollow, initHud, MapEvent, setCorruption, setDaytime, setEvents, setOnline, setPortrait, setTargetInfo, setZone, skillForKey, startCooldown, updateMe } from "../hud";
import { MONSTERS } from "../../../shared/stats";
import { CRACK_WARN_MS } from "../../../shared/hollow";
import { closeStation, initInventory, openStation, openStationKind, setInventory, setItemLevel, showGathering } from "../inventory";
import { place, setIsoMap, toTile } from "../iso";
import { FALLEN, Land } from "../land";
import { closeMarket, initMarket, marketMode, openBoard, setBoard, setMarketInventory, setStall, visitedStall } from "../market";
import { bindMinimapZoom, drawMinimap, setMinimap } from "../minimap";
import { MonsterView } from "../MonsterView";
import { makeMonsterTextures } from "../monsterTextures";
import { initPassiveTree, setTreeCharacter, setTreePrivate } from "../passiveTree";
import { initParty, partySessions, setParty } from "../party";
import { initSettings, onSettings, setting } from "../settings";
import { initQuests, questTracker, setQuests } from "../quests";
import { initCharWin, setCharacter, setCharPortrait, setCharPrivate } from "../charwin";
import { clearGoal, initWorldMap, setWorldMap } from "../worldmap";
import { PartyData } from "../../../shared/protocol";
import { PlayerView, TIER_TINT } from "../PlayerView";
import { loadSprites, PLAYER_SHEET, SCENERY_SCALE } from "../sprites";
import { Town } from "../town";
import { makeTextures } from "../textures";



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
  land!: Land;
  private town!: Town;
  private veils: Phaser.GameObjects.Image[] = [];
  private gone = new Map<string, Phaser.GameObjects.Graphics>();
  private warning: Phaser.GameObjects.Graphics | null = null;
  private landTimer = 0;
  private fireflies: Phaser.GameObjects.Image[] = [];

  constructor() {
    super(""); // the key comes from scene.add(), so each map visit can have its own
  }

  private rift?: RiftInfo;
  private portals = new Map<string, Phaser.GameObjects.Container>();

  init(data: { room: Room; zone: ZoneId; rift?: RiftInfo; travel: (e: TravelEvent) => void }) {
    this.room = data.room;
    this.zone = data.zone;
    this.rift = data.rift;
    this.travel = data.travel;
  }

  preload() {
    loadSprites(this);
  }

  create() {
    makeTextures(this);
    makeMonsterTextures(this);
    this.map = buildZone(this.zone, this.rift);
    this.portals = new Map();
    setIsoMap(this.map);
    const st = this.room.state as any;
    this.land = new Land(
      this,
      this.map,
      (key) => !!st.depleted?.has(key),
      (key) => !!st.lit?.has(key),
    );
    this.town = new Town(this, this.map, this.land);
    this.drawExits();
    this.drawQuiet();
    document.getElementById("mist")!.hidden = this.zone !== "mossfen" || !setting("mist");
    this.veils = [];
    this.gone.clear();
    this.warning = null;
    this.fireflies = [];
    this.landTimer = -1000;

    this.marker = this.add.image(0, 0, "click-marker").setVisible(false).setDepth(-1);
    this.cameras.main.setBackgroundColor(this.map.rift ? (this.map.rift.dark ? "#0c0910" : "#2a3f63") : this.map.pvp ? "#211d2a" : this.zone === "mossfen" ? "#1f4a36" : "#2c5a34");
    setMinimap(this.map);
    this.cameras.main.setRoundPixels(true);

    initHud({
      useSkill: (id) => this.useSkill(id),
      learnSkill: (id) => this.room.send(Msg.LearnSkill, { skill: id }),
      changeJob: (job) => this.room.send(Msg.ChangeJob, { job }),
      respawn: () => this.room.send(Msg.Respawn),
    });
    setZone(this.map.rift ? this.map.name : ZONE_NAMES[this.zone], this.map.id === "hollow");
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
    initParty((a) => this.room.send(Msg.PartyAct, a));
    initSettings();
    initQuests();
    bindMinimapZoom();
    initCharWin((slot) => this.room.send(Msg.Unequip, { slot }));
    initWorldMap((x, y) => {
      this.setTarget(null);
      this.room.send(Msg.MoveFar, { x, y });
    }, partySessions);
    setWorldMap(this.map, this.room.state, this.room.sessionId);
    this.offSettings?.();
    this.offSettings = onSettings((s) => {
      for (const m of this.monsters.values()) m.nameLabel?.setVisible(s.monsterNames);
      document.getElementById("mist")!.hidden = this.zone !== "mossfen" || !s.mist;
      drawMinimap(this.room.state, this.room.sessionId, partySessions());
    });
    this.events.once("shutdown", () => this.offSettings?.());
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

  /** A dotted ring on the ground around each quiet place, with its name. */
  private drawQuiet() {
    for (const q of this.map.quiet) {
      const g = this.add.graphics().setDepth(-9000);
      const n = Math.round(q.r * 9);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = q.x + Math.cos(a) * q.r;
        const y = q.y + Math.sin(a) * q.r;
        if (x < 1 || y < 1 || x > this.map.width - 2 || y > this.map.height - 2) continue;
        const p = place(x, y);
        g.fillStyle(0x2d5a1e, 0.45);
        g.fillEllipse(p.x, p.y + 2, 20, 10);
        g.fillStyle(0xfdfff0, 0.95);
        g.fillEllipse(p.x, p.y, 16, 8);
      }
      for (const a of [Math.PI * 0.25, Math.PI * 1.25]) {
        const x = q.x + Math.cos(a) * q.r;
        const y = q.y + Math.sin(a) * q.r;
        if (x < 2 || y < 2 || x > this.map.width - 3 || y > this.map.height - 3) continue;
        const p = place(x, y);
        this.add
          .text(p.x, p.y - 8, `🌿 ${q.name}`, { fontFamily: "Tahoma, sans-serif", fontSize: "12px", color: "#eaffd8", stroke: "#1f3a14", strokeThickness: 3 })
          .setOrigin(0.5, 1)
          .setDepth(-8999);
      }
    }
  }

  private drawExits() {
    for (const e of this.map.exits) {
      const p = place(e.x, e.y);
      this.scenery(p.x, p.y, "exit").setDepth(p.depth - 1);
      this.add
        .text(p.x, p.y - 66, `ไป${e.label}`, { fontFamily: "Tahoma, sans-serif", fontSize: "12px", color: "#d8ffd0", stroke: "#000", strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setDepth(p.depth + 1);
    }
  }

  // ---- what makes each map special ------------------------------------------

  /** Draws all tiles of a region with one colour, a little above the ground. */
  private paintRegion(id: string, color: number, alpha: number) {
    const g = this.add.graphics().setDepth(-9990);
    g.fillStyle(color, alpha);
    for (const k of this.map.regions[id] ?? []) {
      const p = place(k % this.map.width, Math.floor(k / this.map.width));
      g.beginPath();
      g.moveTo(p.x, p.y - 17);
      g.lineTo(p.x + 33, p.y);
      g.lineTo(p.x, p.y + 17);
      g.lineTo(p.x - 33, p.y);
      g.closePath();
      g.fillPath();
    }
    return g;
  }

  /** Fog over the grove's ramp, or a hole where the ground fell. */
  private showRegion(id: string, closed: boolean) {
    setRegion(this.map, id, closed);
    if (id.startsWith("gate")) {
      this.gone.get(id)?.destroy();
      this.gone.delete(id);
      if (!closed) return void (setting("shake") && this.cameras.main.shake(200, 0.004));
      const g = this.add.graphics().setDepth(-9989);
      for (const k of this.map.regions[id]) {
        const p = place(k % this.map.width, Math.floor(k / this.map.width));
        g.fillStyle(0x3a2a22, 1);
        g.fillRect(p.x - 10, p.y - 46, 20, 46);
        g.fillStyle(0x8a6a4a, 1);
        g.fillRect(p.x - 7, p.y - 43, 14, 40);
        g.lineStyle(2, 0x2a1a12, 1);
        g.lineBetween(p.x - 7, p.y - 30, p.x + 7, p.y - 30);
        g.lineBetween(p.x - 7, p.y - 16, p.x + 7, p.y - 16);
      }
      g.setDepth(place(this.map.regions[id][0] % this.map.width, Math.floor(this.map.regions[id][0] / this.map.width)).depth + 1);
      this.gone.set(id, g);
      return;
    }
    if (id === "fog") {
      this.veils.forEach((v) => v.destroy());
      this.veils = [];
      if (!closed) return;
      for (const k of this.map.regions.fog) {
        const p = place(k % this.map.width, Math.floor(k / this.map.width));
        const v = this.scenery(p.x, p.y, "fogveil").setDepth(p.depth + 4).setAlpha(0.9);
        this.tweens.add({ targets: v, x: p.x + 8, alpha: 0.65, duration: 1800, yoyo: true, repeat: -1 });
        this.veils.push(v);
      }
      return;
    }
    this.gone.get(id)?.destroy();
    this.gone.delete(id);
    if (closed) {
      this.gone.set(id, this.paintRegion(id, FALLEN, 1));
      this.shakeNear(id, 350, 0.012);
    }
  }

  private shakeNear(id: string, ms: number, power: number) {
    const k = this.map.regions[id]?.[0];
    const me = this.me;
    if (k === undefined || !me) return;
    if (Math.hypot((k % this.map.width) - me.x, Math.floor(k / this.map.width) - me.y) < 16 && setting("shake")) this.cameras.main.shake(ms, power);
  }

  /** Ground that is about to fall glows red and trembles. */
  private showWarning(id: string) {
    this.warning?.destroy();
    this.warning = null;
    if (!id) return;
    this.warning = this.paintRegion(id, 0xff3a3a, 0.4);
    this.tweens.add({ targets: this.warning, alpha: 0.4, duration: 260, yoyo: true, repeat: -1 });
    this.shakeNear(id, 500, 0.004);
  }

  /** Dusk, night and dawn outside the Hollow, with fireflies. */
  private clock(ms: number) {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  /** What is going on in this map, for the board on the right. */
  private showEvents() {
    const st = this.room.state as any;
    const list: MapEvent[] = [];
    const me = this.me;
    if (me && isCalm(this.map, me.x, me.y)) {
      const q = this.map.quiet.find((z) => Math.hypot(me.x - z.x, me.y - z.y) < z.r);
      list.push({ icon: "🌿", kind: "sun", title: q ? q.name : "หมู่บ้าน", text: "ที่สงบ: มอนสเตอร์ไม่เข้ามาและเลิกไล่ เก็บของได้สบาย" });
    } else if (this.map.quiet.length) list.push({ icon: "🌿", kind: "rare", title: "ที่สงบสำหรับเก็บของ", text: `${this.map.quiet.map((q) => q.name).join(", ")} (วงจุดขาวบนพื้นและแผนที่)` });
    if (this.map.id === "brindle") {
      list.push(isNight() ? { icon: "🌙", kind: "night", title: "กลางคืน: หุ่นไล่กาให้ ×1.5", text: `EXP และเหรียญเพิ่ม · เช้าใน ${this.clock(untilChange())}` } : { icon: "☀️", kind: "sun", title: "กลางวัน", text: `ค่ำใน ${this.clock(untilChange())} แล้วหุ่นไล่กาจะให้ EXP ×1.5` });
      list.push({ icon: "🌬️", kind: "rare", title: "กังหันลมบนเนินใต้", text: me?.windy ? "ลมกำลังพัดส่งคุณ เดินเร็วขึ้น 20%" : "คลิกกังหันลม เดินเร็วขึ้น 20% นาน 3 นาที" });
    } else if (this.map.id === "mossfen") {
      const lit = st.lit?.size ?? 0;
      list.push(st.fogUntil ? { icon: "🏮", kind: "epic", title: "ลานสมบัติเปิดแล้ว!", text: `หมอกกลับมาใน ${this.clock(st.fogUntil - Date.now())} · เปิดหีบได้คนละครั้ง` } : { icon: "🏮", kind: "rare", title: `โคมหิน ${lit}/3`, text: "จุดให้ครบใน 90 วินาที หมอกจะเปิดทางขึ้นลานสมบัติ" });
      list.push(isNight() ? { icon: "🌙", kind: "night", title: "กลางคืน", text: `เช้าใน ${this.clock(untilChange())}` } : { icon: "☀️", kind: "sun", title: "กลางวัน", text: `ค่ำใน ${this.clock(untilChange())}` });
    } else if (this.map.pvp) {
      if (st.cracking) list.push({ icon: "⚠️", kind: "dark", title: "พื้นกำลังจะถล่ม!", text: "ออกจากพื้นสีแดงก่อนจะตกลงไป (เสียเลือด 40%)" });
      list.push({ icon: "🚪", kind: "boss", title: "ประตูทางออกสีทอง", text: `ย้ายที่ใน ${this.clock(st.gatesUntil - Date.now())}` });
      list.push({ icon: "🌈", kind: "epic", title: "บ่อสี 3 แห่ง", text: "ล้างการกัดกร่อน แต่ทุกคนเห็นคุณบนแผนที่" });
    }
    if (st.eventKind) {
      const e = EVENTS[st.eventKind as EventKind];
      list.unshift({ icon: e.icon, kind: "boss", title: e.name, text: `${e.text} · เหลือ ${this.clock(st.eventUntil - Date.now())}` });
    }
    if (this.map.id === "brindle" || this.map.id === "mossfen") {
      const boss = WORLD_BOSS[this.map.id];
      const m = st.bossId ? st.monsters?.get(st.bossId) : null;
      if (m) list.unshift({ icon: "👑", kind: "dark", title: `${MONSTERS[boss.kind].name} ตื่นแล้ว!`, text: `ที่${boss.place} (${boss.at.x}, ${boss.at.y}) · เลือด ${Math.ceil((m.hp / m.maxHp) * 100)}%` });
      else if (st.bossAt) list.push({ icon: "👑", kind: "night", title: MONSTERS[boss.kind].name, text: `จะตื่นที่${boss.place}ใน ${this.clock(st.bossAt - Date.now())}` });
    }
    if (this.map.border) list.unshift({ icon: "⚔", kind: "dark", title: "ชายแดน: ผู้เล่นตีกันได้", text: "คนที่ลงมือก่อนจะชื่อแดง ตายแล้วของในกระเป๋าหล่น 25% (ชื่อแดงหล่นหมด)" });
    if (this.map.rift) {
      const r = this.map.rift;
      list.length = 0;
      list.push(st.riftCleared
        ? { icon: "🎁", kind: "boss", title: "ปราบครบแล้ว!", text: "เปิดหีบรางวัลกลางเกาะ (คนละครั้ง) แล้วเดินกลับทางเข้า" }
        : { icon: "⚔️", kind: r.dark ? "dark" : "epic", title: `ระลอก ${st.riftWave}/${st.riftWaves}`, text: `เหลือมอนสเตอร์ ${st.monsters?.size ?? 0} ตัว` });
      list.push({ icon: "⏳", kind: "night", title: (r.dungeon ? "ดันเจี้ยนปิดใน " : "พอร์ทัลปิดใน ") + this.clock(st.riftEnds - Date.now()), text: r.dungeon ? "ปราบทีละห้อง ประตูถัดไปจะเปิดเอง" : "หมดเวลาแล้วจะถูกส่งกลับออกไป" });
      if (r.dark) list.push({ icon: "☠", kind: "dark", title: "พอร์ทัลดำ", text: "ผู้เล่นนอกปาร์ตี้ตีกันได้ ตายแล้วของตกหมด" });
    } else
      st.portals?.forEach((p: any) => {
        const me = this.me;
        if (p.dungeon) return;
        const far = me ? Math.round(Math.hypot(p.x - me.x, p.y - me.y)) : 0;
        list.push({ icon: p.dark ? "☠" : "🌀", kind: p.dark ? "dark" : ["sun", "rare", "epic", "boss"][p.rarity], title: riftName(p), text: `อีก ${far} ช่อง · ปิดใน ${this.clock(p.until - Date.now())} · ${p.inside}/${PORTAL_MAX} คน` });
      });
    void CRACK_WARN_MS;
    if (!this.map.rift) list.unshift(...questTracker().map((t) => ({ icon: "", kind: "quest", title: t.title, text: t.text })));
    setEvents(list);
  }

  /** The frame at the top: what you are fighting now. */
  private showTarget() {
    const id = this.targetId;
    const st = this.room.state as any;
    const m = id ? st.monsters?.get(id) : null;
    if (m) return setTargetInfo({ name: MONSTERS[m.kind]?.name ?? m.kind, sub: `Lv ${m.level}`, hp: m.hp, maxHp: m.maxHp, enemy: true });
    const p = id ? st.players?.get(id) : null;
    if (p) return setTargetInfo({ name: p.name, sub: `Lv ${p.level}${p.outlaw ? " · ชื่อแดง" : ""}`, hp: p.hp, maxHp: p.maxHp, enemy: this.map.pvp || !!this.map.border });
    setTargetInfo(null);
  }

  private portraitAt = 0;
  private offSettings?: () => void;
  /** A picture of our own character for the round frame, taken now and then. */
  private takePortrait(time: number) {
    const v = this.views.get(this.room.sessionId);
    if (!v || time < this.portraitAt) return;
    this.portraitAt = time + 4000;
    const cam = this.cameras.main;
    const x = Math.round((v.root.x - cam.worldView.x) * cam.zoom) - 48;
    const y = Math.round((v.root.y - cam.worldView.y) * cam.zoom) - 78;
    if (x < 0 || y < 0 || x + 96 > this.scale.width || y + 96 > this.scale.height) return;
    this.game.renderer.snapshotArea(x, y, 96, 96, (img) => {
      if (img instanceof HTMLImageElement) {
        setPortrait(img.src);
        setCharPortrait(img.src);
      }
    });
  }

  private showDaylight() {
    const dark = this.map.pvp || this.map.rift || !setting("night") ? 0 : darkness();
    document.getElementById("night")!.style.opacity = String(dark * 0.5);
    this.land.setNight(this.map.pvp || this.map.rift ? 0 : darkness());
    this.showEvents();
    this.showTarget();
    if (this.map.pvp || this.map.rift) return setDaytime("");
    setDaytime(`${isNight() ? "🌙" : "☀️"} ${this.clock(untilChange())}`);
    const want = dark > 0.5 ? 14 : 0;
    const view = this.cameras.main.worldView;
    while (this.fireflies.length < want) {
      const f = this.add.image(view.x + Math.random() * view.width, view.y + Math.random() * view.height, "sparkle").setTint(0xfff39a).setScale(0.6).setDepth(99990).setAlpha(0);
      this.fireflies.push(f);
      const fly = () => {
        if (!f.active) return;
        const v = this.cameras.main.worldView;
        if (!v.contains(f.x, f.y)) f.setPosition(v.x + Math.random() * v.width, v.y + Math.random() * v.height);
        this.tweens.add({ targets: f, x: f.x + Phaser.Math.Between(-50, 50), y: f.y + Phaser.Math.Between(-36, 36), alpha: Math.random() * 0.9, duration: 1400 + Math.random() * 1200, onComplete: fly });
      };
      fly();
    }
    while (this.fireflies.length > want) this.fireflies.pop()!.destroy();
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
      view.setEffects(player.blessed, player.manaShield, player.slowed, player.marked);
      view.setStatus(player.offline, player.shielded, player.corruption >= GLOW_AT, player.gm, player.outlaw);
      this.views.set(id, view);
      view.setFriend(partySessions().has(id));
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
        view.setEffects(player.blessed, player.manaShield, player.slowed, player.marked);
      view.setStatus(player.offline, player.shielded, player.corruption >= GLOW_AT, player.gm, player.outlaw);
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
        view.setEffects(m.slowed, m.marked);
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

    $(state).depleted.onAdd((_v: boolean, key: string) => this.land.usable.get(key)?.img.setAlpha(0.35));
    $(state).depleted.onRemove((_v: boolean, key: string) => this.land.usable.get(key)?.img.setAlpha(1));
    $(state).lit.onAdd((_v: number, key: string) => this.land.usable.get(key)?.img.setFrame("lantern1"));
    $(state).lit.onRemove((_v: number, key: string) => this.land.usable.get(key)?.img.setFrame("lantern0"));
    $(state).closed.onAdd((_v: boolean, id: string) => this.showRegion(id, true));
    $(state).closed.onRemove((_v: boolean, id: string) => this.showRegion(id, false));
    $(state).listen("cracking", (id: string) => this.showWarning(id));

    $(state).gates.onAdd((gate: any) => this.addGate(gate.x, gate.y));
    $(state).gates.onRemove(() => this.redrawGates());
    $(state).bundles.onAdd((b: any, id: string) => {
      const p = place(b.x, b.y);
      const img = this.scenery(0, 0, "bundle");
      const label = this.add
        .text(0, -36, `ห่อของ ${b.owner}`, { fontFamily: "Tahoma, sans-serif", fontSize: "12px", color: "#ffe9a8", stroke: "#000", strokeThickness: 3 })
        .setOrigin(0.5, 1);
      this.bundles.set(id, this.add.container(p.x, p.y, [img, label]).setDepth(p.depth));
    });
    $(state).bundles.onRemove((_b: any, id: string) => {
      this.bundles.get(id)?.destroy();
      this.bundles.delete(id);
    });

    $(state).portals.onAdd((p: any, id: string) => this.addPortal(id, p));
    $(state).portals.onRemove((_p: any, id: string) => {
      this.portals.get(id)?.destroy();
      this.portals.delete(id);
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
    this.room.onMessage(Msg.Party, (d: PartyData) => {
      setParty(d);
      const friends = partySessions();
      for (const [id, v] of this.views) v.setFriend(friends.has(id));
      if (this.map.pvp && this.targetId && friends.has(this.targetId)) this.setTarget(null);
    });
    this.room.onMessage(Msg.PartyInvite, (e: { from: string }) => addChatLine({ from: "", name: "", text: `${e.from} ชวนคุณเข้าปาร์ตี้ (กดเข้าร่วมที่กล่องด้านบน)`, system: true, party: true }));
    this.room.onMessage(Msg.Hit, (h: HitEvent) => this.showHit(h));
    this.room.onMessage(Msg.Cooldown, (c: CooldownEvent) => startCooldown(c.skill, c.ms));
    this.room.onMessage(Msg.ExpGain, (e: { amount: number }) => {
      const v = this.views.get(this.room.sessionId);
      if (v) this.floatText(v.headPoint().x, v.headPoint().y - 14, `+${e.amount} EXP`, "#d7b6ff", 13);
    });
    this.room.onMessage(Msg.Private, (d: PrivateData) => {
      const gained = this.gold === null ? 0 : d.gold - this.gold;
      this.gold = d.gold;
      setTreePrivate(d.gold, d.nodes, d.quests?.points ?? 0);
      setQuests(d.quests);
      setCharPrivate(d.inv, d.nodes);
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
    const p = place(s.x, s.y);
    const layer = (l: string) => this.add.image(0, 0, `player-${l}`, 0).setOrigin(0.5, PLAYER_SHEET.originY).setScale(PLAYER_SHEET.scale);
    const parts = [layer("base"), layer("tunic").setTint(s.color)];
    const helm = ITEMS[s.helm];
    if (helm?.look === "helm") parts.push(layer("helm").setTint(TIER_TINT[helm.tier] ?? 0xffffff));
    const keeper = this.add.container(0, 0, parts).setAlpha(0.85);
    const stand = this.scenery(0, 0, `stall${(s.x + s.y) % 3}`);
    const text = (y: number, t: string, color: string, size: number) =>
      this.add.text(0, y, t, { fontFamily: "Tahoma, sans-serif", fontSize: `${size}px`, color, stroke: "#000", strokeThickness: 3 }).setOrigin(0.5, 1);
    const root = this.add.container(p.x, p.y, [keeper, stand, text(-84, s.title, "#ffe9a8", 13), text(-100, s.owner, "#ffffff", 11)]);
    root.setDepth(p.depth + 2);
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
    const p = place(x, y);
    const img = this.scenery(p.x, p.y, "gate").setDepth(p.depth - 1);
    const label = this.add
      .text(p.x, p.y - 68, "ประตูทางออก", { fontFamily: "Tahoma, sans-serif", fontSize: "13px", color: "#ffd23a", stroke: "#000", strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(p.depth);
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
    setItemLevel(p.level, p.job as Job);
    const mode = marketMode();
    if (mode === "board" || mode === "stall") {
      const at = mode === "board" ? nearestStation(this.map, "board", p.x, p.y) : this.stalls.get(visitedStall() ?? "");
      if (p.dead || !at || Math.hypot(p.x - at.x, p.y - at.y) > (mode === "board" ? STATION_RANGE : STALL_RANGE)) closeMarket();
    }
    const kind = openStationKind();
    if (kind) {
      const at = nearestStation(this.map, kind, p.x, p.y);
      if (p.dead || !at || Math.hypot(p.x - at.x, p.y - at.y) > STATION_RANGE) closeStation();
    }
    setCharacter(p.name, p.level, p.job);
    const zx = document.getElementById("map-xy")!;
    const xy = `(${Math.round(p.x)}, ${Math.round(p.y)})`;
    if (zx.textContent !== xy) zx.textContent = xy;
    if (!p.moving) clearGoal();
    updateMe({
      name: p.name,
      level: p.level,
      exp: p.exp,
      job: p.job,
      hp: p.hp,
      maxHp: p.maxHp,
      mp: p.mp,
      maxMp: p.maxMp,
      dead: p.dead,
      skills: new Map(p.skills.entries()),
      buffs: [
        p.shielded && { icon: "🔰", name: "เพิ่งมาถึง: ยังไม่โดนโจมตี" },
        p.windy && { icon: "🌬️", name: "ลมจากกังหัน: เดินเร็วขึ้น 20%" },
        p.outlaw && { icon: "😈", name: "ชื่อแดง: ใช้ร้านและคลังไม่ได้ ทหารเมืองหลวงไล่ตี ตายในชายแดนของตกหมด (หายเองเมื่อออนไลน์ไปสักพัก)" },
        p.frenzy && { icon: "🔥", name: "พลังพิเศษจากสกิล (ตีแรงขึ้น คริติคอล หรือหลบหลีก)" },
        p.guarding && { icon: "🛡️", name: "ตั้งการ์ด" },
        p.blessed && { icon: "✨", name: "พรคุ้มกัน" },
        p.manaShield && { icon: "🔮", name: "โล่มานา" },
        p.inSpring && { icon: "🌈", name: "บ่อสี: ล้างการกัดกร่อน แต่ทุกคนเห็นคุณ" },
        p.slowed && { icon: "🐌", name: "ถูกทำให้ช้า" },
        p.marked && { icon: "🎯", name: "ถูกมาร์กจุดอ่อน" },
      ].filter(Boolean) as { icon: string; name: string }[],
    });
  }

  // ---- effects --------------------------------------------------------------

  private showHit(h: HitEvent) {
    if (h.heal) {
      const v = this.views.get(h.to);
      if (v) {
        const p = v.headPoint();
        this.floatText(p.x, p.y, `+${h.dmg}`, "#8df08d", 17);
        this.sparkle(v.root.x, v.root.y - 24, 0x8df08d);
      }
      return;
    }
    const flight = this.shoot(h);
    if (flight > 0) {
      // the number shows when the arrow or spell arrives
      this.views.get(h.from)?.lunge();
      const target = this.monsters.get(h.to);
      this.time.delayedCall(flight, () => this.landHit(h, false, target));
      if (h.killed) this.monsters.get(h.to)?.setTargeted(false);
      return;
    }
    this.landHit(h, true);
  }

  private sparkle(x: number, y: number, color: number) {
    for (let i = 0; i < 8; i++) {
      const s = this.add.image(x, y, "sparkle").setTint(color).setDepth(99999);
      const a = (i / 8) * Math.PI * 2;
      this.tweens.add({ targets: s, x: x + Math.cos(a) * 24, y: y + Math.sin(a) * 18 - 14, alpha: 0, duration: 600, onComplete: () => s.destroy() });
    }
  }

  /** Draws an arrow or spell flying to its target. Returns how long it takes (0 = a blow at close range). */
  private shoot(h: HitEvent): number {
    const a = this.views.get(h.from);
    const t = this.monsters.get(h.to) ?? this.views.get(h.to);
    if (!a || !t || Math.hypot(a.x - t.x, a.y - t.y) < 2.2) return 0;
    const job = (this.room.state as any).players.get(h.from)?.job;
    const COLORS: Record<string, number> = { fireball: 0xff8a2a, ice_lance: 0x9fe0ff, chain_lightning: 0xfff07a, holy_light: 0xffe9a0, pierce_arrow: 0xffd23a };
    const from = { x: a.root.x, y: a.root.y - 30 };
    const c = t.center();
    const ms = Math.min(260, 60 + Math.hypot(c.x - from.x, c.y - from.y) * 0.6);
    const color = COLORS[h.skill ?? ""] ?? (job === "archer" ? 0xf6ecd2 : 0xc8a8ff);
    const shot =
      job === "archer"
        ? this.add.rectangle(from.x, from.y, 24, 3, color).setStrokeStyle(1, 0x4a2c17)
        : this.add.circle(from.x, from.y, h.skill === "fireball" ? 9 : 6, color).setStrokeStyle(2, 0xffffff, 0.8);
    shot.setDepth(99998).setRotation(Math.atan2(c.y - from.y, c.x - from.x));
    this.tweens.add({
      targets: shot,
      x: c.x,
      y: c.y,
      duration: ms,
      onComplete: () => {
        shot.destroy();
        if (job !== "archer") this.sparkle(c.x, c.y, color);
      },
    });
    return ms;
  }

  private landHit(h: HitEvent, lunge: boolean, targetMonster = this.monsters.get(h.to)) {
    const attackerPlayer = this.views.get(h.from);
    if (lunge) attackerPlayer?.lunge();
    this.monsters.get(h.from)?.attack();
    const myId = this.room.sessionId;
    if (targetMonster) {
      if (!targetMonster.dying) targetMonster.flash();
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
        if (!targetMonster.dying) targetMonster.die();
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
    if (!setting("numbers") && /^[+-]\d+$/.test(text)) return;
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
    for (const u of this.land.usable.values()) {
      if (!u.img.displayList) continue; // not in view
      const { img } = u;
      const big = u.kind === "windmill";
      const h = Math.min(img.displayHeight, big ? 100 : 56);
      if (Math.abs(wx - img.x) > Math.min(img.displayWidth, big ? 80 : 46) / 2 || wy > img.y + (big ? 28 : 12) || wy < img.y - h) continue;
      if (!best || img.depth > best.img.depth) best = u;
    }
    return best;
  }

  /** Another player under the pointer (only where players can fight). */
  private pickPlayer(wx: number, wy: number): string | null {
    // in peaceful maps only a healer can pick friends, so others can still walk past people
    if (!this.map.pvp && !this.map.border && this.me?.job !== "acolyte") return null;
    for (const [id, v] of this.views) {
      if (id === this.room.sessionId || (this.room.state as any).players.get(id)?.dead) continue;
      const c = v.center();
      if (Math.hypot((wx - c.x) / 18, (wy - c.y) / 30) < 1) return id;
    }
    return null;
  }

  /** A swirling portal with its rarity and how many went in. */
  private addPortal(id: string, p: any) {
    const at = place(p.x, p.y);
    const color = p.dark ? 0x3a1c4a : RARITY_COLORS[p.rarity];
    const glow = this.add.image(0, -30, "sparkle").setTint(p.dark ? 0xff3a6a : color).setScale(5).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD);
    const img = this.scenery(0, 0, p.dungeon ? "gate" : "portal").setTint(p.dungeon ? 0xffffff : p.dark ? 0x6a4a7a : color);
    const label = this.add
      .text(0, -92, "", { fontFamily: "Tahoma, sans-serif", fontSize: "12px", color: p.dark ? "#ff9ab0" : "#ffffff", stroke: "#000", strokeThickness: 3, align: "center" })
      .setOrigin(0.5, 1);
    const box = this.add.container(at.x, at.y, [glow, img, label]).setDepth(at.depth);
    const show = () => label.setText(p.dungeon ? `🗝️ ${riftName({ ...p, origin: this.map.id })}\nปาร์ตี้ละไม่เกิน 5 คน` : `${riftName(p)}\n${p.inside}/${PORTAL_MAX} คน`);
    show();
    getStateCallbacks(this.room)(p).listen("inside", show);
    this.tweens.add({ targets: glow, scale: 6, alpha: 0.25, duration: 900, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: img, scaleX: img.scaleX * 1.06, duration: 1200, yoyo: true, repeat: -1 });
    this.portals.set(id, box);
  }

  private pickPortal(wx: number, wy: number): string | null {
    for (const [id, b] of this.portals) if (Math.abs(wx - b.x) < 34 && wy < b.y + 12 && wy > b.y - 80) return id;
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
    const enemy = this.targetId !== null && (this.monsters.has(this.targetId) || this.map.pvp);
    if (ENEMY_SKILLS.has(def.kind) && !enemy) {
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
      const portal = this.pickPortal(pointer.worldX, pointer.worldY);
      if (portal) {
        this.setTarget(null);
        this.room.send(Msg.EnterRift, { id: portal });
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
        // choosing a friend to heal is not an attack
        if (this.map.pvp || this.map.border || this.monsters.has(monsterId)) this.room.send(Msg.Attack, { id: monsterId });
        this.marker.setVisible(false);
        return;
      }
      const usable = this.pickUsable(pointer.worldX, pointer.worldY);
      if (usable) {
        this.setTarget(null);
        this.room.send(Msg.Interact, { x: usable.x, y: usable.y });
        this.town.greet(usable.x, usable.y);
        const at = place(usable.x, usable.y);
        this.marker.setPosition(at.x, at.y).setVisible(true).setAlpha(1);
        return;
      }
      const t = toTile(pointer.worldX, pointer.worldY);
      if (!isWalkable(this.map, t.x, t.y)) return;
      this.setTarget(null);
      this.room.send(Msg.Move, { x: t.x, y: t.y });
      const p = place(t.x, t.y);
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
      const skill = skillForKey(e.key, this.me?.job ?? "");
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
    this.town.update(delta, time, [...this.views.values()]);
    const meView = this.views.get(this.room.sessionId);
    if (meView) this.land.fadeFor([{ x: meView.root.x, y: meView.root.y, depth: meView.root.depth }]);
    // after a jump across the map the camera goes straight there
    const cam = this.cameras.main;
    const target = (cam as any)._follow as { x: number; y: number } | null;
    if (target && (!cam.worldView.width || Math.hypot(cam.midPoint.x - target.x, cam.midPoint.y - target.y) > 900)) {
      cam.centerOn(target.x, target.y);
      cam.preRender();
      this.landTimer = -1000;
    }
    if (time - this.landTimer > 100) {
      this.landTimer = time;
      this.land.update(this.cameras.main.worldView, time);
      this.takePortrait(time);
      this.showDaylight();
    }
    if (time - this.mapTimer > 200) {
      this.mapTimer = time;
      drawMinimap(this.room.state, this.room.sessionId, partySessions());
      if (this.map.id === "hollow" && this.me) setCorruption(this.me.corruption, (this.room.state as any).gatesUntil);
    }
    if (this.marker.visible) this.marker.setAlpha(0.6 + Math.sin(time / 120) * 0.4);
  }
}
