import { GameMap, isSafe, isWalkable, ZoneId } from "../../../shared/map";
import { findPath, Point } from "../../../shared/pathfinding";
import { ATTACK_RANGE, MonsterDef, MONSTERS, monsterStats } from "../../../shared/stats";
import spawnsJson from "../../../shared/data/spawns.json";
import hollowSpawnsJson from "../../../shared/data/spawns_hollow.json";
import mossfenSpawnsJson from "../../../shared/data/spawns_mossfen.json";
import { Monster } from "../rooms/schema";
import { dist, faceTowards, planFrom, stepAlong } from "./movement";

export interface SpawnDef {
  kind: string;
  x: number;
  y: number;
  radius: number;
  count: number;
  respawnMs: number;
}
export const SPAWNS: Record<ZoneId, SpawnDef[]> = { brindle: spawnsJson, mossfen: mossfenSpawnsJson, hollow: hollowSpawnsJson };

type AIState = "idle" | "chase" | "return";

/** Server-only brain of one monster. */
export interface MonsterCtl {
  id: string;
  def: MonsterDef;
  spawn: SpawnDef;
  home: Point;
  state: AIState;
  path: Point[];
  targetId: string | null;
  nextAttackAt: number;
  nextThinkAt: number;
  repathAt: number;
  stunUntil: number;
  atk: number;
  def_: number;
  exp: number;
  /** who did how much damage, for future loot/EXP sharing */
  lastHitBy: string | null;
}

/** What the monster system needs from the room. */
export interface MonsterHost {
  map: GameMap;
  monsters: Map<string, Monster>;
  /** Live, attackable players with positions. */
  playerAt(id: string): { x: number; y: number; dead: boolean } | undefined;
  nearestPlayer(x: number, y: number, range: number): string | null;
  monsterHitsPlayer(monsterId: string, playerId: string, atk: number): void;
  now(): number;
}

export class MonsterSystem {
  ctl = new Map<string, MonsterCtl>();
  private nextId = 1;
  /** Pending respawns: when, which spawn. */
  private respawns: { at: number; spawn: SpawnDef }[] = [];

  constructor(private host: MonsterHost) {}

  spawnAll() {
    for (const s of SPAWNS[this.host.map.id]) for (let i = 0; i < s.count; i++) this.spawnOne(s);
  }

  private spawnOne(spawn: SpawnDef) {
    const def = MONSTERS[spawn.kind];
    if (!def) throw new Error(`unknown monster kind ${spawn.kind}`);
    const at = this.randomTileNear(spawn, spawn.radius);
    if (!at) return;
    const level = def.level[0] + Math.floor(Math.random() * (def.level[1] - def.level[0] + 1));
    const st = monsterStats(def, level);
    const m = new Monster();
    m.kind = spawn.kind;
    m.level = level;
    m.x = at.x;
    m.y = at.y;
    m.hp = m.maxHp = st.maxHp;
    m.facing = Math.floor(Math.random() * 8);
    const id = `m${this.nextId++}`;
    this.host.monsters.set(id, m);
    this.ctl.set(id, {
      id,
      def,
      spawn,
      home: at,
      state: "idle",
      path: [],
      targetId: null,
      nextAttackAt: 0,
      nextThinkAt: this.host.now() + 1000 + Math.random() * 4000,
      repathAt: 0,
      stunUntil: 0,
      atk: st.atk,
      def_: st.def,
      exp: st.exp,
      lastHitBy: null,
    });
  }

  /** Game master: monsters that do not come back when killed. Returns how many appeared. */
  summon(kind: string, count: number, x: number, y: number): number {
    const before = this.ctl.size;
    for (let i = 0; i < count; i++) this.spawnOne({ kind, x, y, radius: 3, count: 1, respawnMs: Infinity });
    return this.ctl.size - before;
  }

  /** Game master: removes monsters nearby; normal ones come back later. */
  clearNear(x: number, y: number, radius: number): number {
    let n = 0;
    for (const id of [...this.ctl.keys()]) {
      const m = this.host.monsters.get(id);
      if (!m || Math.hypot(m.x - x, m.y - y) > radius) continue;
      this.remove(id);
      n++;
    }
    return n;
  }

  private remove(id: string) {
    const c = this.ctl.get(id);
    this.host.monsters.delete(id);
    this.ctl.delete(id);
    if (c && Number.isFinite(c.spawn.respawnMs)) this.respawns.push({ at: this.host.now() + c.spawn.respawnMs, spawn: c.spawn });
  }

  private randomTileNear(c: { x: number; y: number }, r: number): Point | null {
    for (let i = 0; i < 40; i++) {
      const x = Math.round(c.x + (Math.random() * 2 - 1) * r);
      const y = Math.round(c.y + (Math.random() * 2 - 1) * r);
      if (isWalkable(this.host.map, x, y)) return { x, y };
    }
    return null;
  }

