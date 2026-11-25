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
import { buildBrindleVillage, GameMap, isSafe, isWalkable } from "../../../shared/map";
import { cleanChat, cleanName } from "../../../shared/names";
import { canReach, canRefund, cleanNodes, Mods, passiveMods, passivePointsEarned, PASSIVES, refundCost } from "../../../shared/passives";
import { findPath, Point } from "../../../shared/pathfinding";
import { ChatLine, CooldownEvent, HitEvent, JoinOptions, Msg, PrivateData } from "../../../shared/protocol";
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
import { CharacterRow, createAccount, login, saveCharacter } from "../db";
import { MonsterSystem } from "../game/monsters";
import { dist, faceTowards, planFrom, stepAlong } from "../game/movement";
import { Player, WorldState } from "./schema";

export { facingFor } from "../game/movement";

/** Server-only data kept per player (not sent to clients). */
interface PlayerCtl {
  accountId: number;
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
  /** bonuses from `nodes`, worked out again whenever they change */
  mods: Mods;
  /** monsters already hit once (for the "first strike" keystone) */
  struck: Set<string>;
}

interface AuthData {
  character: CharacterRow;
}

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  map!: GameMap;
  ctl = new Map<string, PlayerCtl>();
  monsterSys!: MonsterSystem;
  /** accounts that are logged in (or logging in), to stop double logins */
  private onlineAccounts = new Set<number>();

  onCreate() {
    this.map = buildBrindleVillage();
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
    this.onMessage(Msg.Sync, (client) => this.sendPrivate(client));
    this.onMessage(Msg.Respawn, (client) => this.handleRespawn(client));
    this.onMessage(Msg.Chat, (client, msg) => this.handleChat(client, msg));
  }

  // ---- joining and leaving ------------------------------------------------

  async onAuth(_client: Client, options: Partial<JoinOptions>): Promise<AuthData> {
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
    if (this.onlineAccounts.has(character.account_id)) throw new ServerError(409, "ตัวละครนี้ออนไลน์อยู่แล้ว");
    this.onlineAccounts.add(character.account_id);
    // if the join never completes, free the name again
    this.clock.setTimeout(() => {
      if (![...this.ctl.values()].some((c) => c.accountId === character!.account_id))
        this.onlineAccounts.delete(character!.account_id);
    }, 15000);
    return { character };
  }

  onJoin(client: Client, _options: unknown, auth: AuthData) {
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
    const mods = passiveMods(nodes);
    this.applyStats(p, mods, true);
    const saved = { x: Math.round(c.x), y: Math.round(c.y) };
    const spot = c.x >= 0 && isWalkable(this.map, saved.x, saved.y) ? saved : this.findSpawn();
    p.x = spot.x;
    p.y = spot.y;
    p.facing = Math.floor(Math.random() * 8);
    this.state.players.set(client.sessionId, p);
    this.ctl.set(client.sessionId, {
      accountId: c.account_id,
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
      mods,
      struck: new Set(),
    });
    this.broadcastSystem(`${p.name} เดินทางมาถึงหมู่บ้านบรินเดิล`);
    console.log(`[world] join ${p.name} (${client.sessionId}), online ${this.clients.length}`);
  }

  async onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    const c = this.ctl.get(client.sessionId);
    if (p && c) await this.save(p, c).catch((e) => console.error("[world] save failed", e));
    this.state.players.delete(client.sessionId);
    this.ctl.delete(client.sessionId);
    this.monsterSys.forget(client.sessionId);
    if (c) this.onlineAccounts.delete(c.accountId);
    if (p) {
      this.broadcastSystem(`${p.name} ออกจากเกมแล้ว`);
      console.log(`[world] leave ${p.name}, online ${this.clients.length}`);
    }
  }

  async onDispose() {
    await this.saveAll();
  }

  private async save(p: Player, c: PlayerCtl) {
    const tile = { x: Math.round(p.x), y: Math.round(p.y) };
    const ok = !p.dead && isWalkable(this.map, tile.x, tile.y);
    await saveCharacter({
      account_id: c.accountId,
      level: p.level,
      exp: p.exp,
      job: p.job,
      skills: JSON.stringify(Object.fromEntries(p.skills.entries())),
      nodes: JSON.stringify([...c.nodes]),
      gold: c.gold,
      x: ok ? tile.x : -1,
      y: ok ? tile.y : -1,
    });
  }

  private async saveAll() {
    for (const [id, p] of this.state.players) {
      const c = this.ctl.get(id);
      if (c) await this.save(p, c).catch((e) => console.error("[world] autosave failed", e));
    }
  }

  private findSpawn(): Point {
    const { spawn } = this.map;
    for (let tries = 0; tries < 50; tries++) {
      const x = spawn.x + Math.floor(Math.random() * 5) - 2;
      const y = spawn.y + Math.floor(Math.random() * 5) - 2;
      if (isWalkable(this.map, x, y)) return { x, y };
    }
    return { ...spawn };
  }

  // ---- stats --------------------------------------------------------------

  private applyStats(p: Player, mods: Mods, heal: boolean) {
    const s = playerStats(p.level, p.job as Job, mods);
    p.maxHp = s.maxHp;
    p.hp = heal ? s.maxHp : Math.min(p.hp, s.maxHp);
  }

  private statsOf(p: Player, c: PlayerCtl) {
    return playerStats(p.level, p.job as Job, c.mods);
  }

  private sendPrivate(client: Client | undefined) {
    const c = client && this.ctl.get(client.sessionId);
    if (!c) return;
    const data: PrivateData = { gold: c.gold, nodes: [...c.nodes] };
    client.send(Msg.Private, data);
  }

  /** Passive nodes changed: work out bonuses again, tell the player, save. */
  private nodesChanged(client: Client, p: Player, c: PlayerCtl) {
    c.mods = passiveMods(c.nodes);
    this.applyStats(p, c.mods, false);
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
      this.applyStats(p, c.mods, true);
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
    return p && c ? { p, c } : null;
  };

  private handleMove(client: Client, msg: unknown) {
    const pc = this.get(client);
    if (!pc || pc.p.dead || pc.c.charge || typeof msg !== "object" || msg === null) return;
    const gx = Math.floor(Number((msg as Point).x));
    const gy = Math.floor(Number((msg as Point).y));
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;
    pc.c.targetId = null;
    pc.c.pendingSkill = null;
    // Plan from the tile we are standing on, or the tile we are stepping into.
    const from = planFrom(pc.p, pc.c.path);
    const rest = findPath(this.map, from, { x: gx, y: gy }, MAX_PATH_STEPS);
    if (!rest) return; // unreachable or blocked: ignore the click
    pc.c.path = pc.c.path.length ? [pc.c.path[0], ...rest] : rest;
  }

  private handleAttack(client: Client, msg: unknown) {
    const pc = this.get(client);
    const id = (msg as { id?: unknown })?.id;
    if (!pc || pc.p.dead || pc.c.charge || typeof id !== "string" || !this.state.monsters.has(id)) return;
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
    const m = targetId ? this.state.monsters.get(targetId) : undefined;
    if (!m) return client.send(Msg.Notice, { text: "เลือกเป้าหมายก่อน (คลิกที่มอนสเตอร์)" });

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
    this.applyStats(pc.p, pc.c.mods, true);
    this.broadcastSystem(`${pc.p.name} ได้เป็น${JOB_NAMES.squire}แล้ว!`);
    this.save(pc.p, pc.c).catch(() => {});
  }

  private handleLearnPassive(client: Client, msg: unknown) {
    const pc = this.get(client);
    const id = (msg as { id?: unknown })?.id;
    if (!pc || typeof id !== "string") return;
    const { p, c } = pc;
    if (c.nodes.size >= passivePointsEarned(p.level)) return client.send(Msg.Notice, { text: "ไม่มีแต้มต้นไม้เหลือ" });
    if (!canReach(id, c.nodes, p.job)) return;
    c.nodes.add(id);
    this.nodesChanged(client, p, c);
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
    this.nodesChanged(client, p, c);
    client.send(Msg.Notice, { text: `ล้างโหนด ${PASSIVES.get(id)?.name ?? ""} แล้ว เสีย ${cost} เหรียญ` });
  }

  private handleRespawn(client: Client) {
    const pc = this.get(client);
    if (!pc || !pc.p.dead) return;
    if (this.clock.currentTime - pc.c.deadAt < RESPAWN_DELAY_MS) return;
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

  private nearestPlayer(x: number, y: number, range: number): string | null {
    let best: string | null = null;
    let bestD = range;
    this.state.players.forEach((p, id) => {
      if (p.dead || isSafe(this.map, p.x, p.y)) return;
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
    if (!p || !c || p.dead) return;
    const now = this.clock.currentTime;
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
    if (killed) this.playerDies(playerId, p, c);
  }

  private playerDies(id: string, p: Player, c: PlayerCtl) {
    p.dead = true;
    p.moving = false;
    p.guarding = false;
    c.path = [];
    c.targetId = null;
    c.pendingSkill = null;
    c.charge = null;
    c.deadAt = this.clock.currentTime;
    const loss = Math.floor(expToNext(p.level) * DEATH_EXP_LOSS);
    p.exp = Math.max(0, p.exp - loss);
    this.monsterSys.forget(id);
    const client = this.clients.find((cl) => cl.sessionId === id);
    client?.send(Msg.Notice, { text: `คุณหมดสติ เสีย EXP ${loss}` });
  }

  /** A player lands a hit on a monster. */
  private playerHitsMonster(id: string, p: Player, c: PlayerCtl, monsterId: string, power: number, skill?: string, stunMs = 0) {
    const m = this.state.monsters.get(monsterId);
    const mc = this.monsterSys.ctl.get(monsterId);
    if (!m || !mc) return;
    faceTowards(p, m);
    const { mods } = c;
    let chance = CRIT_CHANCE + mods.critChance / 100;
    if (mods.firststrike) chance = c.struck.has(monsterId) ? chance * 0.5 : 1;
    if (c.struck.size > 100) for (const s of c.struck) if (!this.state.monsters.has(s)) c.struck.delete(s);
    c.struck.add(monsterId);
    const crit = Math.random() < chance;
    let boost = power;
    if (skill) boost *= 1 + mods.skillDmgPct / 100;
    if (p.hp < p.maxHp / 2) boost *= 1 + mods.lowHpDmgPct / 100;
    const dmg = hitDamage(this.statsOf(p, c).atk, mc.def_, boost, Math.random(), crit);
    c.lastCombatAt = this.clock.currentTime;
    // life steal counts only damage the monster could still take
    if (mods.lifesteal > 0) p.hp = Math.min(p.maxHp, p.hp + Math.round((Math.min(dmg, m.hp) * mods.lifesteal) / 100));
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
      this.sendPrivate(client);
      this.gainExp(client, p, c, killExp(mc.exp, level, p.level));
      if (mc.def.boss) this.broadcastSystem(`${p.name} ปราบ${MONSTERS[m.kind]?.name ?? "บอส"}ได้แล้ว!`);
    }
  }

  tick(dtMs: number) {
    const dt = Math.min(dtMs, 250) / 1000;
    const now = this.clock.currentTime;

    this.state.players.forEach((p, id) => {
      const c = this.ctl.get(id);
      if (!c || p.dead) return;

      if (p.guarding && c.guardUntil <= now) p.guarding = false;
      const speed = WALK_SPEED * (1 + c.mods.moveSpeedPct / 100);
      const swingMs = PLAYER_ATTACK_MS / (1 + c.mods.attackSpeedPct / 100);

      if (c.charge) {
        const m = this.state.monsters.get(c.charge.targetId);
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
            if (dist(p, m) <= ATTACK_RANGE + 0.5) this.playerHitsMonster(id, p, c, targetId, power, "charge", stunMs);
          }
        }
      } else if (c.targetId) {
        const m = this.state.monsters.get(c.targetId);
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
              this.playerHitsMonster(id, p, c, c.targetId, (def.power ?? 1) + (def.powerPerLevel ?? 0) * (lvl - 1), skill);
            } else if (now >= c.nextAttackAt) {
              c.nextAttackAt = now + swingMs;
              this.playerHitsMonster(id, p, c, c.targetId, 1);
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

    this.monsterSys.tick(dt);
  }
}
