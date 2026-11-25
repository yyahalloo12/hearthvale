import { Client, Room, ServerError } from "@colyseus/core";
import {
  AUTOSAVE_MS,
  CHAT_COOLDOWN_MS,
  CHAT_MAX,
  MAX_PATH_STEPS,
  MAX_PLAYERS_PER_ROOM,
  PASSWORD_MAX,
  PASSWORD_MIN,
  TICK_RATE,
  TUNIC_COLORS,
  WALK_SPEED,
} from "../../../shared/constants";
import {
  buildHollow,
  BUNDLE_MS,
  CORRUPTION_PER_MIN,
  corruptionBonus,
  destroyPart,
  GATE_MOVE_MS,
  GLOW_AT,
  HOLLOW_MIN_LEVEL,
  HollowMap,
  LINGER_MS,
  pickGates,
  PROTECT_MS,
  PVP_DAMAGE,
} from "../../../shared/hollow";
import {
  addItem,
  BAG_SIZE,
  cleanInventory,
  craft,
  equipItem,
  equipTotals,
  findStation,
  FlatStats,
  GATHER_MS,
  Inventory,
  ITEMS,
  ItemStack,
  moveStack,
  Resource,
  resourceAt,
  rollDrops,
  sellPrice,
  Slot,
  SLOTS,
  stackName,
  STATION_RANGE,
  stationAt,
  StationKind,
  STORAGE_SIZE,
  countItem,
  unequipItem,
} from "../../../shared/items";
import { buildBrindleVillage, GameMap, isSafe, isWalkable, ZoneId } from "../../../shared/map";
import { cleanChat, cleanName } from "../../../shared/names";
import { canReach, canRefund, cleanNodes, Mods, passiveMods, passivePointsEarned, PASSIVES, refundCost } from "../../../shared/passives";
import { findPath, Point } from "../../../shared/pathfinding";
import { ChatLine, CooldownEvent, GatheringEvent, HitEvent, JoinOptions, LootEvent, Msg, OpenStationEvent, PrivateData, ROOM_OF, TicketOptions, TravelEvent, ZONE_ERROR } from "../../../shared/protocol";
import {
  ATTACK_RANGE,
  CRIT_CHANCE,
  DEATH_EXP_LOSS,
  expToNext,
  hitDamage,
  Job,
  JOB_CHANGE_LEVEL,
  JOB_NAMES,
  killExp,
  killGold,
  MAX_LEVEL,
  MONSTERS,
  OUT_OF_COMBAT_MS,
  PLAYER_ATTACK_MS,
  playerStats,
  RESPAWN_DELAY_MS,
  SkillId,
  skillPointsEarned,
  SKILLS,
} from "../../../shared/stats";
import { CharacterRow, CharacterSave, createAccount, loadBundles, loadCharacter, login, saveCharacter, saveWithBundle } from "../db";
import { MonsterSystem } from "../game/monsters";
import { dist, faceTowards, planFrom, stepAlong } from "../game/movement";
import { freeLock, holdsLock, Lock, makeTicket, takeLock, useTicket } from "../game/sessions";
import { Bundle, Gate, Player, WorldState } from "./schema";

export { facingFor } from "../game/movement";

/** Server-only data kept per player (not sent to clients). */
interface PlayerCtl {
  accountId: number;
  lock: Lock;
  /** on the way to another map: nothing more may happen here */
  leaving: boolean;
  /** logged out in the Hollow, still standing there until this time (0 = online) */
  lingerUntil: number;
  /** 0-100, exact (the state only shows whole numbers) */
  corruption: number;
  /** no harm given or taken until this time */
  shieldUntil: number;
  stunUntil: number;
  path: Point[];
  lastChatAt: number;
  targetId: string | null;
  repathAt: number;
  nextAttackAt: number;
  lastCombatAt: number;
  pendingSkill: SkillId | null;
  cooldowns: Map<string, number>;
  guardUntil: number;
  guardReduce: number;
  charge: { targetId: string; power: number; stunMs: number } | null;
  deadAt: number;
  /** fractional HP regenerated but not yet applied */
  regen: number;
  gold: number;
  nodes: Set<string>;
  inv: Inventory;
  /** bonuses from nodes and gear, worked out again whenever they change */
  mods: Mods;
  /** plain numbers from gear */
  gear: FlatStats;
  /** the rock, tree or station being walked to or used */
  interact: { x: number; y: number; res: Resource | null; station: StationKind | null; bundle: string | null; doneAt: number } | null;
  /** monsters already hit once (for the "first strike" keystone) */
  struck: Set<string>;
}

interface AuthData {
  character: CharacterRow;
  lock: Lock;
  /** session id of our own body, still standing in the Hollow after a logout */
  takeOver?: string;
}

