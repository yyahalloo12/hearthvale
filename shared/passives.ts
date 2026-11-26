/**
 * The passive tree "ผืนทอแห่งชะตา" (GDD 2.2). Nodes and links live in
 * data/passives.json; the rules here are used by the server (to decide) and
 * by the client (to show what can be picked).
 */
import passivesJson from "./data/passives.json";

/** Same values as Job in stats.ts (not imported, so the two files do not need each other). */
import { baseJob } from "./stats";
type JobName = string;

export interface Mods {
  /** attributes */
  str: number;
  agi: number;
  int: number;
  fai: number;
  /** percent bonuses: 3 means +3% */
  hpPct: number;
  atkPct: number;
  defPct: number;
  critChance: number;
  attackSpeedPct: number;
  moveSpeedPct: number;
  dodge: number;
  skillDmgPct: number;
  cdrPct: number;
  regenPct: number;
  lifesteal: number;
  dmgReduce: number;
  lowHpDmgPct: number;
  /** nodes that change skills */
  critDmgPct: number;
  extraProjectiles: number;
  aoePct: number;
  chainJumps: number;
  stunPct: number;
  durationPct: number;
  healPct: number;
  manaCostPct: number;
  mpPct: number;
  meleeSplash: number;
  multiStrike: number;
  /** game-changing nodes */
  bloodthirst: boolean;
  firststrike: boolean;
}
export type NumMod = Exclude<keyof Mods, "bloodthirst" | "firststrike">;

export interface PassiveNode {
  id: string;
  name: string;
  size: "small" | "notable" | "keystone" | "root";
  area: "center" | "end" | "str" | "agi" | "int" | "fai";
  x: number;
  y: number;
  mods: Partial<Record<NumMod, number>>;
  special?: "bloodthirst" | "firststrike";
  desc?: string;
  /** root nodes: the job whose starting point this is */
  job?: JobName;
}

export const PASSIVE_NODES = passivesJson.nodes as unknown as PassiveNode[];
export const PASSIVE_EDGES = passivesJson.edges as unknown as [string, string][];
export const PASSIVES = new Map(PASSIVE_NODES.map((n) => [n.id, n]));

const neighbours = new Map<string, string[]>(PASSIVE_NODES.map((n) => [n.id, []]));
for (const [a, b] of PASSIVE_EDGES) {
  neighbours.get(a)!.push(b);
  neighbours.get(b)!.push(a);
}

const MOD_TEXT: Record<NumMod, (v: number) => string> = {
  str: (v) => `กำลัง +${v}`,
  agi: (v) => `ความคล่อง +${v}`,
  int: (v) => `ปัญญา +${v}`,
  fai: (v) => `ศรัทธา +${v}`,
  hpPct: (v) => `เลือดสูงสุด ${sign(v)}%`,
  atkPct: (v) => `พลังโจมตี ${sign(v)}%`,
  defPct: (v) => `ป้องกัน ${sign(v)}%`,
  critChance: (v) => `โอกาสคริติคอล +${v}%`,
  attackSpeedPct: (v) => `ความเร็วโจมตี ${v > 0 ? "+" : ""}${v}%`,
  moveSpeedPct: (v) => `ความเร็วเดิน ${sign(v)}%`,
  dodge: (v) => `หลบหลีก +${v}%`,
  skillDmgPct: (v) => `ดาเมจสกิล ${sign(v)}%`,
  cdrPct: (v) => (v >= 0 ? `คูลดาวน์สกิล -${v}%` : `คูลดาวน์สกิลนานขึ้น ${-v}%`),
  regenPct: (v) => `ฟื้นเลือดเร็วขึ้น ${v}%`,
  lifesteal: (v) => `ดูดเลือด ${v}% ของดาเมจ`,
  dmgReduce: (v) => `รับดาเมจน้อยลง ${v}%`,
  lowHpDmgPct: (v) => `ดาเมจ +${v}% เมื่อเลือดต่ำกว่าครึ่ง`,
  critDmgPct: (v) => `คริติคอลแรงขึ้น ${sign(v)}%`,
  extraProjectiles: (v) => `ลูกศรและกระสุนเวท ${sign(v)} ลูก (ยิงเป้าอื่นรอบตัวเป้าหมาย)`,
  aoePct: (v) => `รัศมีสกิลวงกว้าง ${sign(v)}%`,
  chainJumps: (v) => `สายฟ้าลูกโซ่กระโดดเพิ่ม ${sign(v)} ครั้ง`,
  stunPct: (v) => `เวลามึน ${sign(v)}%`,
  durationPct: (v) => `บัฟ ดีบัฟ และกับดักนานขึ้น ${sign(v)}%`,
  healPct: (v) => `รักษาแรงขึ้น ${sign(v)}%`,
  manaCostPct: (v) => `ใช้มานาน้อยลง ${v}%`,
  mpPct: (v) => `มานาสูงสุด ${sign(v)}%`,
  meleeSplash: (v) => `ตีประชิดกระเด็นโดนตัวข้างๆ ${v}% ของดาเมจ`,
  multiStrike: (v) => `โอกาส ${v}% ที่สกิลโจมตีจะตีซ้ำอีกครั้ง`,
};

function sign(v: number) {
  return v > 0 ? `+${v}` : String(v);
}