  /** A player hit this monster. Returns true when it died. */
  takeDamage(id: string, attackerId: string, dmg: number, stunMs = 0): boolean {
    const m = this.host.monsters.get(id);
    const c = this.ctl.get(id);
    if (!m || !c) return false;
    m.hp = Math.max(0, m.hp - dmg);
    c.lastHitBy = attackerId;
    if (stunMs > 0) {
      c.stunUntil = this.host.now() + stunMs;
      m.stunned = true;
    }
    if (c.state === "idle") {
      c.state = "chase";
      c.targetId = attackerId;
      c.nextAttackAt = Math.max(c.nextAttackAt, this.host.now() + 500);
    }
    if (m.hp <= 0) {
      this.remove(id);
      return true;
    }
    return false;
  }

  /** Monsters chasing this player give up (player died or left). */
  forget(playerId: string) {
    for (const c of this.ctl.values()) if (c.targetId === playerId) this.goHome(c);
  }

  private goHome(c: MonsterCtl) {
    const m = this.host.monsters.get(c.id)!;
    c.state = "return";
    c.targetId = null;
    c.path = findPath(this.host.map, planFrom(m, c.path), c.home, 120) ?? [];
    if (!c.path.length) {
      // stuck somewhere odd: just pop back home
      m.x = c.home.x;
      m.y = c.home.y;
      c.state = "idle";
      m.hp = m.maxHp;
    }
  }

  tick(dt: number) {
    const now = this.host.now();
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      if (this.respawns[i].at <= now) {
        this.spawnOne(this.respawns[i].spawn);
        this.respawns.splice(i, 1);
      }
    }

    for (const c of this.ctl.values()) {
      const m = this.host.monsters.get(c.id);
      if (!m) continue;
      if (c.stunUntil > now) {
        if (m.moving) m.moving = false;
        continue;
      }
      if (m.stunned) m.stunned = false;

      if (c.state === "idle") {
        if (c.def.aggroRange > 0) {
          const pid = this.host.nearestPlayer(m.x, m.y, c.def.aggroRange);
          if (pid) {
            c.state = "chase";
            c.targetId = pid;
            c.path = c.path.slice(0, 1);
          }
        }
        if (c.state === "idle") {
          if (!c.path.length && now >= c.nextThinkAt) {
            const far = c.def.patrol;
            const to = this.randomTileNear(far ? c.spawn : c.home, far ?? 3);
            if (to) c.path = findPath(this.host.map, planFrom(m, c.path), to, far ? 70 : 10) ?? [];
            // a hunter keeps walking, and its "home" moves along with it
            if (far && to && c.path.length) c.home = to;
            c.nextThinkAt = now + (far ? 1500 : 3000) + Math.random() * 5000;
          }
          stepAlong(m, c.path, c.def.speed * 0.5, dt);
          // slow regen while calm
          if (m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + Math.ceil(m.maxHp * 0.02 * dt));
          continue;
        }
      }

      if (c.state === "chase") {
        const p = c.targetId ? this.host.playerAt(c.targetId) : undefined;
        if (!p || p.dead || dist(m, c.home) > c.def.leash || isSafe(this.host.map, p.x, p.y)) {
          this.goHome(c);
        } else {
          const d = dist(m, p);
          if (d <= ATTACK_RANGE) {
            // finish the current step, then fight
            if (c.path.length > 1) c.path.length = 1;
            stepAlong(m, c.path, c.def.speed, dt);
            if (!c.path.length) {
              faceTowards(m, p);
              if (now >= c.nextAttackAt) {
                c.nextAttackAt = now + c.def.attackMs;
                this.host.monsterHitsPlayer(c.id, c.targetId!, c.atk);
              }
            }
          } else {
            if (now >= c.repathAt) {
              c.repathAt = now + 400;
              const goal = { x: Math.round(p.x), y: Math.round(p.y) };
              const from = planFrom(m, c.path);
              const rest = findPath(this.host.map, from, goal, 30);
              if (rest) c.path = c.path.length ? [c.path[0], ...rest] : rest;
            }
            stepAlong(m, c.path, c.def.speed, dt);
          }
          continue;
        }
      }

      if (c.state === "return") {
        stepAlong(m, c.path, c.def.speed * 1.5, dt);
        m.hp = Math.min(m.maxHp, m.hp + Math.ceil(m.maxHp * 0.2 * dt));
        if (!c.path.length) {
          c.state = "idle";
          m.hp = m.maxHp;
          c.nextThinkAt = now + 2000;
        }
      }
    }
  }
}