interface BundleCtl {
  items: ItemStack[];
  owner: string;
  x: number;
  y: number;
  expires: number;
}

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  map!: GameMap;
  ctl = new Map<string, PlayerCtl>();
  monsterSys!: MonsterSystem;
  private bundles = new Map<string, BundleCtl>();
  /** used-up rocks and trees: "x,y" -> when they come back */
  private depletedUntil = new Map<string, number>();

  async onCreate(options: { zone?: ZoneId }) {
    this.map = options?.zone === "hollow" ? buildHollow() : buildBrindleVillage();
    this.setState(new WorldState());
    this.state.mapName = this.map.name;
    this.autoDispose = false; // the world stays alive (monsters keep living) with nobody online

    this.monsterSys = new MonsterSystem({
      map: this.map,
      monsters: this.state.monsters as unknown as Map<string, any>,
      playerAt: (id) => this.state.players.get(id),
      nearestPlayer: (x, y, r) => this.nearestPlayer(x, y, r),
      monsterHitsPlayer: (mid, pid, atk) => this.monsterHitsPlayer(mid, pid, atk),
      now: () => this.clock.currentTime,
    });
    this.monsterSys.spawnAll();
    if (this.map.pvp) this.moveGates(false);

    this.setSimulationInterval((dt) => this.tick(dt), 1000 / TICK_RATE);
    this.setPatchRate(1000 / TICK_RATE);
    this.clock.setInterval(() => this.saveAll(), AUTOSAVE_MS);

    this.onMessage(Msg.Move, (client, msg) => this.handleMove(client, msg));
    this.onMessage(Msg.Attack, (client, msg) => this.handleAttack(client, msg));
    this.onMessage(Msg.Skill, (client, msg) => this.handleSkill(client, msg));
    this.onMessage(Msg.LearnSkill, (client, msg) => this.handleLearn(client, msg));
    this.onMessage(Msg.ChangeJob, (client) => this.handleChangeJob(client));
    this.onMessage(Msg.LearnPassive, (client, msg) => this.handleLearnPassive(client, msg));
    this.onMessage(Msg.RefundPassive, (client, msg) => this.handleRefundPassive(client, msg));
    this.onMessage(Msg.LootBundle, (client, msg) => this.handleLootBundle(client, msg));
    this.onMessage(Msg.EnterHollow, (client) => this.handleEnterHollow(client));
    this.onMessage(Msg.Interact, (client, msg) => this.handleInteract(client, msg));
    this.onMessage(Msg.Equip, (client, msg) => this.handleEquip(client, msg));
    this.onMessage(Msg.Unequip, (client, msg) => this.handleUnequip(client, msg));
    this.onMessage(Msg.Craft, (client, msg) => this.handleCraft(client, msg));
    this.onMessage(Msg.Buy, (client, msg) => this.handleBuy(client, msg));
    this.onMessage(Msg.Sell, (client, msg) => this.handleSell(client, msg));
    this.onMessage(Msg.Deposit, (client, msg) => this.handleMoveStack(client, msg, true));
    this.onMessage(Msg.Withdraw, (client, msg) => this.handleMoveStack(client, msg, false));
    this.onMessage(Msg.Sync, (client) => this.sendPrivate(client));
    this.onMessage(Msg.Respawn, (client) => this.handleRespawn(client));
    this.onMessage(Msg.Chat, (client, msg) => this.handleChat(client, msg));

    for (const b of await loadBundles(this.map.id)) {
      let items: ItemStack[] = [];
      try {
        items = cleanInventory({ bag: JSON.parse(b.items) }).bag;
      } catch {
        /* bad JSON: nothing in it */
      }
      if (items.length) this.addBundle(b.id, { items, owner: b.owner, x: b.x, y: b.y, expires: b.expires });
    }
  }

  // ---- joining and leaving ------------------------------------------------

  async onAuth(_client: Client, options: Partial<JoinOptions & TicketOptions>): Promise<AuthData> {
    if (typeof options?.ticket === "string") {
      const t = useTicket(options.ticket, this.map.id);
      const character = t && (await loadCharacter(t.accountId));
      if (!t || !character) throw new ServerError(401, "การเดินทางหมดเวลา เข้าสู่ระบบใหม่อีกครั้ง");
      return { character, lock: t.lock };
    }
    const name = cleanName(options?.name);
    if (!name) throw new ServerError(400, "ชื่อต้องยาว 2–16 ตัว ใช้ตัวอักษร ตัวเลข ช่องว่าง _ หรือ - ได้");
    const password = typeof options?.password === "string" ? options.password : "";
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)
      throw new ServerError(400, `รหัสผ่านต้องยาว ${PASSWORD_MIN}–${PASSWORD_MAX} ตัว`);

    let character: CharacterRow | null;
    if (options.create) {
      const color = (TUNIC_COLORS as readonly number[]).includes(Number(options.color))
        ? Number(options.color)
        : TUNIC_COLORS[0];
      try {
        character = await createAccount(name, password, color);
      } catch (e) {
        if (String(e).includes("NAME_TAKEN")) throw new ServerError(409, "ชื่อนี้มีคนใช้แล้ว ลองชื่ออื่น หรือกด \"เข้าสู่โลก\" ถ้าเป็นตัวละครของคุณ");
        throw e;
      }
    } else {
      character = await login(name, password);
      if (!character) throw new ServerError(401, "ชื่อหรือรหัสผ่านไม่ถูกต้อง (ยังไม่มีตัวละคร? กด \"สร้างตัวละครใหม่\")");
    }
    const zone = character.zone === "hollow" ? "hollow" : "brindle";
    if (zone !== this.map.id) throw new ServerError(421, ZONE_ERROR + zone);
    // Logged out in the Hollow a moment ago? Then step back into the body that is still there.
    for (const [sid, c] of this.ctl)
      if (c.accountId === character.account_id && c.lingerUntil && !c.leaving) {
        if (this.claimed.has(sid)) break;
        this.claimed.add(sid);
        c.lingerUntil = Math.max(c.lingerUntil, this.clock.currentTime + 15_000);
        this.clock.setTimeout(() => this.claimed.delete(sid), 15_000);
        return { character, lock: c.lock, takeOver: sid };
      }
    const lock = takeLock(character.account_id);
    if (!lock) throw new ServerError(409, "ตัวละครนี้ออนไลน์อยู่แล้ว");
    // read again now that nobody else can change it
    const fresh = await loadCharacter(character.account_id);
    if (!fresh || (fresh.zone === "hollow" ? "hollow" : "brindle") !== this.map.id) {
      freeLock(character.account_id, lock);
      throw new ServerError(421, ZONE_ERROR + (fresh?.zone ?? "brindle"));
    }
    return { character: fresh, lock };
  }

  /** bodies somebody is about to step back into */
  private claimed = new Set<string>();

  onJoin(client: Client, _options: unknown, auth: AuthData) {
    // Never go on with data read before the lock was lost: that could bring back spent items.
    if (!holdsLock(auth.character.account_id, auth.lock)) throw new ServerError(409, "เข้าโลกไม่ทันเวลา ลองใหม่อีกครั้ง");
    auth.lock.pending = false;
    if (auth.takeOver) {
      if (!this.resumeBody(client, auth.takeOver)) throw new ServerError(409, "เข้าโลกไม่ทันเวลา ลองใหม่อีกครั้ง");
      return;
    }
    const c = auth.character;
    const p = new Player();
    p.name = c.name;
    p.color = c.color;
    p.level = Math.min(MAX_LEVEL, Math.max(1, c.level));
    p.exp = c.exp;
    p.job = c.job === "squire" ? "squire" : "wanderer";
    try {
      const skills = JSON.parse(c.skills) as Record<string, number>;
      for (const [k, v] of Object.entries(skills)) if (SKILLS[k] && v > 0) p.skills.set(k, Math.min(v, SKILLS[k].maxLevel));
    } catch {
      /* bad JSON: no skills */
    }
    let savedNodes: unknown = [];
    try {
      savedNodes = JSON.parse(c.nodes);
    } catch {
      /* bad JSON: no nodes */
    }
    const nodes = cleanNodes(savedNodes, p.level, p.job);
    let savedInv: unknown = null;
    try {
      savedInv = JSON.parse(c.inv);
    } catch {
      /* bad JSON: empty bag */
    }
    const inv = cleanInventory(savedInv);
    const worn = equipTotals(inv.equip);
    const mods = passiveMods(nodes, worn.mods);
    this.showGear(p, inv);
    this.applyStats(p, { mods, gear: worn.flat }, true);
    const saved = { x: Math.round(c.x), y: Math.round(c.y) };
    const spot = c.x >= 0 && isWalkable(this.map, saved.x, saved.y) ? saved : this.findSpawn();
    p.x = spot.x;
    p.y = spot.y;
    p.facing = Math.floor(Math.random() * 8);
    this.state.players.set(client.sessionId, p);
    this.ctl.set(client.sessionId, {
      accountId: c.account_id,
      lock: auth.lock,
      leaving: false,
      lingerUntil: 0,
      corruption: this.map.pvp ? Math.max(0, Math.min(100, c.corruption)) : 0,
      shieldUntil: this.map.pvp ? this.clock.currentTime + PROTECT_MS : 0,
      stunUntil: 0,
      path: [],
      lastChatAt: 0,
      targetId: null,
      repathAt: 0,
      nextAttackAt: 0,
      lastCombatAt: 0,
      pendingSkill: null,
      cooldowns: new Map(),
      guardUntil: 0,
      guardReduce: 0,
      charge: null,
      deadAt: 0,
      regen: 0,
      gold: Math.max(0, c.gold),
      nodes,
      inv,
      mods,
      gear: worn.flat,
      interact: null,
      struck: new Set(),
    });
    p.shielded = this.map.pvp;
    p.corruption = this.map.pvp ? Math.floor(Math.max(0, Math.min(100, c.corruption))) : 0;
    this.broadcastSystem(this.map.pvp ? `มีใครบางคนก้าวเข้ามาใน Hollow` : `${p.name} เดินทางมาถึงหมู่บ้านบรินเดิล`);
    console.log(`[world] join ${p.name} (${client.sessionId}), online ${this.clients.length}`);
  }

  async onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    const c = this.ctl.get(client.sessionId);
    if (!p || !c || c.leaving) return; // already gone (travelled)
    if (this.map.pvp && !p.dead) {
      // no logging out to escape: the body stays a while (GDD 3.3)
      c.lingerUntil = this.clock.currentTime + LINGER_MS;
      p.offline = true;
      c.path = [];
      p.moving = false;
      c.targetId = null;
      c.pendingSkill = null;
      c.charge = null;
      c.interact = null;
      await this.save(p, c).catch((e) => console.error("[world] save failed", e));
      return;
    }
    await this.logOut(client.sessionId, p, c);
  }

  /** The character really leaves the world. */
  private async logOut(id: string, p: Player, c: PlayerCtl) {
    c.leaving = true;
    await this.save(p, c).catch((e) => console.error("[world] save failed", e));
    this.state.players.delete(id);
    this.ctl.delete(id);
    this.monsterSys.forget(id);
    freeLock(c.accountId, c.lock);
    if (!this.map.pvp) this.broadcastSystem(`${p.name} ออกจากเกมแล้ว`);
    console.log(`[${this.map.id}] leave ${p.name}, online ${this.clients.length}`);
  }

  /** Back in the game before the body was gone: same body, new connection. */
  private resumeBody(client: Client, oldId: string): boolean {
    this.claimed.delete(oldId);
    const p = this.state.players.get(oldId);
    const c = this.ctl.get(oldId);
    if (!p || !c || c.leaving) return false;
    this.state.players.delete(oldId);
    this.ctl.delete(oldId);
    const fresh = p.clone();
    fresh.offline = false;
    c.lingerUntil = 0;
    this.state.players.set(client.sessionId, fresh);
    this.ctl.set(client.sessionId, c);
    this.monsterSys.forget(oldId);
    return true;
  }

  // ---- travelling between maps ----------------------------------------------

  /** Saves the character as being in another map and sends the player there. */
  private async travel(client: Client, p: Player, c: PlayerCtl, zone: ZoneId, at: Point = { x: -1, y: -1 }) {
    if (c.leaving) return;
    c.leaving = true;
    const id = client.sessionId;
    c.corruption = 0;
    try {
      await saveCharacter({ ...this.rowOf(p, c), zone, x: at.x, y: at.y });
    } catch (e) {
      console.error("[world] travel save failed", e);
      c.leaving = false;
      return;
    }
    this.state.players.delete(id);
    this.ctl.delete(id);
    this.monsterSys.forget(id);
    client.send(Msg.Travel, { zone, ticket: makeTicket(c.accountId, zone) } satisfies TravelEvent);
  }

  private handleEnterHollow(client: Client) {
    const pc = this.nearStation(client, "portal");
    if (!pc) return;
    if (pc.p.level < HOLLOW_MIN_LEVEL) return client.send(Msg.Notice, { text: `ต้องถึงเลเวล ${HOLLOW_MIN_LEVEL} ก่อนจึงเข้า Hollow ได้` });
    if (pc.c.lastCombatAt > 0 && this.clock.currentTime - pc.c.lastCombatAt < OUT_OF_COMBAT_MS)
      return client.send(Msg.Notice, { text: "เข้าระหว่างต่อสู้ไม่ได้" });
    this.travel(client, pc.p, pc.c, "hollow");
  }

  private moveGates(announce: boolean) {
    const { gateSpots } = this.map as HollowMap;
    const before = this.state.gates.map((g) => ({ x: g.x, y: g.y }));
    this.state.gates.clear();
    for (const spot of pickGates(gateSpots, before)) {
      const g = new Gate();
      g.x = spot.x;
      g.y = spot.y;
      this.state.gates.push(g);
    }
    this.state.gatesUntil = Date.now() + GATE_MOVE_MS;
    if (announce) this.broadcastSystem("ประตูทางออกย้ายที่แล้ว!");
  }

  // ---- treasure bundles -------------------------------------------------------

  private addBundle(id: string, b: BundleCtl) {
    this.bundles.set(id, b);
    const s = new Bundle();
    s.x = b.x;
    s.y = b.y;
    s.owner = b.owner;
    this.state.bundles.set(id, s);
  }

  private removeBundle(id: string) {
    this.bundles.delete(id);
    this.state.bundles.delete(id);
  }

  /** Dead in the Hollow: everything worn and carried falls down, and 30% of it is destroyed. */
  private dropEverything(p: Player, c: PlayerCtl) {
    const all = [...Object.values(c.inv.equip), ...c.inv.bag].filter((s): s is ItemStack => !!s);
    c.inv.equip = {};
    c.inv.bag = [];
    const worn = equipTotals(c.inv.equip);
    c.mods = passiveMods(c.nodes, worn.mods);
    c.gear = worn.flat;
    this.showGear(p, c.inv);
    this.applyStats(p, c, false);
    const items = destroyPart(all);
    if (!items.length) {
      this.save(p, c).catch((e) => console.error("[world] save failed", e));
      return all.length;
    }
    const id = globalThis.crypto.randomUUID();
    const b: BundleCtl = { items, owner: p.name, x: Math.round(p.x), y: Math.round(p.y), expires: Date.now() + BUNDLE_MS };
    this.addBundle(id, b);
    saveWithBundle(this.rowOf(p, c), { put: this.bundleRow(id, b) }).catch((e) => console.error("[world] bundle save failed", e));
    return all.length;
  }

  private bundleRow(id: string, b: BundleCtl) {
    return { id, zone: this.map.id, x: b.x, y: b.y, owner: b.owner, items: JSON.stringify(b.items), expires: b.expires };
  }

  private handleLootBundle(client: Client, msg: unknown) {
    const pc = this.get(client);
    const id = (msg as { id?: unknown } | null)?.id;
    const b = typeof id === "string" ? this.bundles.get(id) : undefined;
    if (!pc || !b || pc.p.dead || pc.c.charge) return;
    const { p, c } = pc;
    c.shieldUntil = 0;
    const rest = findPath(this.map, planFrom(p, c.path), { x: b.x, y: b.y }, MAX_PATH_STEPS);
    if (!rest) return;
    this.stopInteract(client, c);
    c.targetId = null;
    c.pendingSkill = null;
    c.path = c.path.length ? [c.path[0], ...rest] : rest;
    c.interact = { x: b.x, y: b.y, res: null, station: null, bundle: id as string, doneAt: 0 };
  }

  /** Takes what fits; the bundle and the character are saved together. */
  private takeBundle(client: Client, p: Player, c: PlayerCtl, id: string) {
    const b = this.bundles.get(id);
    if (!b) return;
    const got: { id: string; qty: number }[] = [];
    for (const s of [...b.items]) {
      const before = s.qty;
      if (!moveStack(b.items, c.inv.bag, BAG_SIZE, s.uid)) continue;
      const left = b.items.find((x) => x.uid === s.uid)?.qty ?? 0;
      got.push({ id: s.id, qty: before - left });
    }
    if (!got.length) return client.send(Msg.Notice, { text: "กระเป๋าเต็ม" });
    if (b.items.length) client.send(Msg.Notice, { text: "กระเป๋าเต็ม เก็บของในห่อได้ไม่หมด" });
    else this.removeBundle(id);
    client.send(Msg.Loot, { items: got.slice(0, 6) } satisfies LootEvent);
    client.send(Msg.Notice, { text: `เก็บห่อสมบัติของ ${b.owner} ได้ ${got.length} อย่าง` });
    this.sendPrivate(client);
    saveWithBundle(this.rowOf(p, c), b.items.length ? { put: this.bundleRow(id, b) } : { remove: id }).catch((e) =>
      console.error("[world] bundle save failed", e),
    );
  }

  async onDispose() {
    await this.saveAll();
  }

  private async save(p: Player, c: PlayerCtl) {
    await saveCharacter(this.rowOf(p, c));
  }

  private rowOf(p: Player, c: PlayerCtl): CharacterSave {
    const tile = { x: Math.round(p.x), y: Math.round(p.y) };
    const ok = !p.dead && isWalkable(this.map, tile.x, tile.y);
    return {
      account_id: c.accountId,
      level: p.level,
      exp: p.exp,
      job: p.job,
      skills: JSON.stringify(Object.fromEntries(p.skills.entries())),
      nodes: JSON.stringify([...c.nodes]),
      gold: c.gold,
      inv: JSON.stringify(c.inv),
      // the dead wake up in the village
      zone: p.dead ? "brindle" : this.map.id,
      corruption: p.dead ? 0 : c.corruption,
      x: ok ? tile.x : -1,
      y: ok ? tile.y : -1,
    };
  }

  private async saveAll() {
    for (const [id, p] of this.state.players) {
      const c = this.ctl.get(id);
      if (c && !c.leaving) await this.save(p, c).catch((e) => console.error("[world] autosave failed", e));
    }
  }

  private findSpawn(): Point {
    const { entries } = this.map as Partial<HollowMap>;
    const spawn = entries?.length ? entries[Math.floor(Math.random() * entries.length)] : this.map.spawn;
    for (let tries = 0; tries < 50; tries++) {
      const x = spawn.x + Math.floor(Math.random() * 5) - 2;
      const y = spawn.y + Math.floor(Math.random() * 5) - 2;
      if (isWalkable(this.map, x, y)) return { x, y };
    }
    return { ...spawn };
  }

  // ---- stats --------------------------------------------------------------

  private applyStats(p: Player, c: Pick<PlayerCtl, "mods" | "gear">, heal: boolean) {
    const s = playerStats(p.level, p.job as Job, c.mods, c.gear);
    p.maxHp = s.maxHp;
    p.hp = heal ? s.maxHp : Math.min(p.hp, s.maxHp);
  }

  private statsOf(p: Player, c: PlayerCtl) {
    return playerStats(p.level, p.job as Job, c.mods, c.gear);
  }

  private sendPrivate(client: Client | undefined) {
    const c = client && this.ctl.get(client.sessionId);
    if (!c) return;
    const data: PrivateData = { gold: c.gold, nodes: [...c.nodes], inv: c.inv };
    client.send(Msg.Private, data);
  }

  private showGear(p: Player, inv: Inventory) {
    p.weapon = inv.equip.weapon?.id ?? "";
    p.helm = inv.equip.head?.id ?? "";
  }

  /** Nodes or gear changed: work out bonuses again, tell the player, save. */
  private buildChanged(client: Client, p: Player, c: PlayerCtl) {
    const worn = equipTotals(c.inv.equip);
    c.mods = passiveMods(c.nodes, worn.mods);
    c.gear = worn.flat;
    this.showGear(p, c.inv);
    this.applyStats(p, c, false);
    this.itemsChanged(client, p, c);
  }

  /** Items or coins changed: tell the player and save (one row, so nothing is doubled or lost). */
  private itemsChanged(client: Client, p: Player, c: PlayerCtl) {
    this.sendPrivate(client);
    this.save(p, c).catch((e) => console.error("[world] save failed", e));
  }

  private skillPointsLeft(p: Player) {
    let spent = 0;
    p.skills.forEach((v) => (spent += v));
    return skillPointsEarned(p.level) - spent;
  }

  private gainExp(client: Client | undefined, p: Player, c: PlayerCtl, amount: number) {
    if (p.level >= MAX_LEVEL) return;
    p.exp += amount;
    client?.send(Msg.ExpGain, { amount });
    let leveled = false;
    while (p.level < MAX_LEVEL && p.exp >= expToNext(p.level)) {
      p.exp -= expToNext(p.level);
      p.level++;
      leveled = true;
    }
    if (p.level >= MAX_LEVEL) p.exp = 0;
    if (leveled) {
      this.applyStats(p, c, true);
      const id = client?.sessionId ?? "";
      this.broadcast(Msg.LevelUp, { id, level: p.level });
      if (p.level === JOB_CHANGE_LEVEL && p.job === "wanderer")
        client?.send(Msg.Notice, { text: "ถึงเลเวล 10 แล้ว! กดปุ่ม \"เปลี่ยนอาชีพ\" เพื่อเป็นสไควร์" });
      this.save(p, c).catch(() => {});
    }
  }

  // ---- messages -----------------------------------------------------------

  private get = (client: Client) => {
    const p = this.state.players.get(client.sessionId);
    const c = this.ctl.get(client.sessionId);
    return p && c && !c.leaving ? { p, c } : null;
  };

  private handleMove(client: Client, msg: unknown) {
    const pc = this.get(client);
    if (!pc || pc.p.dead || pc.c.charge || typeof msg !== "object" || msg === null) return;
    const gx = Math.floor(Number((msg as Point).x));
    const gy = Math.floor(Number((msg as Point).y));
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;
    pc.c.targetId = null;
    pc.c.pendingSkill = null;
    this.stopInteract(client, pc.c);
    // Plan from the tile we are standing on, or the tile we are stepping into.
    const from = planFrom(pc.p, pc.c.path);
    const rest = findPath(this.map, from, { x: gx, y: gy }, MAX_PATH_STEPS);
    if (!rest) return; // unreachable or blocked: ignore the click
    pc.c.path = pc.c.path.length ? [pc.c.path[0], ...rest] : rest;
  }

  private handleAttack(client: Client, msg: unknown) {
    const pc = this.get(client);
    const id = (msg as { id?: unknown })?.id;
    if (!pc || pc.p.dead || pc.c.charge || typeof id !== "string" || !this.targetOf(client.sessionId, id)) return;
    this.stopInteract(client, pc.c);
    pc.c.targetId = id;
    pc.c.pendingSkill = null;
    pc.c.repathAt = 0;
  }

  private handleSkill(client: Client, msg: unknown) {
    const pc = this.get(client);
    if (!pc || pc.p.dead || pc.c.charge) return;
    const { p, c } = pc;
    const skill = (msg as { skill?: unknown })?.skill as SkillId;
    const def = typeof skill === "string" ? SKILLS[skill] : undefined;
    if (!def) return;
    const lvl = p.skills.get(skill) ?? 0;
    if (def.job !== p.job || lvl <= 0) return client.send(Msg.Notice, { text: `ยังไม่ได้เรียนสกิล ${def.name}` });
    const now = this.clock.currentTime;
    if ((c.cooldowns.get(skill) ?? 0) > now) return client.send(Msg.Notice, { text: `${def.name} ยังไม่พร้อม` });

    if (skill === "guard") {
      c.guardUntil = now + (def.durationMs ?? 6000);
      c.guardReduce = (def.reduce ?? 0.3) + (def.reducePerLevel ?? 0) * (lvl - 1);
      p.guarding = true;
      this.startCooldown(client, c, skill, def.cooldownMs);
      return;
    }

    const targetId = typeof (msg as any)?.target === "string" ? (msg as any).target : c.targetId;
    const m = targetId ? this.targetOf(client.sessionId, targetId) : undefined;
    if (!m || !targetId) return client.send(Msg.Notice, { text: "เลือกเป้าหมายก่อน (คลิกที่มอนสเตอร์)" });
    this.stopInteract(client, c);

    if (skill === "charge") {
      if (dist(p, m) > def.range + 0.5) return client.send(Msg.Notice, { text: "เป้าหมายไกลเกินไป" });
      const path = findPath(this.map, planFrom(p, c.path), { x: Math.round(m.x), y: Math.round(m.y) }, 12);
      if (!path) return client.send(Msg.Notice, { text: "พุ่งไปไม่ได้ มีสิ่งกีดขวาง" });
      c.path = c.path.length ? [c.path[0], ...path] : path;
      c.targetId = targetId;
      c.charge = {
        targetId,
        power: def.power ?? 1,
        stunMs: (def.stunMs ?? 1000) + (def.stunPerLevelMs ?? 0) * (lvl - 1),
      };
      this.startCooldown(client, c, skill, def.cooldownMs);
      return;
    }

    // heavy_strike: walk into range, then strike (see tick)
    c.targetId = targetId;
    c.pendingSkill = skill;
    c.repathAt = 0;
  }

  private startCooldown(client: Client, c: PlayerCtl, skill: string, baseMs: number) {
    const ms = Math.round(baseMs * (1 - c.mods.cdrPct / 100));
    c.cooldowns.set(skill, this.clock.currentTime + ms);
    const ev: CooldownEvent = { skill, ms };
    client.send(Msg.Cooldown, ev);
  }

  private handleLearn(client: Client, msg: unknown) {
    const pc = this.get(client);
    if (!pc) return;
    const skill = (msg as { skill?: unknown })?.skill;
    const def = typeof skill === "string" ? SKILLS[skill] : undefined;
    if (!def || def.job !== pc.p.job) return;
    const lvl = pc.p.skills.get(skill as string) ?? 0;
    if (lvl >= def.maxLevel || this.skillPointsLeft(pc.p) <= 0) return;
    pc.p.skills.set(skill as string, lvl + 1);
  }

  private handleChangeJob(client: Client) {
    const pc = this.get(client);
    if (!pc || pc.p.job !== "wanderer") return;
    if (pc.p.level < JOB_CHANGE_LEVEL) return client.send(Msg.Notice, { text: `ต้องถึงเลเวล ${JOB_CHANGE_LEVEL} ก่อน` });
    pc.p.job = "squire";
    this.applyStats(pc.p, pc.c, true);
    this.broadcastSystem(`${pc.p.name} ได้เป็น${JOB_NAMES.squire}แล้ว!`);
    this.save(pc.p, pc.c).catch(() => {});
  }

  // ---- gathering, items and crafting ---------------------------------------

  private stopInteract(client: Client | undefined, c: PlayerCtl) {
    if (c.interact?.doneAt) client?.send(Msg.Gathering, { ms: 0 } satisfies GatheringEvent);
    c.interact = null;
  }

  /** Walk next to a rock, tree, anvil or chest; the tick does the rest. */
  private handleInteract(client: Client, msg: unknown) {
    const pc = this.get(client);
    if (!pc || pc.p.dead || pc.c.charge) return;
    const { p, c } = pc;
    const x = Math.floor(Number((msg as Point | null)?.x));
    const y = Math.floor(Number((msg as Point | null)?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const res = resourceAt(this.map, x, y);
    const station = stationAt(this.map, x, y);
    if (!res && !station) return;
    if (res && !countItem(c.inv.bag, res.tool))
      return client.send(Msg.Notice, { text: `ต้องมี${ITEMS[res.tool].name}ในกระเป๋า (ซื้อได้ที่ช่างตีเหล็กในหมู่บ้าน)` });
    if (res && this.state.depleted.has(`${x},${y}`)) return client.send(Msg.Notice, { text: `${res.name}หมดแล้ว รอสักครู่` });

    const from = planFrom(p, c.path);
    const spots: Point[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isWalkable(this.map, x + dx, y + dy)) spots.push({ x: x + dx, y: y + dy });
    spots.sort((a, b) => dist(a, from) - dist(b, from));
    for (const spot of spots) {
      const rest = findPath(this.map, from, spot, MAX_PATH_STEPS);
      if (!rest) continue;
      this.stopInteract(client, c);
      c.targetId = null;
      c.pendingSkill = null;
      c.path = c.path.length ? [c.path[0], ...rest] : rest;
      c.interact = { x, y, res, station, bundle: null, doneAt: 0 };
      return;
    }
  }

  /** Standing still next to the thing we walked to. */
  private tickInteract(id: string, p: Player, c: PlayerCtl, now: number) {
    const it = c.interact!;
    const client = this.clients.find((cl) => cl.sessionId === id);
    if (!client || dist(p, it) > 1.6) return this.stopInteract(client, c);
    faceTowards(p, it);
    if (it.station) {
      client.send(Msg.OpenStation, { kind: it.station } satisfies OpenStationEvent);
      c.interact = null;
      return;
    }
    if (it.bundle) {
      if (!this.bundles.has(it.bundle)) return this.stopInteract(client, c);
      if (!it.doneAt) {
        it.doneAt = now + 1500;
        client.send(Msg.Gathering, { ms: 1500, name: "ห่อสมบัติ" } satisfies GatheringEvent);
      } else if (now >= it.doneAt) {
        const id = it.bundle;
        this.stopInteract(client, c);
        this.takeBundle(client, p, c, id);
      }
      return;
    }
    const res = it.res!;
    const key = `${it.x},${it.y}`;
    if (this.state.depleted.has(key)) {
      client.send(Msg.Notice, { text: "มีคนเก็บไปก่อนแล้ว" });
      return this.stopInteract(client, c);
    }
    if (!it.doneAt) {
      it.doneAt = now + GATHER_MS;
      client.send(Msg.Gathering, { ms: GATHER_MS, name: res.name } satisfies GatheringEvent);
      return;
    }
    if (now < it.doneAt) return;
    this.stopInteract(client, c);
    const qty = res.qty[0] + Math.floor(Math.random() * (res.qty[1] - res.qty[0] + 1));
    if (!this.giveLoot(client, p, c, [{ id: res.item, qty }])) return; // bag full: leave the rock for later
    this.state.depleted.set(key, true);
    this.depletedUntil.set(key, now + res.respawnMs);
    this.itemsChanged(client, p, c);
  }

  /** Puts items in the bag and shows them. False when nothing fitted. */
  private giveLoot(client: Client | undefined, _p: Player, c: PlayerCtl, items: { id: string; qty: number }[]): boolean {
    const got: { id: string; qty: number }[] = [];
    let full = false;
    for (const it of items) {
      const left = addItem(c.inv.bag, BAG_SIZE, it.id, it.qty);
      if (left < it.qty) got.push({ id: it.id, qty: it.qty - left });
      if (left > 0) full = true;
    }
    if (full) client?.send(Msg.Notice, { text: "กระเป๋าเต็ม เก็บของได้ไม่หมด" });
    if (got.length) client?.send(Msg.Loot, { items: got } satisfies LootEvent);
    return got.length > 0;
  }

  private nearStation(client: Client, kind: StationKind) {
    const pc = this.get(client);
    if (!pc || pc.p.dead) return null;
    const at = findStation(this.map, kind);
    if (!at || dist(pc.p, at) > STATION_RANGE) {
      client.send(Msg.Notice, { text: "อยู่ไกลเกินไป เดินเข้าไปใกล้ก่อน" });
      return null;
    }
    return pc;
  }

  private handleEquip(client: Client, msg: unknown) {
    const pc = this.get(client);
    const uid = (msg as { uid?: unknown } | null)?.uid;
    if (!pc || pc.p.dead || typeof uid !== "string") return;
    const err = equipItem(pc.c.inv, uid, pc.p.level);
    if (err) return client.send(Msg.Notice, { text: err });
    this.buildChanged(client, pc.p, pc.c);
  }

  private handleUnequip(client: Client, msg: unknown) {
    const pc = this.get(client);
    const slot = (msg as { slot?: unknown } | null)?.slot as Slot;
    if (!pc || pc.p.dead || !SLOTS.includes(slot)) return;
    const err = unequipItem(pc.c.inv, slot);
    if (err) return client.send(Msg.Notice, { text: err });
    this.buildChanged(client, pc.p, pc.c);
  }

  private handleCraft(client: Client, msg: unknown) {
    const item = (msg as { item?: unknown } | null)?.item;
    if (typeof item !== "string") return;
    const pc = this.nearStation(client, "smith");
    if (!pc) return;
    const r = craft(pc.c.inv, item, (msg as { crystal?: unknown }).crystal === true, pc.p.name);
    if ("error" in r) return client.send(Msg.Notice, { text: r.error });
    client.send(Msg.Notice, { text: `ตีได้ ${stackName(r.made)}${r.skillUp ? ` ฝีมือช่างเพิ่มเป็น ${pc.c.inv.smithing}` : ""}` });
    if (r.made.quality === 3) this.broadcastSystem(`${pc.p.name} ตี${ITEMS[r.made.id].name}ได้เป็นผลงานชิ้นเอก!`);
    this.itemsChanged(client, pc.p, pc.c);
  }

  private handleBuy(client: Client, msg: unknown) {
    const item = (msg as { item?: unknown } | null)?.item;
    const def = typeof item === "string" && Object.hasOwn(ITEMS, item) ? ITEMS[item] : undefined;
    if (!def?.buy) return;
    const pc = this.nearStation(client, "smith");
    if (!pc) return;
    const { p, c } = pc;
    if (c.gold < def.buy) return client.send(Msg.Notice, { text: `เหรียญไม่พอ ต้องใช้ ${def.buy} เหรียญ` });
    if (addItem(c.inv.bag, BAG_SIZE, item as string, 1) > 0) return client.send(Msg.Notice, { text: "กระเป๋าเต็ม" });
    c.gold -= def.buy;
    this.itemsChanged(client, p, c);
  }

  private handleSell(client: Client, msg: unknown) {
    const uid = (msg as { uid?: unknown } | null)?.uid;
    if (typeof uid !== "string") return;
    const pc = this.nearStation(client, "smith");
    if (!pc) return;
    const { p, c } = pc;
    const i = c.inv.bag.findIndex((s) => s.uid === uid);
    if (i < 0) return;
    const [s] = c.inv.bag.splice(i, 1);
    c.gold += sellPrice(s) * s.qty;
    this.itemsChanged(client, p, c);
  }

  private handleMoveStack(client: Client, msg: unknown, deposit: boolean) {
    const uid = (msg as { uid?: unknown } | null)?.uid;
    if (typeof uid !== "string") return;
    const pc = this.nearStation(client, "storage");
    if (!pc) return;
    const { bag, storage } = pc.c.inv;
    const ok = deposit ? moveStack(bag, storage, STORAGE_SIZE, uid) : moveStack(storage, bag, BAG_SIZE, uid);
    if (!ok) return client.send(Msg.Notice, { text: deposit ? "คลังเต็ม" : "กระเป๋าเต็ม" });
    this.itemsChanged(client, pc.p, pc.c);
  }

  private handleLearnPassive(client: Client, msg: unknown) {
    const pc = this.get(client);
    const id = (msg as { id?: unknown })?.id;
    if (!pc || typeof id !== "string") return;
    const { p, c } = pc;
    if (c.nodes.size >= passivePointsEarned(p.level)) return client.send(Msg.Notice, { text: "ไม่มีแต้มต้นไม้เหลือ" });
    if (!canReach(id, c.nodes, p.job)) return;
    c.nodes.add(id);
    this.buildChanged(client, p, c);
  }

  private handleRefundPassive(client: Client, msg: unknown) {
    const pc = this.get(client);
    const id = (msg as { id?: unknown })?.id;
    if (!pc || pc.p.dead || typeof id !== "string") return;
    const { p, c } = pc;
    if (!c.nodes.has(id)) return;
    if (this.clock.currentTime - c.lastCombatAt < OUT_OF_COMBAT_MS && c.lastCombatAt > 0)
      return client.send(Msg.Notice, { text: "ล้างแต้มระหว่างต่อสู้ไม่ได้" });
    if (!canRefund(id, c.nodes, p.job)) return client.send(Msg.Notice, { text: "โหนดนี้เป็นทางผ่านของโหนดอื่น ล้างโหนดปลายทางก่อน" });
    const cost = refundCost(p.level);
    if (c.gold < cost) return client.send(Msg.Notice, { text: `เหรียญไม่พอ ต้องใช้ ${cost} เหรียญ` });
    c.gold -= cost;
    c.nodes.delete(id);
    this.buildChanged(client, p, c);
    client.send(Msg.Notice, { text: `ล้างโหนด ${PASSIVES.get(id)?.name ?? ""} แล้ว เสีย ${cost} เหรียญ` });
  }

  private handleRespawn(client: Client) {
    const pc = this.get(client);
    if (!pc || !pc.p.dead) return;
    if (this.clock.currentTime - pc.c.deadAt < RESPAWN_DELAY_MS) return;
    if (this.map.id !== "brindle") {
      pc.p.hp = pc.p.maxHp;
      this.travel(client, pc.p, pc.c, "brindle");
      return;
    }
    const spot = this.findSpawn();
    pc.p.x = spot.x;
    pc.p.y = spot.y;
    pc.p.dead = false;
    pc.p.hp = pc.p.maxHp;
    pc.c.path = [];
  }

  private handleChat(client: Client, msg: unknown) {
    const pc = this.get(client);
    if (!pc) return;
    const text = cleanChat((msg as { text?: unknown })?.text, CHAT_MAX);
    if (!text) return;
    const now = Date.now();
    if (now - pc.c.lastChatAt < CHAT_COOLDOWN_MS) {
      client.send(Msg.Notice, { text: "พิมพ์เร็วไปนิด รอสักครู่นะ" });
      return;
    }
    pc.c.lastChatAt = now;
    const line: ChatLine = { from: client.sessionId, name: pc.p.name, text };
    this.broadcast(Msg.ChatLine, line);
  }

  private broadcastSystem(text: string) {
    const line: ChatLine = { from: "", name: "", text, system: true };
    this.broadcast(Msg.ChatLine, line);
  }

  // ---- combat -------------------------------------------------------------

  /** A monster, or (in the Hollow) another player that may be attacked. */
  private targetOf(me: string, id: string): { x: number; y: number } | undefined {
    const m = this.state.monsters.get(id);
    if (m) return m;
    if (!this.map.pvp || id === me) return undefined;
    const p = this.state.players.get(id);
    const c = this.ctl.get(id);
    return p && c && !p.dead && !c.leaving && c.shieldUntil <= this.clock.currentTime ? p : undefined;
  }

  private nearestPlayer(x: number, y: number, range: number): string | null {
    let best: string | null = null;
    let bestD = range;
    this.state.players.forEach((p, id) => {
      const ct = this.ctl.get(id);
      if (p.dead || !ct || ct.leaving || ct.shieldUntil > this.clock.currentTime || isSafe(this.map, p.x, p.y)) return;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bestD) {
        bestD = d;
        best = id;
      }
    });
    return best;
  }

  private monsterHitsPlayer(monsterId: string, playerId: string, atk: number) {
    const p = this.state.players.get(playerId);
    const c = this.ctl.get(playerId);
    if (!p || !c || p.dead || c.leaving) return;
    const now = this.clock.currentTime;
    if (c.shieldUntil > now) return;
    c.lastCombatAt = now;
    if (Math.random() * 100 < c.mods.dodge) {
      const ev: HitEvent = { from: monsterId, to: playerId, dmg: 0, miss: true };
      this.broadcast(Msg.Hit, ev);
      return;
    }
    const crit = Math.random() < CRIT_CHANCE;
    let dmg = hitDamage(atk, this.statsOf(p, c).def, 1, Math.random(), crit);
    dmg = Math.max(1, Math.round(dmg * (1 - c.mods.dmgReduce / 100)));
    if (c.guardUntil > now) dmg = Math.max(1, Math.round(dmg * (1 - c.guardReduce)));
    p.hp = Math.max(0, p.hp - dmg);
    const killed = p.hp <= 0;
    const ev: HitEvent = { from: monsterId, to: playerId, dmg, crit, killed };
    this.broadcast(Msg.Hit, ev);
    if (killed) this.playerDies(playerId, p, c, MONSTERS[this.state.monsters.get(monsterId)?.kind ?? ""]?.name ?? "มอนสเตอร์");
  }

  private playerDies(id: string, p: Player, c: PlayerCtl, killer: string) {
    p.dead = true;
    p.moving = false;
    p.guarding = false;
    c.path = [];
    c.targetId = null;
    c.pendingSkill = null;
    c.charge = null;
    this.stopInteract(this.clients.find((cl) => cl.sessionId === id), c);
    c.deadAt = this.clock.currentTime;
    this.monsterSys.forget(id);
    const client = this.clients.find((cl) => cl.sessionId === id);
    if (this.map.pvp) {
      // full loot instead of EXP loss (GDD 3.1)
      const n = this.dropEverything(p, c);
      this.sendPrivate(client);
      client?.send(Msg.Notice, { text: `คุณถูก${killer}ล้ม ของ ${n} ช่องตกอยู่ใน Hollow` });
      this.broadcastSystem(`${p.name} ถูก${killer}ล้มใน Hollow`);
      if (!client) this.logOut(id, p, c).catch((e) => console.error("[world] save failed", e));
      return;
    }
    const loss = Math.floor(expToNext(p.level) * DEATH_EXP_LOSS);
    p.exp = Math.max(0, p.exp - loss);
    client?.send(Msg.Notice, { text: `คุณหมดสติ เสีย EXP ${loss}` });
  }

  /** Crit chance against this target, counting the "first strike" keystone. */
  private critChance(c: PlayerCtl, targetId: string) {
    let chance = CRIT_CHANCE + c.mods.critChance / 100;
    if (c.mods.firststrike) chance = c.struck.has(targetId) ? chance * 0.5 : 1;
    if (c.struck.size > 100)
      for (const s of c.struck) if (!this.state.monsters.has(s) && !this.state.players.has(s)) c.struck.delete(s);
    c.struck.add(targetId);
    return chance;
  }

  /** Attack power of this swing after skill and low-health bonuses. */
  private boosted(p: Player, c: PlayerCtl, power: number, skill?: string) {
    let boost = power;
    if (skill) boost *= 1 + c.mods.skillDmgPct / 100;
    if (p.hp < p.maxHp / 2) boost *= 1 + c.mods.lowHpDmgPct / 100;
    return boost;
  }

  private lifesteal(p: Player, c: PlayerCtl, dealt: number) {
    if (c.mods.lifesteal > 0) p.hp = Math.min(p.maxHp, p.hp + Math.round((dealt * c.mods.lifesteal) / 100));
  }

  /** A player lands a hit on whatever it is. */
  private playerHits(id: string, p: Player, c: PlayerCtl, targetId: string, power: number, skill?: string, stunMs = 0) {
    if (this.state.monsters.has(targetId)) this.playerHitsMonster(id, p, c, targetId, power, skill, stunMs);
    else this.playerHitsPlayer(id, p, c, targetId, power, skill, stunMs);
  }

  private playerHitsPlayer(id: string, p: Player, c: PlayerCtl, targetId: string, power: number, skill?: string, stunMs = 0) {
    if (!this.targetOf(id, targetId)) return;
    const t = this.state.players.get(targetId)!;
    const tc = this.ctl.get(targetId)!;
    const now = this.clock.currentTime;
    faceTowards(p, t);
    c.lastCombatAt = tc.lastCombatAt = now;
    c.shieldUntil = 0; // whoever attacks gives up the arrival shield
    if (Math.random() * 100 < tc.mods.dodge) {
      this.broadcast(Msg.Hit, { from: id, to: targetId, dmg: 0, miss: true } satisfies HitEvent);
      return;
    }
    const crit = Math.random() < this.critChance(c, targetId);
    let dmg = hitDamage(this.statsOf(p, c).atk, this.statsOf(t, tc).def, this.boosted(p, c, power, skill), Math.random(), crit);
    dmg *= PVP_DAMAGE * (1 - tc.mods.dmgReduce / 100);
    if (tc.guardUntil > now) dmg *= 1 - tc.guardReduce;
    dmg = Math.max(1, Math.round(dmg));
    this.lifesteal(p, c, Math.min(dmg, t.hp));
    t.hp = Math.max(0, t.hp - dmg);
    if (stunMs > 0) tc.stunUntil = Math.max(tc.stunUntil, now + stunMs / 2);
    const killed = t.hp <= 0;
    this.broadcast(Msg.Hit, { from: id, to: targetId, dmg, crit, skill, killed } satisfies HitEvent);
    if (killed) {
      c.targetId = null;
      c.pendingSkill = null;
      c.struck.delete(targetId);
      this.playerDies(targetId, t, tc, p.name);
    }
  }

  /** A player lands a hit on a monster. */
  private playerHitsMonster(id: string, p: Player, c: PlayerCtl, monsterId: string, power: number, skill?: string, stunMs = 0) {
    const m = this.state.monsters.get(monsterId);
    const mc = this.monsterSys.ctl.get(monsterId);
    if (!m || !mc) return;
    faceTowards(p, m);
    const crit = Math.random() < this.critChance(c, monsterId);
    const dmg = hitDamage(this.statsOf(p, c).atk, mc.def_, this.boosted(p, c, power, skill), Math.random(), crit);
    c.lastCombatAt = this.clock.currentTime;
    c.shieldUntil = 0;
    // life steal counts only damage the monster could still take
    this.lifesteal(p, c, Math.min(dmg, m.hp));
    const level = m.level;
    const killed = this.monsterSys.takeDamage(monsterId, id, dmg, stunMs);
    const ev: HitEvent = { from: id, to: monsterId, dmg, crit, skill, killed };
    this.broadcast(Msg.Hit, ev);
    if (killed) {
      c.targetId = null;
      c.pendingSkill = null;
      const client = this.clients.find((cl) => cl.sessionId === id);
      c.struck.delete(monsterId);
      c.gold += killGold(mc.def);
      this.giveLoot(client, p, c, rollDrops(mc.def.drops, c.inv.bag, Math.random, corruptionBonus(c.corruption)));
      this.sendPrivate(client);
      this.gainExp(client, p, c, killExp(mc.exp, level, p.level));
      if (mc.def.boss) this.broadcastSystem(`${p.name} ปราบ${MONSTERS[m.kind]?.name ?? "บอส"}ได้แล้ว!`);
    }
  }

  /** Hollow rules for one player. True when the player has just left the map. */
  private tickHollow(id: string, p: Player, c: PlayerCtl, dt: number, now: number): boolean {
    const shielded = c.shieldUntil > now;
    if (p.shielded !== shielded) p.shielded = shielded;
    if (c.lingerUntil && c.lingerUntil <= now) {
      this.logOut(id, p, c).catch((e) => console.error("[world] save failed", e));
      return true;
    }
    const before = c.corruption;
    c.corruption = Math.min(100, c.corruption + (CORRUPTION_PER_MIN / 60) * dt);
    if (Math.floor(c.corruption) !== p.corruption) p.corruption = Math.floor(c.corruption);
    const client = this.clients.find((cl) => cl.sessionId === id);
    if (before < GLOW_AT && c.corruption >= GLOW_AT) client?.send(Msg.Notice, { text: "การกัดกร่อนเกินครึ่งแล้ว ทุกคนเห็นคุณบนแผนที่!" });
    if (client && this.state.gates.some((g) => dist(g, p) < 0.7)) {
      this.broadcastSystem(`${p.name} หนีออกจาก Hollow ได้แล้ว`);
      this.travel(client, p, c, "brindle", { x: 25, y: 7 });
      return true;
    }
    return false;
  }

  tick(dtMs: number) {
    const dt = Math.min(dtMs, 250) / 1000;
    const now = this.clock.currentTime;

    this.state.players.forEach((p, id) => {
      const c = this.ctl.get(id);
      if (!c || p.dead || c.leaving) return;

      if (this.map.pvp && this.tickHollow(id, p, c, dt, now)) return;
      if (c.stunUntil > now) {
        if (p.moving) p.moving = false;
        return;
      }

      if (p.guarding && c.guardUntil <= now) p.guarding = false;
      const speed = WALK_SPEED * (1 + c.mods.moveSpeedPct / 100);
      const swingMs = PLAYER_ATTACK_MS / (1 + c.mods.attackSpeedPct / 100);

      if (c.charge) {
        const m = this.targetOf(id, c.charge.targetId);
        if (!m) {
          c.charge = null;
          c.path = c.path.slice(0, 1);
        } else {
          stepAlong(p, c.path, WALK_SPEED * 4, dt);
          if (dist(p, m) <= ATTACK_RANGE || !c.path.length) {
            c.path = [];
            p.moving = false;
            const { power, stunMs, targetId } = c.charge;
            c.charge = null;
            if (dist(p, m) <= ATTACK_RANGE + 0.5) this.playerHits(id, p, c, targetId, power, "charge", stunMs);
          }
        }
      } else if (c.targetId) {
        const m = this.targetOf(id, c.targetId);
        if (!m) {
          c.targetId = null;
          c.pendingSkill = null;
        } else if (dist(p, m) <= ATTACK_RANGE) {
          if (c.path.length > 1) c.path.length = 1; // finish this step, then stop
          stepAlong(p, c.path, speed, dt);
          if (!c.path.length) {
            faceTowards(p, m);
            const skill = c.pendingSkill;
            if (skill && (c.cooldowns.get(skill) ?? 0) <= now) {
              const def = SKILLS[skill];
              const lvl = p.skills.get(skill) ?? 1;
              c.pendingSkill = null;
              const client = this.clients.find((cl) => cl.sessionId === id);
              if (client) this.startCooldown(client, c, skill, def.cooldownMs);
              c.nextAttackAt = now + swingMs;
              this.playerHits(id, p, c, c.targetId, (def.power ?? 1) + (def.powerPerLevel ?? 0) * (lvl - 1), skill);
            } else if (now >= c.nextAttackAt) {
              c.nextAttackAt = now + swingMs;
              this.playerHits(id, p, c, c.targetId, 1);
            }
          }
        } else {
          if (now >= c.repathAt) {
            c.repathAt = now + 400;
            const rest = findPath(this.map, planFrom(p, c.path), { x: Math.round(m.x), y: Math.round(m.y) }, MAX_PATH_STEPS);
            if (rest) c.path = c.path.length ? [c.path[0], ...rest] : rest;
            else if (!c.path.length) c.targetId = null; // cannot reach it
          }
          stepAlong(p, c.path, speed, dt);
        }
      } else {
        stepAlong(p, c.path, speed, dt);
        if (c.interact && !c.path.length) this.tickInteract(id, p, c, now);
      }

      // Regeneration: fast out of combat, a trickle in combat (none with the bloodthirst keystone).
      if (p.hp < p.maxHp && !c.mods.bloodthirst) {
        const rate = now - c.lastCombatAt > OUT_OF_COMBAT_MS ? 0.04 : 0.003;
        c.regen += p.maxHp * rate * (1 + c.mods.regenPct / 100) * dt;
        const whole = Math.floor(c.regen);
        if (whole > 0) {
          c.regen -= whole;
          p.hp = Math.min(p.maxHp, p.hp + whole);
        }
      }
    });

    if (this.map.pvp && Date.now() >= this.state.gatesUntil) this.moveGates(true);
    for (const [id, b] of this.bundles) if (b.expires <= Date.now()) this.removeBundle(id);

    for (const [key, at] of this.depletedUntil)
      if (at <= now) {
        this.depletedUntil.delete(key);
        this.state.depleted.delete(key);
      }

    this.monsterSys.tick(dt);
  }
}