/** Bonuses that change how skills work (shown in their own list). */
export const SKILL_MODS: ReadonlySet<NumMod> = new Set(["extraProjectiles", "aoePct", "chainJumps", "stunPct", "durationPct", "healPct", "manaCostPct", "meleeSplash", "multiStrike", "critDmgPct", "mpPct"]);

/** What one point of each attribute gives (shown in the tree window too). */
export const ATTRIBUTE_HELP = [
  "กำลัง 1 = พลังโจมตี +0.6%",
  "ความคล่อง 1 = คริติคอล +0.15% และความเร็วโจมตี +0.3%",
  "ปัญญา 1 = ดาเมจสกิล +0.8% และมานา +1",
  "ศรัทธา 1 = ป้องกัน +0.4% และฟื้นเลือด +2%",
];

/** Thai lines describing a set of bonuses. */
export function describeMods(mods: Partial<Mods>): string[] {
  const out: string[] = [];
  for (const k of Object.keys(MOD_TEXT) as NumMod[]) {
    const v = mods[k];
    if (v) out.push(MOD_TEXT[k](Math.round(v * 10) / 10));
  }
  return out;
}

export function emptyMods(): Mods {
  return {
    str: 0,
    agi: 0,
    int: 0,
    fai: 0,
    hpPct: 0,
    atkPct: 0,
    defPct: 0,
    critChance: 0,
    attackSpeedPct: 0,
    moveSpeedPct: 0,
    dodge: 0,
    skillDmgPct: 0,
    cdrPct: 0,
    regenPct: 0,
    lifesteal: 0,
    dmgReduce: 0,
    lowHpDmgPct: 0,
    critDmgPct: 0,
    extraProjectiles: 0,
    aoePct: 0,
    chainJumps: 0,
    stunPct: 0,
    durationPct: 0,
    healPct: 0,
    manaCostPct: 0,
    mpPct: 0,
    meleeSplash: 0,
    multiStrike: 0,
    bloodthirst: false,
    firststrike: false,
  };
}

/** Final bonuses used in combat: nodes (and gear) added up, attributes turned into percents, caps applied. */
export function passiveMods(learned: Iterable<string>, extra: Partial<Record<NumMod, number>> = {}): Mods {
  const m = emptyMods();
  for (const id of learned) {
    const n = PASSIVES.get(id);
    if (!n) continue;
    for (const [k, v] of Object.entries(n.mods)) m[k as NumMod] += v;
    if (n.special) m[n.special] = true;
  }
  for (const [k, v] of Object.entries(extra)) m[k as NumMod] += v;
  m.atkPct += m.str * 0.6;
  m.critChance += m.agi * 0.15;
  m.attackSpeedPct += m.agi * 0.3;
  m.skillDmgPct += m.int * 0.8;
  m.defPct += m.fai * 0.4;
  m.regenPct += m.fai * 2;
  if (m.bloodthirst) m.lifesteal *= 3;
  m.cdrPct = Math.min(m.cdrPct, 40);
  m.dodge = Math.min(m.dodge, 40);
  m.dmgReduce = Math.min(m.dmgReduce, 50);
  m.manaCostPct = Math.min(m.manaCostPct, 50);
  m.multiStrike = Math.min(m.multiStrike, 50);
  m.extraProjectiles = Math.max(0, Math.min(m.extraProjectiles, 6));
  m.aoePct = Math.max(-50, m.aoePct);
  return m;
}

/** One point per level (GDD 2.2); story quests will add about ten more later. */
export function passivePointsEarned(level: number) {
  return level;
}

/** Coins to give back one node: the higher the level, the more it costs. */
export function refundCost(level: number) {
  return 10 * level;
}

/** Everyone can start from the middle; a job also opens its own corner. */
export function rootsFor(job: JobName): string[] {
  const base = baseJob(job);
  return PASSIVE_NODES.filter((n) => n.size === "root" && (n.job === "wanderer" || n.job === base)).map((n) => n.id);
}

/** Starting points plus the learned nodes that connect to them. */
function reachable(learned: Set<string>, job: JobName): Set<string> {
  const seen = new Set<string>();
  const todo = rootsFor(job);
  while (todo.length) {
    const id = todo.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const n of neighbours.get(id) ?? []) if (learned.has(n) && !seen.has(n)) todo.push(n);
  }
  return seen;
}

/** Is this node free, and next to something already learned (or to a starting point)? */
export function canReach(id: string, learned: Set<string>, job: JobName): boolean {
  const node = PASSIVES.get(id);
  if (!node || node.size === "root" || learned.has(id)) return false;
  const ok = reachable(learned, job);
  return neighbours.get(id)!.some((n) => ok.has(n));
}

/** Can this node be given back without cutting off the others? */
export function canRefund(id: string, learned: Set<string>, job: JobName): boolean {
  if (!learned.has(id)) return false;
  const rest = new Set(learned);
  rest.delete(id);
  const ok = reachable(rest, job);
  return [...rest].every((n) => ok.has(n));
}

/** Cleans a saved list: known nodes only, connected, and no more than the points earned. */
export function cleanNodes(saved: unknown, level: number, job: JobName): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(saved)) return out;
  const want = saved.filter((id): id is string => typeof id === "string" && PASSIVES.has(id));
  const max = passivePointsEarned(level);
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of want) {
      if (out.size < max && canReach(id, out, job)) {
        out.add(id);
        grew = true;
      }
    }
  }
  return out;
}
