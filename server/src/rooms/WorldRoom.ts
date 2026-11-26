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
  CRACK_EVERY_MS,
  CRACK_OPEN_MS,
  CRACK_WARN_MS,
  FALL_DAMAGE,
  SPRING_PER_SEC,
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
  addStack,
  BAG_SIZE,
  canUse,
  cleanInventory,
  craft,
  CRAFT_NAMES,
  CRAFT_SKILL,
  equipItem,
  equipTotals,
  findStation,
  FlatStats,
  FOG_OPEN_MS,
  GATHER_MS,
  LANTERN_MS,
  NIGHT_BONUS,
  WIND_MS,
  WIND_SPEED,
  Inventory,
  ITEMS,
  ItemStack,
  moveStack,
  Resource,
  resourceAt,
  rollAffixes,
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
  takeStack,
  unequipItem,
} from "../../../shared/items";
import {
  afterTax,
  MAX_LISTINGS,
  MAX_ORDERS,
  PRICE_MAX,
  STALL_MS,
  STALL_RANGE,
  STALL_SLOTS,
  STALL_TITLE_MAX,
  StallData,
  StallItem,
  wholeNumber,
} from "../../../shared/market";
import { GameMap, isCalm, isSafe, isWalkable, ZoneId } from "../../../shared/map";
import { buildZone, ZONE_NAMES, zoneId } from "../../../shared/zones";
import { isNight } from "../../../shared/daylight";
import { GROVE, LANTERNS } from "../../../shared/mossfen";
import { inReach, levelOf, reachableFrom, setRegion } from "../../../shared/terrain";
import { cleanChat, cleanName } from "../../../shared/names";
import { canReach, canRefund, cleanNodes, Mods, passiveMods, passivePointsEarned, PASSIVES, refundCost } from "../../../shared/passives";
import { findPath, Point } from "../../../shared/pathfinding";
import { ChatLine, CooldownEvent, GatheringEvent, HitEvent, JoinOptions, LootEvent, Msg, OpenStationEvent, PARTY_BONUS, PARTY_SHARE_RANGE, PartyAction, PrivateData, ROOM_OF, TicketOptions, TravelEvent, ZONE_ERROR } from "../../../shared/protocol";
import {
  ATTACK_RANGE,
  attackRange,
  CRIT_CHANCE,
  DEATH_EXP_LOSS,
  expToNext,
  ENEMY_SKILLS,
  hitDamage,
  Job,
  JOB_CHANGE_LEVEL,
  JOB_CHOICES,
  JOB_NAMES,
  jobId,
  killExp,
  killGold,
  MAX_LEVEL,
  MONSTERS,
  OUT_OF_COMBAT_MS,
  PLAYER_ATTACK_MS,
  playerStats,
  RESPAWN_DELAY_MS,
  SkillDef,
  SkillId,
  skillPointsEarned,
  SKILLS,
} from "../../../shared/stats";
import { CharacterRow, CharacterSave, createAccount, loadBundles, loadCharacter, login, saveCharacter, saveWithBundle, transaction, writeCharacter } from "../db";
import * as market from "../market";
import { TradeError } from "../market";
import type { DatabaseSync } from "node:sqlite";
import { AdminHost, runAdminCommand } from "../game/admin";
import { MonsterSystem } from "../game/monsters";
import { dist, faceTowards, planFrom, stepAlong } from "../game/movement";
import { freeLock, holdsLock, Lock, makeTicket, takeLock, useTicket } from "../game/sessions";
import * as party from "../game/parties";
import { PartyError } from "../game/parties";
import { Bundle, Gate, Player, Stall, WorldState } from "./schema";

export { facingFor } from "../game/movement";

/** Server-only data kept per player (not sent to clients). */
interface PlayerCtl {
  accountId: number;
  /** game master: may use /commands */
  admin: boolean;
  /** cannot be hurt (game master) */
  god: boolean;
  speedTimes: number;
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
  windUntil: number;
  guardUntil: number;
  guardReduce: number;
  blessUntil: number;
  bless: number;
  manaShieldUntil: number;
  manaShield: number;
  slowUntil: number;
  slow: number;
  markUntil: number;
  mark: number;
  /** leaping back: moves fast along the path and cannot act */
  leaping: boolean;
  mpRegen: number;
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
  interact: { x: number; y: number; res: Resource | null; station: StationKind | null; bundle: string | null; stall: string | null; doneAt: number } | null;
  /** id of our open stall: we sit and cannot walk */
  stall: string | null;
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

export class WorldRoom extends Room<WorldState> implements party.PartyHost {
  maxClients = MAX_PLAYERS_PER_ROOM;
  map!: GameMap;
  ctl = new Map<string, PlayerCtl>();
  monsterSys!: MonsterSystem;
  /** ground that connects to the rest of the map */
  private reach = new Set<number>();
  private crackAt = 0;
  private crackEnds = 0;
  /** who already opened the grove's chest this time */
  private chestTaken = new Set<number>();
  private bundles = new Map<string, BundleCtl>();
  private stalls = new Map<string, market.StallRow>();
  /** used-up rocks and trees: "x,y" -> when they come back */
  private depletedUntil = new Map<string, number>();

  async onCreate(options: { zone?: ZoneId }) {
    this.map = buildZone(zoneId(options?.zone));
    this.setState(new WorldState());
    this.state.mapName = this.map.name;
    this.reach = reachableFrom(this.map, this.map.spawn);
    for (const id of Object.keys(this.map.regions)) if (this.map.regions[id].some((k) => this.map.closed.has(k))) this.state.closed.set(id, true);
    this.crackAt = Date.now() + CRACK_EVERY_MS;
    this.autoDispose = false; // the world stays alive (monsters keep living) with nobody online

    this.monsterSys = new MonsterSystem({
      map: this.map,
      reach: this.reach,
      monsters: this.state.monsters as unknown as Map<string, any>,
      playerAt: (id) => this.state.players.get(id),
      nearestPlayer: (x, y, r) => this.nearestPlayer(x, y, r),
      monsterHitsPlayer: (mid, pid, atk) => this.monsterHitsPlayer(mid, pid, atk),
      now: () => this.clock.currentTime,
    });
    this.monsterSys.spawnAll();
    if (this.map.pvp) this.moveGates(false);

    party.addHost(this);
    this.clock.setInterval(() => this.tickParties(), 500);
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / TICK_RATE);
    this.setPatchRate(1000 / TICK_RATE);
    this.clock.setInterval(() => this.saveAll(), AUTOSAVE_MS);

    this.onMessage(Msg.Move, (client, msg) => this.handleMove(client, msg));
    this.onMessage(Msg.Attack, (client, msg) => this.handleAttack(client, msg));
    this.onMessage(Msg.Skill, (client, msg) => this.handleSkill(client, msg));
    this.onMessage(Msg.LearnSkill, (client, msg) => this.handleLearn(client, msg));
    this.onMessage(Msg.ChangeJob, (client, msg) => this.handleChangeJob(client, msg));
    this.onMessage(Msg.LearnPassive, (client, msg) => this.handleLearnPassive(client, msg));
    this.onMessage(Msg.RefundPassive, (client, msg) => this.handleRefundPassive(client, msg));
    this.onMessage(Msg.Board, (client) => this.atBoard(client, () => {}));
    this.onMessage(Msg.BoardSell, (client, msg) => this.handleBoardSell(client, msg));
    this.onMessage(Msg.BoardBuy, (client, msg) => this.handleBoardBuy(client, msg));
    this.onMessage(Msg.BoardCancel, (client, msg) => this.handleBoardCancel(client, msg));
    this.onMessage(Msg.OrderPlace, (client, msg) => this.handleOrderPlace(client, msg));
    this.onMessage(Msg.OrderFill, (client, msg) => this.handleOrderFill(client, msg));
    this.onMessage(Msg.Claim, (client, msg) => this.handleClaim(client, msg));
    this.onMessage(Msg.StallOpen, (client, msg) => this.handleStallOpen(client, msg));
    this.onMessage(Msg.StallClose, (client) => this.handleStallClose(client));
    this.onMessage(Msg.StallVisit, (client, msg) => this.handleStallVisit(client, msg));
    this.onMessage(Msg.StallBuy, (client, msg) => this.handleStallBuy(client, msg));
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
    this.onMessage(Msg.PartyAct, (client, msg) => this.handleParty(client, msg as PartyAction));

