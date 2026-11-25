/**
 * Character growth and combat formulas. Both sides use these: the server to
 * decide what happens, the client to show bars and numbers.
 */
import monstersJson from "./data/monsters.json";
import skillsJson from "./data/skills.json";
import type { DropDef, FlatStats } from "./items";
import type { Mods } from "./passives";

export type Job = "wanderer" | "squire";
export const JOB_NAMES: Record<Job, string> = { wanderer: "ผู้พเนจร", squire: "สไควร์" };

export const MAX_LEVEL = 60;
export const JOB_CHANGE_LEVEL = 10;
/** Basic attack: reach in tiles and time between swings. */
export const ATTACK_RANGE = 1.6;
export const PLAYER_ATTACK_MS = 1000;
/** No damage dealt or taken for this long = out of combat (fast regen). */
export const OUT_OF_COMBAT_MS = 5000;
/** EXP lost on death in a peaceful zone, as part of this level's bar (GDD 3.1). */
export const DEATH_EXP_LOSS = 0.01;
export const RESPAWN_DELAY_MS = 2000;

export interface MonsterDef {
  name: string;
  level: [number, number];
  hp: number;
  atk: number;
  def: number;
  exp: number;
  /** coins dropped: [least, most] */
  gold: [number, number];
  drops?: DropDef[];
  speed: number;
  attackMs: number;
  aggroRange: number;
  leash: number;
  boss?: boolean;
  /** walks around this far from where it was born (Hollow hunters) */
  patrol?: number;
}
export const MONSTERS = monstersJson as unknown as Record<string, MonsterDef>;

export interface SkillDef {
  name: string;
  job: Job;
  key: string;
  maxLevel: number;
  cooldownMs: number;
  range: number;
  desc: string;
  power?: number;
  powerPerLevel?: number;
  durationMs?: number;
  reduce?: number;
  reducePerLevel?: number;
  stunMs?: number;
  stunPerLevelMs?: number;
}
export const SKILLS = skillsJson as Record<string, SkillDef>;
export type SkillId = keyof typeof skillsJson;

export interface Stats {
  maxHp: number;
  atk: number;
  def: number;
}

/** EXP needed to go from `level` to the next one. */
export function expToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.round(20 * Math.pow(level, 1.6));
}

export function playerStats(level: number, job: Job, mods?: Mods, gear?: FlatStats): Stats {
  const l = level - 1;
  const s = { maxHp: 80 + 12 * l, atk: 10 + 2.2 * l, def: 3 + l };
  if (job === "squire") {
    s.maxHp *= 1.2;
    s.def *= 1.1;
  }
  if (gear) {
    s.maxHp += gear.hp;
    s.atk += gear.atk;
    s.def += gear.def;
  }
  if (mods) {
    s.maxHp *= 1 + mods.hpPct / 100;
    s.atk *= 1 + mods.atkPct / 100;
    s.def *= 1 + mods.defPct / 100;
  }
  return { maxHp: Math.round(s.maxHp), atk: Math.round(s.atk), def: Math.round(s.def) };
}

/** Monsters get 15% stronger for each level above the lowest of their kind. */
export function monsterStats(def: MonsterDef, level: number): Stats & { exp: number } {
  const k = 1 + 0.15 * (level - def.level[0]);
  return {
    maxHp: Math.round(def.hp * k),
    atk: Math.round(def.atk * k),
    def: Math.round(def.def * k),
    exp: Math.round(def.exp * k),
  };
}

/** Damage of one hit. `roll` is 0..1 (random), so tests can pass a fixed value. */
export function hitDamage(atk: number, def: number, power = 1, roll = 0.5, crit = false): number {
  const base = atk * power * (0.9 + roll * 0.2) - def * 0.5;
  return Math.max(1, Math.round(base * (crit ? 1.5 : 1)));
}

export const CRIT_CHANCE = 0.05;

/** Coins from a kill. `roll` is 0..1 (random). */
export function killGold(def: MonsterDef, roll = Math.random()): number {
  const [lo, hi] = def.gold;
  return lo + Math.floor(roll * (hi - lo + 1));
}

/** EXP from a kill, cut down when the player is far above the monster. */
export function killExp(baseExp: number, monsterLevel: number, playerLevel: number): number {
  const over = playerLevel - monsterLevel - 5;
  const k = over > 0 ? Math.max(0.1, 1 - over * 0.15) : 1;
  return Math.max(1, Math.round(baseExp * k));
}

/** One skill point per level after the first (GDD 2.1). */
export function skillPointsEarned(level: number) {
  return Math.max(0, level - 1);
}