    for (const b of await loadBundles(this.map.id)) {
      let items: ItemStack[] = [];
      try {
        items = cleanInventory({ bag: JSON.parse(b.items) }).bag;
      } catch {
        /* bad JSON: nothing in it */
      }
      if (items.length) this.addBundle(b.id, { items, owner: b.owner, ...(this.standable(b.x, b.y) ? { x: b.x, y: b.y } : this.nearestStandable(b.x, b.y)), expires: b.expires });
    }
    if (this.map.id === "brindle") {
      market.expireOld();
      for (const s of market.loadStalls()) {
        this.showStall(s);
        // a stall on ground that is gone goes back to its owner
        if (!this.standable(s.x, s.y)) this.closeStall(s.id);
      }
      this.closeOldStalls();
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
    const zone = zoneId(character.zone);
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
    if (!fresh || zoneId(fresh.zone) !== this.map.id) {
      freeLock(character.account_id, lock);
      throw new ServerError(421, ZONE_ERROR + zoneId(fresh?.zone));
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
    p.job = jobId(c.job);
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
    const spot = c.x >= 0 && this.standable(saved.x, saved.y) ? saved : this.findSpawn();
    p.x = spot.x;
    p.y = spot.y;
    p.facing = Math.floor(Math.random() * 8);
    this.state.players.set(client.sessionId, p);
    this.ctl.set(client.sessionId, {
      accountId: c.account_id,
      admin: c.admin === 1,
      god: false,
      speedTimes: 1,
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
      windUntil: 0,
      guardUntil: 0,
      guardReduce: 0,
      blessUntil: 0,
      bless: 0,
      manaShieldUntil: 0,
      manaShield: 0,
      slowUntil: 0,
      slow: 0,
      markUntil: 0,
      mark: 0,
      leaping: false,
      mpRegen: 0,
      charge: null,
      deadAt: 0,
      regen: 0,
      gold: Math.max(0, c.gold),
      nodes,
      inv,
      mods,
      gear: worn.flat,
      interact: null,
      stall: null,
      struck: new Set(),
    });
    p.gm = c.admin === 1;
    p.shielded = this.map.pvp;
    p.corruption = this.map.pvp ? Math.floor(Math.max(0, Math.min(100, c.corruption))) : 0;
    this.broadcastSystem(this.map.pvp ? `มีใครบางคนก้าวเข้ามาใน Hollow` : `${p.name} เดินทางมาถึง${ZONE_NAMES[this.map.id]}`);
    for (const s of this.stalls.values())
      if (s.account_id === c.account_id) {
        // back behind our own stall
        this.ctl.get(client.sessionId)!.stall = s.id;
        p.x = s.x;
        p.y = s.y;
      }
    this.collectGold(client.sessionId);
    this.tickParties();
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
    party.wentOffline(c.accountId);
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
    if (c.stall) this.closeStall(c.stall);
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
    c.interact = { x: b.x, y: b.y, res: null, station: null, bundle: id as string, stall: null, doneAt: 0 };
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
    party.removeHost(this);
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
    for (const id of [...this.ctl.keys()]) this.collectGold(id);
    if (this.map.id === "brindle") {
      market.expireOld();
      this.closeOldStalls();
    }
  }

  private findSpawn(): Point {
    const { entries } = this.map as Partial<HollowMap>;
    const spawn = entries?.length ? entries[Math.floor(Math.random() * entries.length)] : this.map.spawn;
    for (let tries = 0; tries < 50; tries++) {
      const x = spawn.x + Math.floor(Math.random() * 5) - 2;
      const y = spawn.y + Math.floor(Math.random() * 5) - 2;
      if (this.standable(x, y)) return { x, y };
    }
    return { ...spawn };
  }

  /** Walkable, and not cut off from the rest of the map. */
  private standable(x: number, y: number) {
    return isWalkable(this.map, x, y) && this.reach.has(y * this.map.width + x);
  }

  private nearestStandable(x: number, y: number): Point {
    for (let r = 0; r < 30; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const p = { x: Math.round(x) + dx, y: Math.round(y) + dy };
          if (p.x >= 0 && p.y >= 0 && this.standable(p.x, p.y)) return p;
        }
    return this.findSpawn();
  }

  /** Puts somebody on another spot at once, and stops whatever they were doing. */
  private placeAt(id: string, p: Player, c: PlayerCtl, at: Point) {
    this.stopInteract(this.clientOf(id), c);
    c.path = [];
    c.targetId = null;
    c.pendingSkill = null;
    c.charge = null;
    c.leaping = false;
    p.x = at.x;
    p.y = at.y;
    p.moving = false;
  }

  // ---- what makes each map special ------------------------------------------

  private setClosed(region: string, closed: boolean) {
    setRegion(this.map, region, closed);
    if (closed) this.state.closed.set(region, true);
    else this.state.closed.delete(region);
  }

  private tickMap() {
    const now = Date.now();
    if (this.map.id === "mossfen") {
      for (const [key, until] of this.state.lit) if (until <= now && !this.state.fogUntil) this.state.lit.delete(key);
      if (this.state.fogUntil && this.state.fogUntil <= now) this.closeFog();
    }
    if (!this.map.pvp) return;
    // the Hollow's ground: warn, fall, come back
    if (this.state.cracking && this.crackEnds <= now) {
      const id = this.state.cracking;
      this.state.cracking = "";
      this.setClosed(id, true);
      this.crackEnds = now + CRACK_OPEN_MS;
      this.fall(id);
    } else if (!this.state.cracking && this.state.closed.size && this.crackEnds <= now) {
      for (const id of [...this.state.closed.keys()]) this.setClosed(id, false);
      this.crackAt = now + CRACK_EVERY_MS;
    } else if (!this.state.cracking && !this.state.closed.size && this.crackAt <= now) {
      const ids = Object.keys(this.map.regions);
      this.state.cracking = ids[Math.floor(Math.random() * ids.length)];
      this.crackEnds = now + CRACK_WARN_MS;
      this.broadcastSystem("พื้นดินใน Hollow เริ่มแตกร้าว ดูจุดสีแดงบนแผนที่!");
    }
  }

  /** Everyone on fallen ground takes damage and climbs out at the edge. */
  private fall(region: string) {
    const gone = new Set(this.map.regions[region]);
    const on = (x: number, y: number) => gone.has(Math.round(y) * this.map.width + Math.round(x));
    this.state.players.forEach((p, id) => {
      const c = this.ctl.get(id);
      if (!c || c.leaving || !on(p.x, p.y)) return;
      this.placeAt(id, p, c, this.nearestStandable(p.x, p.y));
      if (p.dead || c.god) return;
      p.hp = Math.max(0, p.hp - Math.round(p.maxHp * FALL_DAMAGE));
      this.clientOf(id)?.send(Msg.Notice, { text: "พื้นถล่ม! คุณตกลงไปและปีนกลับขึ้นมา" });
      if (p.hp <= 0) this.playerDies(id, p, c, "พื้นที่ถล่ม");
    });
    this.monsterSys.rescue(on);
    for (const [id, b] of [...this.bundles]) if (on(b.x, b.y)) {
      // things lying there land at the edge
      const at = this.nearestStandable(b.x, b.y);
      this.removeBundle(id);
      this.addBundle(id, { ...b, ...at });
    }
  }

  private useSpecial(client: Client, p: Player, c: PlayerCtl, kind: StationKind, x: number, y: number) {
    const now = Date.now();
    if (kind === "windmill") {
      c.windUntil = this.clock.currentTime + WIND_MS;
      p.windy = true;
      client.send(Msg.Notice, { text: "ลมจากกังหันพัดส่งคุณ เดินเร็วขึ้น 20% นาน 3 นาที" });
    } else if (kind === "lantern") {
      if (this.state.fogUntil) return client.send(Msg.Notice, { text: "หมอกเปิดอยู่แล้ว รีบไปที่ลานสมบัติ" });
      this.state.lit.set(`${x},${y}`, now + LANTERN_MS);
      const n = this.state.lit.size;
      if (n < LANTERNS.length) return this.broadcastSystem(`${p.name} จุดโคมหินแล้ว ${n}/${LANTERNS.length} (โคมดับใน 90 วินาที)`);
      this.state.fogUntil = now + FOG_OPEN_MS;
      this.chestTaken.clear();
      this.setClosed("fog", false);
      this.broadcastSystem("โคมหินสว่างครบ! หมอกเปิดทางขึ้นลานสมบัติ 3 นาที");
    } else if (kind === "treasure") {
      if (!this.state.fogUntil) return;
      if (this.chestTaken.has(c.accountId)) return client.send(Msg.Notice, { text: "คุณเปิดหีบรอบนี้ไปแล้ว" });
      const items = [
        { id: "crystal_1", qty: 2 + Math.floor(Math.random() * 2) },
        { id: "herb_2", qty: 4 + Math.floor(Math.random() * 4) },
        { id: "wood_2", qty: 4 + Math.floor(Math.random() * 4) },
      ];
      if (!this.giveLoot(client, p, c, items)) return;
      this.chestTaken.add(c.accountId);
      c.gold += 120;
      this.itemsChanged(client, p, c);
      client.send(Msg.Notice, { text: "เปิดหีบลานสมบัติแล้ว" });
    }
  }

  /** The fog comes back; anyone still up there is carried down to its edge. */
  private closeFog() {
    this.state.fogUntil = 0;
    this.state.lit.clear();
    this.setClosed("fog", true);
    this.broadcastSystem("หมอกปิดทางขึ้นลานสมบัติแล้ว");
    const up = (x: number, y: number) => Math.hypot(x - GROVE.x, y - GROVE.y) < 10 && levelOf(this.map, Math.round(x), Math.round(y)) >= 2;
    const fog = new Set(this.map.regions.fog);
    this.state.players.forEach((p, id) => {
      const c = this.ctl.get(id);
      if (c && !c.leaving && (up(p.x, p.y) || fog.has(Math.round(p.y) * this.map.width + Math.round(p.x))))
        this.placeAt(id, p, c, this.nearestStandable(GROVE.x, GROVE.y + 8));
    });
  }

  // ---- stats --------------------------------------------------------------

  private applyStats(p: Player, c: Pick<PlayerCtl, "mods" | "gear">, heal: boolean) {
    const s = playerStats(p.level, p.job as Job, c.mods, c.gear);
    p.maxHp = s.maxHp;
    p.hp = heal ? s.maxHp : Math.min(p.hp, s.maxHp);
    p.maxMp = s.maxMp;
    p.mp = heal ? s.maxMp : Math.min(p.mp, s.maxMp);
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
        client?.send(Msg.Notice, { text: "ถึงเลเวล 10 แล้ว! เลือกอาชีพได้ที่ปุ่มด้านล่าง" });
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
    if (!pc || pc.p.dead || pc.c.charge || pc.c.leaping || typeof msg !== "object" || msg === null) return;
    const gx = Math.floor(Number((msg as Point).x));
    const gy = Math.floor(Number((msg as Point).y));
    if (!Number.isFinite(gx) || !Number.isFinite(gy) || this.sitting(client, pc.c)) return;
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
    if (this.sitting(client, pc.c)) return;
    this.stopInteract(client, pc.c);
    pc.c.targetId = id;
    pc.c.pendingSkill = null;
    pc.c.repathAt = 0;
  }

  private handleSkill(client: Client, msg: unknown) {
    const pc = this.get(client);
    if (!pc || pc.p.dead || pc.c.charge || this.sitting(client, pc.c)) return;
    const { p, c } = pc;
    const skill = (msg as { skill?: unknown })?.skill as SkillId;
    const def = typeof skill === "string" ? SKILLS[skill] : undefined;
    if (!def) return;
    const lvl = p.skills.get(skill) ?? 0;
    if (def.job !== p.job || lvl <= 0) return client.send(Msg.Notice, { text: `ยังไม่ได้เรียนสกิล ${def.name}` });
    const now = this.clock.currentTime;
    if ((c.cooldowns.get(skill) ?? 0) > now) return client.send(Msg.Notice, { text: `${def.name} ยังไม่พร้อม` });

    if (!ENEMY_SKILLS.has(def.kind)) {
      this.castNow(client, p, c, skill, (msg as any)?.target);
      return;
    }

    const targetId = typeof (msg as any)?.target === "string" ? (msg as any).target : c.targetId;
    const m = targetId ? this.targetOf(client.sessionId, targetId) : undefined;
    if (!m || !targetId) return client.send(Msg.Notice, { text: "เลือกเป้าหมายก่อน (คลิกที่มอนสเตอร์)" });
    this.stopInteract(client, c);

    if (def.kind === "charge") {
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

    if (p.mp < (def.mp ?? 0)) return client.send(Msg.Notice, { text: "มานาไม่พอ" });
    // walk into range, then use it (see tick)
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

  /** Puts a weapon the new job cannot use back into the bag. False when the bag is full. */
  private putAwayWeapon(p: Player, c: PlayerCtl, job: Job): boolean {
    const w = c.inv.equip.weapon;
    if (!w || canUse(ITEMS[w.id], job)) return true;
    return unequipItem(c.inv, "weapon") === null;
  }

  private handleChangeJob(client: Client, msg: unknown) {
    const pc = this.get(client);
    if (!pc || pc.p.job !== "wanderer" || pc.p.dead) return;
    const { p, c } = pc;
    const choice = JOB_CHOICES.find((j) => j.job === (msg as { job?: unknown } | null)?.job);
    if (!choice) return;
    if (p.level < JOB_CHANGE_LEVEL) return client.send(Msg.Notice, { text: `ต้องถึงเลเวล ${JOB_CHANGE_LEVEL} ก่อน` });
    if (choice.gift && c.inv.bag.length + (c.inv.equip.weapon ? 1 : 0) >= BAG_SIZE)
      return client.send(Msg.Notice, { text: "กระเป๋าเต็ม ทำที่ว่างก่อนเปลี่ยนอาชีพ" });
    if (!this.putAwayWeapon(p, c, choice.job)) return client.send(Msg.Notice, { text: "กระเป๋าเต็ม ทำที่ว่างก่อนเปลี่ยนอาชีพ" });
    p.job = choice.job;
    if (choice.gift) {
      // a first weapon to start with
      addItem(c.inv.bag, BAG_SIZE, choice.gift, 1);
      const gift = c.inv.bag.find((s) => s.id === choice.gift);
      if (gift && !c.inv.equip.weapon) equipItem(c.inv, gift.uid, p.level, choice.job);
    }
    this.buildChanged(client, p, c);
    this.applyStats(p, c, true);
    this.broadcastSystem(`${p.name} ได้เป็น${JOB_NAMES[choice.job]}แล้ว!`);
  }

  // ---- skills ---------------------------------------------------------------

  /** Checks and takes the mana, and starts the cooldown. */
  private payFor(client: Client, p: Player, c: PlayerCtl, skill: SkillId): boolean {
    const def = SKILLS[skill];
    const cost = def.mp ?? 0;
    if (p.mp < cost) {
      client.send(Msg.Notice, { text: "มานาไม่พอ" });
      return false;
    }
    p.mp -= cost;
    const lvl = p.skills.get(skill) ?? 1;
    this.startCooldown(client, c, skill, def.cooldownMs + (def.cooldownPerLevel ?? 0) * (lvl - 1));
    return true;
  }

  private amountOf(def: SkillDef, lvl: number) {
    return (def.amount ?? 0) + (def.amountPerLevel ?? 0) * (lvl - 1);
  }

  /** Enemies of this player around a point (monsters, and other players in the Hollow). */
  private enemiesNear(me: string, x: number, y: number, radius: number, except: string): [string, { x: number; y: number }][] {
    const out: [string, { x: number; y: number }][] = [];
    this.state.monsters.forEach((m, id) => {
      if (id !== except && Math.hypot(m.x - x, m.y - y) <= radius) out.push([id, m]);
    });
    if (this.map.pvp)
      this.state.players.forEach((t, id) => {
        if (id !== except && Math.hypot(t.x - x, t.y - y) <= radius && this.targetOf(me, id)) out.push([id, t]);
      });
    return out.sort((a, b) => Math.hypot(a[1].x - x, a[1].y - y) - Math.hypot(b[1].x - x, b[1].y - y));
  }

  /** A skill lands on an enemy that is in range. */
  private castAt(id: string, p: Player, c: PlayerCtl, targetId: string, skill: SkillId) {
    const def = SKILLS[skill];
    const lvl = p.skills.get(skill) ?? 1;
    const power = (def.power ?? 1) + (def.powerPerLevel ?? 0) * (lvl - 1);
    const now = this.clock.currentTime;
    const t = this.targetOf(id, targetId);
    if (!t) return;
    const at = { x: t.x, y: t.y };
    switch (def.kind) {
      case "pierce": {
        // everything close to the line of fire, however far the target is
        const len = Math.max(0.01, dist(p, at));
        const ux = (at.x - p.x) / len;
        const uy = (at.y - p.y) / len;
        const from = { x: p.x, y: p.y };
        for (const [eid, e] of this.enemiesNear(id, from.x, from.y, def.range + 1, "")) {
          const along = (e.x - from.x) * ux + (e.y - from.y) * uy;
          const off = Math.abs((e.x - from.x) * uy - (e.y - from.y) * ux);
          if (eid === targetId || (along > 0 && off <= 0.9)) this.playerHits(id, p, c, eid, power, skill, 0, 0.5);
        }
        return;
      }
      case "mark": {
        const until = now + (def.durationMs ?? 8000);
        const mc = this.monsterSys.ctl.get(targetId);
        const tc = this.ctl.get(targetId);
        if (mc) Object.assign(mc, { markUntil: until, mark: this.amountOf(def, lvl) });
        else if (tc) Object.assign(tc, { markUntil: until, mark: this.amountOf(def, lvl) });
        if (mc) this.monsterSys.takeDamage(targetId, id, 0);
        c.lastCombatAt = now;
        c.shieldUntil = 0;
        return;
      }
      case "splash":
        this.playerHits(id, p, c, targetId, power, skill);
        for (const [eid] of this.enemiesNear(id, at.x, at.y, def.radius ?? 1.8, targetId)) this.playerHits(id, p, c, eid, power * 0.6, skill);
        return;
      case "slow": {
        this.playerHits(id, p, c, targetId, power, skill);
        const until = now + (def.durationMs ?? 3000) + (def.durationPerLevel ?? 0) * (lvl - 1);
        const tc = this.monsterSys.ctl.get(targetId) ?? this.ctl.get(targetId);
        if (tc) Object.assign(tc, { slowUntil: until, slow: def.amount ?? 0.4 });
        return;
      }
      case "chain": {
        let from = at;
        const done = new Set([targetId]);
        this.playerHits(id, p, c, targetId, power, skill);
        const jumps = 2 + Math.floor((lvl - 1) / 2);
        for (let i = 1, k = 0.75; i <= jumps; i++, k *= 0.75) {
          const next = this.enemiesNear(id, from.x, from.y, def.radius ?? 3, "").find(([eid]) => !done.has(eid));
          if (!next) break;
          done.add(next[0]);
          from = { x: next[1].x, y: next[1].y };
          this.playerHits(id, p, c, next[0], power * k, skill);
        }
        return;
      }
      default:
        for (let i = 0; i < (def.hits ?? 1); i++) if (this.targetOf(id, targetId)) this.playerHits(id, p, c, targetId, power, skill);
    }
  }

  /** Skills that work at once, on yourself or on friends. */
  private castNow(client: Client, p: Player, c: PlayerCtl, skill: SkillId, target: unknown) {
    const def = SKILLS[skill];
    const lvl = p.skills.get(skill) ?? 1;
    const now = this.clock.currentTime;
    const id = client.sessionId;
    const until = now + (def.durationMs ?? 6000) + (def.durationPerLevel ?? 0) * (lvl - 1);
    if (p.mp < (def.mp ?? 0)) return client.send(Msg.Notice, { text: "มานาไม่พอ" });
    switch (def.kind) {
      case "guard":
        this.payFor(client, p, c, skill);
        c.guardUntil = until;
        c.guardReduce = (def.reduce ?? 0.3) + (def.reducePerLevel ?? 0) * (lvl - 1);
        p.guarding = true;
        return;
      case "taunt":
        this.payFor(client, p, c, skill);
        this.monsterSys.taunt(id, p.x, p.y, (def.radius ?? 4) + (def.radiusPerLevel ?? 0) * (lvl - 1));
        c.lastCombatAt = now;
        c.shieldUntil = 0;
        return;
      case "manashield":
        this.payFor(client, p, c, skill);
        c.manaShieldUntil = until;
        c.manaShield = this.amountOf(def, lvl);
        p.manaShield = true;
        return;
      case "bless": {
        this.payFor(client, p, c, skill);
        this.state.players.forEach((t, tid) => {
          const tc = this.ctl.get(tid);
          if (!tc || t.dead || tc.leaving) return;
          if (tid !== id && (dist(p, t) > (def.radius ?? 5) || (this.map.pvp && !party.sameParty(c.accountId, tc.accountId)))) return;
          tc.blessUntil = until;
          tc.bless = this.amountOf(def, lvl);
          t.blessed = true;
        });
        return;
      }
      case "backstep": {
        const e = c.targetId ? this.targetOf(id, c.targetId) : undefined;
        const FACE = [[1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];
        const look = e ? { x: e.x - p.x, y: e.y - p.y } : { x: FACE[p.facing][0], y: FACE[p.facing][1] };
        const len = Math.hypot(look.x, look.y) || 1;
        for (let d = 3; d >= 1; d--) {
          const spot = { x: Math.round(p.x - (look.x / len) * d), y: Math.round(p.y - (look.y / len) * d) };
          const path = findPath(this.map, planFrom(p, c.path), spot, d + 2);
          if (!path || !path.length) continue;
          this.payFor(client, p, c, skill);
          this.stopInteract(client, c);
          c.path = c.path.length ? [c.path[0], ...path] : path;
          c.leaping = true;
          c.targetId = null;
          c.pendingSkill = null;
          return;
        }
        return client.send(Msg.Notice, { text: "ไม่มีที่ให้ถอย" });
      }
      case "heal": {
        // in the Hollow only your party are friends
        const friend = typeof target === "string" && this.state.players.has(target) && (!this.map.pvp || party.sameParty(c.accountId, this.ctl.get(target)?.accountId ?? -1));
        const tid = friend ? (target as string) : id;
        const t = this.state.players.get(tid)!;
        const tc = this.ctl.get(tid);
        if (!tc || tc.leaving || t.dead) return client.send(Msg.Notice, { text: "รักษาคนที่ล้มไม่ได้" });
        if (dist(p, t) > def.range + 0.5) return client.send(Msg.Notice, { text: "เป้าหมายไกลเกินไป" });
        this.payFor(client, p, c, skill);
        const power = (def.power ?? 1.6) + (def.powerPerLevel ?? 0) * (lvl - 1);
        const amount = Math.round(this.statsOf(p, c).atk * power * (1 + c.mods.skillDmgPct / 100) * (0.95 + Math.random() * 0.1));
        const got = Math.min(amount, t.maxHp - t.hp);
        t.hp += got;
        if (tid !== id) faceTowards(p, t);
        this.broadcast(Msg.Hit, { from: id, to: tid, dmg: got, skill, heal: true } satisfies HitEvent);
        return;
      }
      case "revive": {
        let best: [string, Player] | null = null;
        this.state.players.forEach((t, tid) => {
          const tc = this.ctl.get(tid);
          if (this.map.pvp && tc && !party.sameParty(c.accountId, tc.accountId)) return;
          if (t.dead && tc && !tc.leaving && this.clientOf(tid) && dist(p, t) <= def.range && (!best || dist(p, t) < dist(p, best[1]))) best = [tid, t];
        });
        if (!best) return client.send(Msg.Notice, { text: "ไม่มีใครล้มอยู่ใกล้ๆ" });
        this.payFor(client, p, c, skill);
        const [tid, t] = best as [string, Player];
        t.dead = false;
        t.hp = Math.max(1, Math.round(t.maxHp * this.amountOf(def, lvl)));
        const tc = this.ctl.get(tid)!;
        tc.path = [];
        tc.shieldUntil = this.map.pvp ? now + PROTECT_MS : 0;
        this.broadcast(Msg.Hit, { from: id, to: tid, dmg: t.hp, skill, heal: true } satisfies HitEvent);
        this.clientOf(tid)?.send(Msg.Notice, { text: `${p.name} ชุบชีวิตคุณ` });
        return;
      }
    }
  }

  /** Damage after everything that protects this player. May use up mana. */
  private taken(p: Player, c: PlayerCtl, dmg: number, now: number): number {
    dmg *= 1 - c.mods.dmgReduce / 100;
    if (c.guardUntil > now) dmg *= 1 - c.guardReduce;
    if (c.blessUntil > now) dmg *= 1 - c.bless;
    dmg = Math.max(1, Math.round(dmg));
    if (c.manaShieldUntil > now && p.mp > 0) {
      const mana = Math.min(p.mp, Math.ceil((dmg * c.manaShield) / 2));
      p.mp -= mana;
      dmg = Math.max(0, dmg - mana * 2);
    }
    return dmg;
  }

  /** Effects that run out, and mana coming back. */
  private tickEffects(p: Player, c: PlayerCtl, now: number, dt: number) {
    if (p.guarding && c.guardUntil <= now) p.guarding = false;
    if (p.blessed && c.blessUntil <= now) p.blessed = false;
    if (p.windy && c.windUntil <= now) p.windy = false;
    if (p.manaShield && (c.manaShieldUntil <= now || p.mp <= 0)) {
      c.manaShieldUntil = 0;
      p.manaShield = false;
    }
    const slowed = c.slowUntil > now;
    if (p.slowed !== slowed) p.slowed = slowed;
    const marked = c.markUntil > now;
    if (p.marked !== marked) p.marked = marked;
    if (p.mp < p.maxMp) {
      c.mpRegen += p.maxMp * (now - c.lastCombatAt > OUT_OF_COMBAT_MS ? 0.04 : 0.015) * dt;
      const whole = Math.floor(c.mpRegen);
      if (whole > 0) {
        c.mpRegen -= whole;
        p.mp = Math.min(p.maxMp, p.mp + whole);
      }
    }
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
    if ((!res && !station) || this.sitting(client, c)) return;
    if (res && !countItem(c.inv.bag, res.tool))
      return client.send(Msg.Notice, { text: `ต้องมี${ITEMS[res.tool].name}ในกระเป๋า (ซื้อได้ที่ช่างตีเหล็กในหมู่บ้าน)` });
    if (res && this.state.depleted.has(`${x},${y}`)) return client.send(Msg.Notice, { text: `${res.name}หมดแล้ว รอสักครู่` });

    this.walkBeside(client, p, c, { x, y, res, station, bundle: null, stall: null, doneAt: 0 });
  }

  /** Walks to the nearest free tile next to something, to use it there. */
  private walkBeside(client: Client, p: Player, c: PlayerCtl, goal: NonNullable<PlayerCtl["interact"]>) {
    const { x, y } = goal;
    const from = planFrom(p, c.path);
    const spots: Point[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isWalkable(this.map, x + dx, y + dy) && Math.abs(levelOf(this.map, x + dx, y + dy) - levelOf(this.map, x, y)) <= 1) spots.push({ x: x + dx, y: y + dy });
    spots.sort((a, b) => dist(a, from) - dist(b, from));
    for (const spot of spots) {
      const rest = findPath(this.map, from, spot, MAX_PATH_STEPS);
      if (!rest) continue;
      this.stopInteract(client, c);
      c.targetId = null;
      c.pendingSkill = null;
      c.path = c.path.length ? [c.path[0], ...rest] : rest;
      c.interact = goal;
      return;
    }
  }

  /** Standing still next to the thing we walked to. */
  private tickInteract(id: string, p: Player, c: PlayerCtl, now: number) {
    const it = c.interact!;
    const client = this.clients.find((cl) => cl.sessionId === id);
    if (!client || dist(p, it) > 1.6) return this.stopInteract(client, c);
    faceTowards(p, it);
    if (it.station === "windmill" || it.station === "lantern" || it.station === "treasure") {
      this.useSpecial(client, p, c, it.station, it.x, it.y);
      c.interact = null;
      return;
    }
    if (it.station) {
      client.send(Msg.OpenStation, { kind: it.station } satisfies OpenStationEvent);
      c.interact = null;
      return;
    }
    if (it.stall) {
      this.sendStall(client, it.stall);
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
    const err = equipItem(pc.c.inv, uid, pc.p.level, pc.p.job as Job);
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
    client.send(Msg.Notice, { text: `ทำได้ ${stackName(r.made)}${r.skillUp ? ` ฝีมือ${CRAFT_NAMES[r.kind]}เพิ่มเป็น ${pc.c.inv[CRAFT_SKILL[r.kind]]}` : ""}` });
    if (r.made.quality === 3) this.broadcastSystem(`${pc.p.name} ทำ${ITEMS[r.made.id].name}ได้เป็นผลงานชิ้นเอก!`);
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
    const cmd = /^\/(p|party|invite|เชิญ|leave)\b\s*(.*)$/i.exec(text);
    if (cmd) {
      const word = cmd[1].toLowerCase();
      if (word === "invite" || word === "เชิญ") return this.handleParty(client, { action: "invite", name: cmd[2] });
      if (word === "leave") return this.handleParty(client, { action: "leave" });
      if (!cmd[2]) return;
      try {
        party.say(pc.c.accountId, cmd[2]);
      } catch (e) {
        if (e instanceof PartyError) client.send(Msg.Notice, { text: e.message });
        else throw e;
      }
      return;
    }
    if (text.startsWith("/")) {
      // commands are never shown to others
      if (!pc.c.admin) return client.send(Msg.Notice, { text: "ไม่มีคำสั่งนี้" });
      console.log(`[admin] ${pc.p.name}: ${text}`);
      for (const line of runAdminCommand(this.adminHost, client.sessionId, text)) client.send(Msg.Notice, { text: line });
      return;
    }
    const now = Date.now();
    if (now - pc.c.lastChatAt < CHAT_COOLDOWN_MS) {
      client.send(Msg.Notice, { text: "พิมพ์เร็วไปนิด รอสักครู่นะ" });
      return;
    }
    pc.c.lastChatAt = now;
    const line: ChatLine = { from: client.sessionId, name: pc.p.name, text };
    this.broadcast(Msg.ChatLine, line);
  }

  // ---- market: coins and items always move in one database transaction -----

  /**
   * Runs a trade for one player on a copy of their bag and coins. The copy, the
   * market tables and the character row are written together; only then does
   * the copy become real. Any error leaves everything as it was.
   */
  private trade(client: Client | undefined, p: Player, c: PlayerCtl, fn: (d: DatabaseSync, me: { inv: Inventory; gold: number }) => void): boolean {
    const me = { inv: structuredClone(c.inv), gold: c.gold };
    try {
      transaction((d) => {
        fn(d, me);
        if (me.gold < 0) throw new TradeError("เหรียญไม่พอ");
        writeCharacter(d, { ...this.rowOf(p, c), gold: me.gold, inv: JSON.stringify(me.inv) });
      });
    } catch (e) {
      if (!(e instanceof TradeError)) console.error("[market]", e);
      client?.send(Msg.Notice, { text: e instanceof TradeError ? e.message : "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง" });
      return false;
    }
    c.inv = me.inv;
    c.gold = me.gold;
    this.sendPrivate(client);
    return true;
  }

  /** Coins from sales go straight to the seller when they are in this map. */
  private collectGold(id: string) {
    const p = this.state.players.get(id);
    const c = this.ctl.get(id);
    if (!p || !c || c.leaving || !market.hasGold(c.accountId)) return;
    let got = 0;
    const client = this.clientOf(id);
    if (this.trade(client, p, c, (d, me) => (me.gold += got = market.takeGold(d, c.accountId))) && got > 0)
      client?.send(Msg.Notice, { text: `ได้รับเงินจากตลาด ${got} เหรียญ` });
  }

  private collectFor(accountId: number) {
    for (const [id, c] of this.ctl) if (c.accountId === accountId) this.collectGold(id);
  }

  /** Runs something at the board, then shows the board again. */
  private atBoard(client: Client, fn: (p: Player, c: PlayerCtl) => void) {
    const pc = this.nearStation(client, "board");
    if (!pc) return;
    fn(pc.p, pc.c);
    client.send(Msg.BoardData, market.boardData(pc.c.accountId));
  }

  private handleBoardSell(client: Client, msg: unknown) {
    const m = (msg ?? {}) as { uid?: unknown; qty?: unknown; price?: unknown };
    const qty = wholeNumber(m.qty, 1, 999);
    const price = wholeNumber(m.price, 1, PRICE_MAX);
    if (typeof m.uid !== "string" || qty === null || price === null) return client.send(Msg.Notice, { text: "ใส่จำนวนและราคาเป็นเลขจำนวนเต็ม" });
    const uid = m.uid;
    this.atBoard(client, (p, c) =>
      this.trade(client, p, c, (d, me) => {
        if (market.countOf("listings", c.accountId) >= MAX_LISTINGS) throw new TradeError(`ตั้งขายได้สูงสุด ${MAX_LISTINGS} รายการ`);
        const s = takeStack(me.inv.bag, uid, qty);
        if (!s) throw new TradeError("ของไม่พอ");
        market.addListing(d, c.accountId, p.name, s, price);
      }),
    );
  }

  private handleBoardBuy(client: Client, msg: unknown) {
    const m = (msg ?? {}) as { id?: unknown; qty?: unknown };
    const qty = wholeNumber(m.qty, 1, 999);
    if (typeof m.id !== "string" || qty === null) return;
    const l = market.getListing(m.id);
    this.atBoard(client, (p, c) => {
      if (!l) return client.send(Msg.Notice, { text: "รายการนี้ไม่มีแล้ว" });
      if (l.accountId === c.accountId) return client.send(Msg.Notice, { text: "นี่ของคุณเอง" });
      const ok = this.trade(client, p, c, (d, me) => {
        market.takeListing(d, l.id, qty);
        const total = l.price * qty;
        me.gold -= total;
        if (me.gold < 0) throw new TradeError(`เหรียญไม่พอ ต้องใช้ ${total} เหรียญ`);
        if (!addStack(me.inv.bag, BAG_SIZE, { ...l.item, qty })) throw new TradeError("กระเป๋าเต็ม");
        market.addClaim(d, l.accountId, afterTax(total), null, `ขาย ${stackName(l.item)} × ${qty}`);
      });
      if (ok) {
        client.send(Msg.Notice, { text: `ซื้อ ${stackName(l.item)} × ${qty} แล้ว` });
        this.collectFor(l.accountId);
      }
    });
  }

  private handleBoardCancel(client: Client, msg: unknown) {
    const id = (msg as { id?: unknown } | null)?.id;
    if (typeof id !== "string") return;
    this.atBoard(client, (p, c) => {
      const l = market.getListing(id);
      const o = market.getOrder(id);
      if (l && l.accountId === c.accountId)
        this.trade(client, p, c, (d, me) => {
          market.takeListing(d, l.id, l.item.qty);
          if (!addStack(me.inv.bag, BAG_SIZE, l.item)) throw new TradeError("กระเป๋าเต็ม");
        });
      else if (o && o.accountId === c.accountId)
        this.trade(client, p, c, (d, me) => {
          market.takeOrder(d, o.id, o.qty);
          me.gold += o.qty * o.price;
        });
    });
  }

  private handleOrderPlace(client: Client, msg: unknown) {
    const m = (msg ?? {}) as { item?: unknown; qty?: unknown; price?: unknown };
    const qty = wholeNumber(m.qty, 1, 99);
    const price = wholeNumber(m.price, 1, PRICE_MAX);
    if (typeof m.item !== "string" || !Object.hasOwn(ITEMS, m.item)) return;
    if (qty === null || price === null) return client.send(Msg.Notice, { text: "ใส่จำนวน (1-99) และราคาเป็นเลขจำนวนเต็ม" });
    const item = m.item;
    this.atBoard(client, (p, c) =>
      this.trade(client, p, c, (d, me) => {
        if (market.countOf("orders", c.accountId) >= MAX_ORDERS) throw new TradeError(`ตั้งรับซื้อได้สูงสุด ${MAX_ORDERS} รายการ`);
        me.gold -= qty * price;
        if (me.gold < 0) throw new TradeError(`เหรียญไม่พอ ต้องวางเงินไว้ ${qty * price} เหรียญ`);
        market.addOrder(d, c.accountId, p.name, item, qty, price);
      }),
    );
  }

  private handleOrderFill(client: Client, msg: unknown) {
    const m = (msg ?? {}) as { id?: unknown; uid?: unknown; qty?: unknown };
    const qty = wholeNumber(m.qty, 1, 99);
    if (typeof m.id !== "string" || typeof m.uid !== "string" || qty === null) return;
    const o = market.getOrder(m.id);
    const uid = m.uid;
    this.atBoard(client, (p, c) => {
      if (!o) return client.send(Msg.Notice, { text: "รายการนี้ไม่มีแล้ว" });
      if (o.accountId === c.accountId) return client.send(Msg.Notice, { text: "นี่ของคุณเอง" });
      const gain = afterTax(o.price * qty);
      const ok = this.trade(client, p, c, (d, me) => {
        const s = takeStack(me.inv.bag, uid, qty);
        if (!s || s.id !== o.item) throw new TradeError("ของไม่พอ");
        market.takeOrder(d, o.id, qty);
        market.addClaim(d, o.accountId, 0, s, `รับซื้อจาก ${p.name}`);
        me.gold += gain;
      });
      if (ok) client.send(Msg.Notice, { text: `ขาย ${ITEMS[o.item].name} × ${qty} ได้ ${gain} เหรียญ (หักภาษี 5%)` });
    });
  }

  private handleClaim(client: Client, msg: unknown) {
    const id = (msg as { id?: unknown } | null)?.id;
    if (typeof id !== "string") return;
    this.atBoard(client, (p, c) =>
      this.trade(client, p, c, (d, me) => {
        const cl = market.takeClaim(d, c.accountId, id);
        me.gold += cl.gold;
        if (cl.item && !addStack(me.inv.bag, BAG_SIZE, cl.item)) throw new TradeError("กระเป๋าเต็ม");
      }),
    );
  }

  // ---- stalls -------------------------------------------------------------

  private sitting(client: Client, c: PlayerCtl): boolean {
    if (!c.stall) return false;
    client.send(Msg.Notice, { text: "กำลังเปิดแผงอยู่ ปิดแผงก่อน" });
    return true;
  }

  private showStall(s: market.StallRow) {
    this.stalls.set(s.id, s);
    const st = new Stall();
    st.x = s.x;
    st.y = s.y;
    st.owner = s.owner;
    st.title = s.title;
    st.color = s.color;
    st.weapon = s.weapon;
    st.helm = s.helm;
    this.state.stalls.set(s.id, st);
  }

  private hideStall(id: string) {
    this.stalls.delete(id);
    this.state.stalls.delete(id);
    for (const c of this.ctl.values()) if (c.stall === id) c.stall = null;
  }

  /** Who runs this stall, when they are in this map. */
  private ownerOf(s: market.StallRow): [string, Player, PlayerCtl] | null {
    for (const [id, c] of this.ctl) {
      const p = this.state.players.get(id);
      if (c.accountId === s.account_id && p && !c.leaving) return [id, p, c];
    }
    return null;
  }

  /** Packs a stall up: into the owner's bag when they are here, else to the board for pick-up. */
  private closeStall(id: string): boolean {
    const s = this.stalls.get(id);
    if (!s) return false;
    const owner = this.ownerOf(s);
    if (owner) {
      const [oid, p, c] = owner;
      const ok = this.trade(this.clientOf(oid), p, c, (d, me) => {
        for (const it of s.items)
          if (!addStack(me.inv.bag, BAG_SIZE, it.stack)) market.addClaim(d, s.account_id, 0, it.stack, "ของจากแผง (กระเป๋าเต็ม)");
        market.removeStall(d, id);
      });
      if (!ok) return false;
    } else {
      try {
        transaction((d) => {
          for (const it of s.items) market.addClaim(d, s.account_id, 0, it.stack, "ของจากแผงที่หมดเวลา");
          market.removeStall(d, id);
        });
      } catch (e) {
        console.error("[market]", e);
        return false;
      }
    }
    this.hideStall(id);
    return true;
  }

  private closeOldStalls() {
    for (const s of [...this.stalls.values()]) if (s.expires <= Date.now()) this.closeStall(s.id);
  }

  private handleStallOpen(client: Client, msg: unknown) {
    const pc = this.get(client);
    if (!pc || pc.p.dead || pc.c.charge || this.sitting(client, pc.c)) return;
    const { p, c } = pc;
    const m = (msg ?? {}) as { title?: unknown; items?: unknown };
    const at = { x: Math.round(p.x), y: Math.round(p.y) };
    const notice = (text: string) => client.send(Msg.Notice, { text });
    if (this.map.id !== "brindle" || !isSafe(this.map, at.x, at.y)) return notice("เปิดแผงได้ในหมู่บ้านเท่านั้น");
    if (p.moving || c.path.length) return notice("หยุดเดินก่อนเปิดแผง");
    for (const s of this.stalls.values()) if (dist(s, at) < 2) return notice("ใกล้แผงอื่นเกินไป");
    for (const k of ["smith", "storage", "board"] as const) if (dist(findStation(this.map, k)!, at) < 2) return notice("ตรงนี้ขวางทาง ขยับออกไปหน่อย");
    if (!Array.isArray(m.items) || !m.items.length || m.items.length > STALL_SLOTS) return notice(`วางขายได้ 1-${STALL_SLOTS} รายการ`);
    const want = (m.items as unknown[]).map((v) => {
      const it = (v ?? {}) as { uid?: unknown; qty?: unknown; price?: unknown };
      return { uid: typeof it.uid === "string" ? it.uid : null, qty: wholeNumber(it.qty, 1, 999), price: wholeNumber(it.price, 1, PRICE_MAX) };
    });
    if (want.some((w) => w.uid === null || w.qty === null || w.price === null)) return notice("ใส่จำนวนและราคาเป็นเลขจำนวนเต็ม");
    const row: market.StallRow = {
      id: globalThis.crypto.randomUUID(),
      account_id: c.accountId,
      owner: p.name,
      color: p.color,
      weapon: p.weapon,
      helm: p.helm,
      title: cleanChat(m.title, STALL_TITLE_MAX) ?? `แผงของ ${p.name}`,
      x: at.x,
      y: at.y,
      items: [],
      expires: Date.now() + STALL_MS,
    };
    const ok = this.trade(client, p, c, (d, me) => {
      const items: StallItem[] = [];
      for (const w of want) {
        const s = takeStack(me.inv.bag, w.uid!, w.qty!);
        if (!s) throw new TradeError("ของไม่พอ");
        items.push({ stack: s, price: w.price! });
      }
      row.items = items;
      market.putStall(d, row);
    });
    if (!ok) return;
    this.stopInteract(client, c);
    c.targetId = null;
    c.stall = row.id;
    this.showStall(row);
    this.sendStall(client, row.id);
  }

  private handleStallClose(client: Client) {
    const pc = this.get(client);
    if (!pc?.c.stall) return;
    if (this.closeStall(pc.c.stall)) client.send(Msg.StallData, null);
  }

  private handleStallVisit(client: Client, msg: unknown) {
    const pc = this.get(client);
    const id = (msg as { id?: unknown } | null)?.id;
    const s = typeof id === "string" ? this.stalls.get(id) : undefined;
    if (!pc || !s || pc.p.dead || pc.c.charge) return;
    if (pc.c.stall === s.id) return this.sendStall(client, s.id);
    if (this.sitting(client, pc.c)) return;
    this.walkBeside(client, pc.p, pc.c, { x: s.x, y: s.y, res: null, station: null, bundle: null, stall: s.id, doneAt: 0 });
  }

  private sendStall(client: Client, id: string) {
    const s = this.stalls.get(id);
    if (!s) return client.send(Msg.StallData, null);
    const mine = this.ctl.get(client.sessionId)?.accountId === s.account_id;
    const data: StallData = { id, owner: s.owner, title: s.title, items: s.items, mine, expires: s.expires };
    client.send(Msg.StallData, data);
  }

  private handleStallBuy(client: Client, msg: unknown) {
    const pc = this.get(client);
    const m = (msg ?? {}) as { id?: unknown; uid?: unknown; qty?: unknown };
    const s = typeof m.id === "string" ? this.stalls.get(m.id) : undefined;
    const qty = wholeNumber(m.qty, 1, 999);
    if (!pc || pc.p.dead || qty === null) return;
    if (!s) return client.send(Msg.StallData, null);
    const { p, c } = pc;
    if (s.account_id === c.accountId) return;
    if (dist(p, s) > STALL_RANGE) return client.send(Msg.Notice, { text: "อยู่ไกลเกินไป เดินเข้าไปใกล้ก่อน" });
    const it = s.items.find((x) => x.stack.uid === m.uid);
    if (!it || it.stack.qty < qty) {
      client.send(Msg.Notice, { text: "มีคนซื้อไปก่อนแล้ว" });
      return this.sendStall(client, s.id);
    }
    const items: StallItem[] = s.items.map((x) => (x === it ? { ...x, stack: { ...x.stack, qty: x.stack.qty - qty } } : x)).filter((x) => x.stack.qty > 0);
    const total = it.price * qty;
    const ok = this.trade(client, p, c, (d, me) => {
      me.gold -= total;
      if (me.gold < 0) throw new TradeError(`เหรียญไม่พอ ต้องใช้ ${total} เหรียญ`);
      if (!addStack(me.inv.bag, BAG_SIZE, { ...it.stack, qty })) throw new TradeError("กระเป๋าเต็ม");
      market.addClaim(d, s.account_id, total, null, `ขาย ${stackName(it.stack)} × ${qty}`); // no tax at stalls
      if (items.length) market.putStall(d, { ...s, items });
      else market.removeStall(d, s.id);
    });
    if (!ok) return;
    s.items = items;
    client.send(Msg.Notice, { text: `ซื้อ ${stackName(it.stack)} × ${qty} แล้ว` });
    this.collectFor(s.account_id);
    const owner = this.ownerOf(s);
    const oc = owner && this.clientOf(owner[0]);
    oc?.send(Msg.Notice, { text: `${p.name} ซื้อ ${stackName(it.stack)} × ${qty}` });
    if (!items.length) {
      this.hideStall(s.id);
      oc?.send(Msg.Notice, { text: "ของในแผงขายหมดแล้ว" });
      oc?.send(Msg.StallData, null);
    } else if (oc) this.sendStall(oc, s.id);
    this.sendStall(client, s.id);
  }

  // ---- game master --------------------------------------------------------

  private clientOf(id: string) {
    return this.clients.find((cl) => cl.sessionId === id);
  }

  /** Runs `fn` for a player who is really here, then tells and saves them. */
  private adminEdit(id: string, fn: (p: Player, c: PlayerCtl) => void) {
    const p = this.state.players.get(id);
    const c = this.ctl.get(id);
    if (!p || !c || c.leaving) return;
    fn(p, c);
    const worn = equipTotals(c.inv.equip);
    c.mods = passiveMods(c.nodes, worn.mods);
    c.gear = worn.flat;
    this.applyStats(p, c, false);
    this.sendPrivate(this.clientOf(id));
    this.save(p, c).catch((e) => console.error("[world] save failed", e));
  }

  private adminHost: AdminHost = {
    playerByName: (name) => {
      const want = name.toLowerCase();
      for (const [id, p] of this.state.players) if (p.name.toLowerCase() === want && !this.ctl.get(id)?.leaving) return id;
      return null;
    },
    nameOf: (id) => this.state.players.get(id)?.name ?? "?",
    online: () => [...this.state.players.values()].map((p) => `${p.name} Lv ${p.level}`),
    posOf: (id) => this.state.players.get(id) ?? this.map.spawn,
    setLevel: (id, level) =>
      this.adminEdit(id, (p, c) => {
        p.level = level;
        p.exp = 0;
        // no more nodes or skills than the new level allows
        c.nodes = cleanNodes([...c.nodes], level, p.job);
        if (this.skillPointsLeft(p) < 0) p.skills.clear();
        this.applyStats(p, c, false);
        if (!p.dead) p.hp = p.maxHp;
      }),
    addExp: (id, amount) => {
      const p = this.state.players.get(id);
      const c = this.ctl.get(id);
      if (p && c) this.gainExp(this.clientOf(id), p, c, amount);
    },
    addGold: (id, amount) => this.adminEdit(id, (_p, c) => (c.gold = Math.max(0, c.gold + amount))),
    give: (id, item, qty, quality) => {
      let left = qty;
      this.adminEdit(id, (p, c) => {
        if (ITEMS[item].kind !== "equip") left = addItem(c.inv.bag, BAG_SIZE, item, qty);
        else
          for (; left > 0 && c.inv.bag.length < BAG_SIZE; left--)
            c.inv.bag.push({ uid: globalThis.crypto.randomUUID(), id: item, qty: 1, quality, affixes: rollAffixes(quality, ITEMS[item].tier) });
      });
      return left;
    },
    setSmithing: (id, skill) => this.adminEdit(id, (_p, c) => (c.inv.smithing = c.inv.woodwork = c.inv.tailoring = skill)),
    setJob: (id, job) =>
      this.adminEdit(id, (p, c) => {
        this.putAwayWeapon(p, c, job);
        p.job = job;
        p.skills.clear();
        c.nodes = cleanNodes([...c.nodes], p.level, job);
        this.showGear(p, c.inv);
        this.applyStats(p, c, true);
      }),
    resetTree: (id) => this.adminEdit(id, (_p, c) => c.nodes.clear()),
    heal: (id) => {
      const p = this.state.players.get(id);
      if (p && !p.dead) p.hp = p.maxHp;
    },
    kill: (id) => {
      const p = this.state.players.get(id);
      const c = this.ctl.get(id);
      if (!p || !c || p.dead || c.leaving) return false;
      p.hp = 0;
      this.playerDies(id, p, c, "พลังของ GM");
      return true;
    },
    toggleGod: (id) => {
      const c = this.ctl.get(id);
      return c ? (c.god = !c.god) : false;
    },
    setSpeed: (id, times) => {
      const c = this.ctl.get(id);
      if (c) c.speedTimes = times;
    },
    setCorruption: (id, value) => {
      const c = this.ctl.get(id);
      if (!c || !this.map.pvp) return false;
      c.corruption = value;
      return true;
    },
    teleport: (id, x, y) => {
      const p = this.state.players.get(id);
      const c = this.ctl.get(id);
      if (!p || !c || p.dead || !isWalkable(this.map, x, y)) return false;
      this.stopInteract(this.clientOf(id), c);
      c.path = [];
      c.targetId = null;
      c.pendingSkill = null;
      c.charge = null;
      p.x = x;
      p.y = y;
      p.moving = false;
      return true;
    },
    goZone: (id, zone) => {
      const p = this.state.players.get(id);
      const c = this.ctl.get(id);
      const client = this.clientOf(id);
      if (!p || !c || !client || p.dead || c.leaving || zone === this.map.id) return false;
      this.travel(client, p, c, zone);
      return true;
    },
    spawn: (kind, count, x, y) => this.monsterSys.summon(kind, count, x, y),
    clearMonsters: (x, y, r) => this.monsterSys.clearNear(x, y, r),
    moveGates: () => {
      if (!this.map.pvp) return false;
      this.moveGates(true);
      return true;
    },
    announce: (text) => this.broadcastSystem(`[ประกาศ] ${text}`),
    kick: (id) => {
      const client = this.clientOf(id);
      client?.send(Msg.Notice, { text: "GM เชิญคุณออกจากเกม" });
      client?.leave(4001);
    },
  };

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
    const mine = this.ctl.get(me);
    if (mine && c && party.sameParty(mine.accountId, c.accountId)) return undefined;
    return p && c && !p.dead && !c.leaving && c.shieldUntil <= this.clock.currentTime ? p : undefined;
  }

  private nearestPlayer(x: number, y: number, range: number): string | null {
    let best: string | null = null;
    let bestD = range;
    this.state.players.forEach((p, id) => {
      const ct = this.ctl.get(id);
      if (p.dead || !ct || ct.leaving || ct.shieldUntil > this.clock.currentTime || isCalm(this.map, p.x, p.y)) return;
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
    if (c.god || Math.random() * 100 < c.mods.dodge) {
      const ev: HitEvent = { from: monsterId, to: playerId, dmg: 0, miss: true };
      this.broadcast(Msg.Hit, ev);
      return;
    }
    const crit = Math.random() < CRIT_CHANCE;
    let dmg = hitDamage(atk, this.statsOf(p, c).def, 1, Math.random(), crit);
    dmg = this.taken(p, c, dmg, now);
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
    c.leaping = false;
    c.blessUntil = c.manaShieldUntil = c.slowUntil = c.markUntil = c.guardUntil = 0;
    p.blessed = p.manaShield = p.slowed = p.marked = false;
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
  private playerHits(id: string, p: Player, c: PlayerCtl, targetId: string, power: number, skill?: string, stunMs = 0, defIgnore = 0) {
    if (this.state.monsters.has(targetId)) this.playerHitsMonster(id, p, c, targetId, power, skill, stunMs, defIgnore);
    else this.playerHitsPlayer(id, p, c, targetId, power, skill, stunMs, defIgnore);
  }

  private playerHitsPlayer(id: string, p: Player, c: PlayerCtl, targetId: string, power: number, skill?: string, stunMs = 0, defIgnore = 0) {
    if (!this.targetOf(id, targetId)) return;
    const t = this.state.players.get(targetId)!;
    const tc = this.ctl.get(targetId)!;
    const now = this.clock.currentTime;
    faceTowards(p, t);
    c.lastCombatAt = tc.lastCombatAt = now;
    c.shieldUntil = 0; // whoever attacks gives up the arrival shield
    if (tc.god || Math.random() * 100 < tc.mods.dodge) {
      this.broadcast(Msg.Hit, { from: id, to: targetId, dmg: 0, miss: true } satisfies HitEvent);
      return;
    }
    const crit = Math.random() < this.critChance(c, targetId);
    let dmg = hitDamage(this.statsOf(p, c).atk, this.statsOf(t, tc).def, this.boosted(p, c, power, skill), Math.random(), crit, defIgnore);
    dmg = this.taken(t, tc, dmg * PVP_DAMAGE * (tc.markUntil > now ? 1 + tc.mark : 1), now);
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
  private playerHitsMonster(id: string, p: Player, c: PlayerCtl, monsterId: string, power: number, skill?: string, stunMs = 0, defIgnore = 0) {
    const m = this.state.monsters.get(monsterId);
    const mc = this.monsterSys.ctl.get(monsterId);
    if (!m || !mc) return;
    faceTowards(p, m);
    const crit = Math.random() < this.critChance(c, monsterId);
    let dmg = hitDamage(this.statsOf(p, c).atk, mc.def_, this.boosted(p, c, power, skill), Math.random(), crit, defIgnore);
    if (mc.markUntil > this.clock.currentTime) dmg = Math.round(dmg * (1 + mc.mark));
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
      const night = this.map.id === "brindle" && m.kind === "scarecrow" && isNight() ? NIGHT_BONUS : 1;
      this.giveLoot(client, p, c, rollDrops(mc.def.drops, c.inv.bag, Math.random, corruptionBonus(c.corruption)));
      // the party nearby shares EXP and coins, with a little bonus for each friend
      const sharers = this.sharersOf(id, c, m);
      const share = (1 + PARTY_BONUS * (sharers.length - 1)) / sharers.length;
      for (const [sid, sp, sc] of sharers) {
        const cl = sid === id ? client : this.clientOf(sid);
        sc.gold += Math.round(killGold(mc.def) * night * share);
        if (sid !== id) this.sendPrivate(cl);
        this.gainExp(cl, sp, sc, killExp(Math.round(mc.exp * night * share), level, sp.level));
      }
      this.sendPrivate(client);
      if (mc.def.boss) this.broadcastSystem(`${p.name} ปราบ${MONSTERS[m.kind]?.name ?? "บอส"}ได้แล้ว!`);
    }
  }

  /** Who gets a share of this kill: the killer and party members close by. */
  private sharersOf(id: string, c: PlayerCtl, at: { x: number; y: number }): [string, Player, PlayerCtl][] {
    const out: [string, Player, PlayerCtl][] = [[id, this.state.players.get(id)!, c]];
    const friends = new Set(party.partyMembers(c.accountId));
    if (friends.size < 2) return out;
    for (const [sid, sc] of this.ctl) {
      const sp = this.state.players.get(sid);
      if (sid === id || !sp || sp.dead || sc.leaving || sc.lingerUntil || !friends.has(sc.accountId)) continue;
      if (dist(sp, at) <= PARTY_SHARE_RANGE) out.push([sid, sp, sc]);
    }
    return out;
  }

  // ---- parties --------------------------------------------------------------

  sendToAccount(accountId: number, type: string, payload: unknown): boolean {
    for (const [sid, c] of this.ctl)
      if (c.accountId === accountId && !c.leaving && !c.lingerUntil) {
        const client = this.clientOf(sid);
        if (!client) continue;
        client.send(type, payload);
        return true;
      }
    return false;
  }

  private handleParty(client: Client, msg: PartyAction) {
    const pc = this.get(client);
    if (!pc || typeof msg?.action !== "string") return;
    const me = pc.c.accountId;
    try {
      switch (msg.action) {
        case "invite": {
          const name = typeof msg.name === "string" ? msg.name.trim() : "";
          const to = name ? party.findOnline(name) : null;
          if (!to) throw new PartyError("ไม่พบผู้เล่นที่ออนไลน์ชื่อนี้");
          party.invite(me, to);
          client.send(Msg.Notice, { text: `ส่งคำชวนเข้าปาร์ตี้ให้ ${party.nameOf(to)} แล้ว` });
          break;
        }
        case "accept":
          party.accept(me);
          break;
        case "decline":
          party.decline(me);
          break;
        case "leave":
          party.leave(me);
          break;
        case "kick":
          party.kick(me, typeof msg.name === "string" ? msg.name : "");
          break;
      }
    } catch (e) {
      if (e instanceof PartyError) client.send(Msg.Notice, { text: e.message });
      else throw e;
    }
    this.tickParties();
  }

  /** Tells the party list where everyone is, and shows each member their party. */
  private tickParties() {
    const now = Date.now();
    this.state.players.forEach((p, sid) => {
      const c = this.ctl.get(sid);
      if (!c || c.leaving) return;
      party.report(c.accountId, {
        name: p.name, level: p.level, job: p.job, hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp, dead: p.dead,
        zone: this.map.id, online: !c.lingerUntil, since: c.lingerUntil ? now : 0,
      });
    });
    party.sweep(now);
    for (const client of this.clients) {
      const c = this.ctl.get(client.sessionId);
      if (!c || c.leaving) continue;
      const data = party.view(c.accountId);
      for (const m of data.members) {
        if (m.zone !== this.map.id || !m.online) continue;
        for (const [sid, mc] of this.ctl) if (mc.accountId === m.id && !mc.leaving) m.sid = sid;
      }
      const key = JSON.stringify(data);
      if ((c as any).partyKey === key) continue;
      (c as any).partyKey = key;
      client.send(Msg.Party, data);
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
    const spring = this.map.springs.some((s) => dist(s, p) <= s.r);
    if (p.inSpring !== spring) p.inSpring = spring;
    if (spring) c.corruption = Math.max(0, c.corruption - SPRING_PER_SEC * dt);
    else c.corruption = Math.min(100, c.corruption + (CORRUPTION_PER_MIN / 60) * dt);
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

      this.tickEffects(p, c, now, dt);
      const speed = WALK_SPEED * (1 + c.mods.moveSpeedPct / 100) * c.speedTimes * (c.windUntil > now ? 1 + WIND_SPEED : 1) * (c.slowUntil > now ? 1 - c.slow : 1);
      const weaponRange = attackRange(ITEMS[c.inv.equip.weapon?.id ?? ""]?.look);
      const reach = c.pendingSkill ? SKILLS[c.pendingSkill].range : weaponRange;
      const swingMs = PLAYER_ATTACK_MS / (1 + c.mods.attackSpeedPct / 100);

      if (c.leaping) {
        stepAlong(p, c.path, WALK_SPEED * 4, dt);
        if (!c.path.length) c.leaping = false;
      } else if (c.charge) {
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
            if (inReach(this.map, p, m, ATTACK_RANGE + 0.5)) this.playerHits(id, p, c, targetId, power, "charge", stunMs);
          }
        }
      } else if (c.targetId) {
        const m = this.targetOf(id, c.targetId);
        if (!m) {
          c.targetId = null;
          c.pendingSkill = null;
        } else if (inReach(this.map, p, m, reach)) {
          if (c.path.length > 1) c.path.length = 1; // finish this step, then stop
          stepAlong(p, c.path, speed, dt);
          if (!c.path.length) {
            faceTowards(p, m);
            const skill = c.pendingSkill;
            if (skill) {
              c.pendingSkill = null;
              const client = this.clientOf(id);
              if (client && (c.cooldowns.get(skill) ?? 0) <= now && this.payFor(client, p, c, skill)) {
                c.nextAttackAt = now + swingMs;
                this.castAt(id, p, c, c.targetId, skill);
              }
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

      const exit = this.map.exits.find((e) => dist(e, p) < 0.7);
      const walker = exit && this.clientOf(id);
      if (exit && walker) {
        this.travel(walker, p, c, exit.to, exit.at);
        return;
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

    this.tickMap();
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
