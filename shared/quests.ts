/**
 * Quests: the main story of the thread-binders (GDD 5.1), one step at a time,
 * and three daily tasks that change every day. Progress moves on its own when
 * the player does the thing; rewards come at once when a step is done.
 */

export type Goal =
  | { type: "kill"; kind: string; count: number }
  | { type: "gather"; item: string; count: number }
  | { type: "passive"; count: number }
  | { type: "level"; level: number }
  | { type: "job"; second?: boolean }
  | { type: "visit"; zone: string }
  | { type: "station"; kind: string; count: number }
  | { type: "escape"; count: number }
  | { type: "rift"; count: number; dungeon?: boolean }
  | { type: "worldboss"; count: number };

export interface Reward {
  exp?: number;
  gold?: number;
  items?: { id: string; qty: number }[];
  /** extra points for the passive tree (GDD 2.2: about ten from the story) */
  points?: number;
  /** a piece of gear: tier, lowest rarity, chance of a legendary */
  gear?: { tier: number; minRarity: number; unique?: number };
}

export interface Quest {
  id: string;
  name: string;
  /** the story, a few lines */
  story: string;
  goal: Goal;
  reward: Reward;
}

export const MAIN_QUESTS: Quest[] = [
  { id: "m1", name: "ผู้ผูกด้ายคนใหม่", story: "คุณตื่นขึ้นในหมู่บ้านบรินเดิล พร้อมด้ายบางๆ ที่มีแค่คุณมองเห็น ผู้เฒ่าบอกว่าคนแบบคุณเรียกว่า \"ผู้ผูกด้าย\" ลองพิสูจน์ฝีมือกับไก่แจ้หงอนไฟที่ชอบจิกพืชผักดูก่อน", goal: { type: "kill", kind: "hen", count: 5 }, reward: { exp: 80, gold: 40 } },
  { id: "m2", name: "ด้ายเส้นแรก", story: "ผืนทอแห่งชะตาในตัวคุณตอบรับแล้ว เปิดต้นไม้พาสซีฟ (P) แล้วทอด้ายเส้นแรกของคุณ", goal: { type: "passive", count: 1 }, reward: { exp: 60, points: 1 } },
  { id: "m3", name: "เครื่องมือของผู้ผูกด้าย", story: "ช่างตีเหล็กต้องการแร่ทองแดงเพื่อทำของให้คนในหมู่บ้าน ไปขุดแร่ที่ชานหมู่บ้าน (ต้องมีพลั่ว ซื้อได้ที่ช่าง)", goal: { type: "gather", item: "ore_1", count: 6 }, reward: { exp: 120, gold: 60, items: [{ id: "hide_1", qty: 3 }] } },
  { id: "m4", name: "หุ่นไล่กาที่ตื่นขึ้น", story: "หุ่นไล่กาในทุ่งเริ่มขยับเองตั้งแต่ผืนทอขาด ชาวนาไม่กล้าออกไปเก็บเกี่ยว ไปจัดการให้หน่อย (กลางคืนได้ EXP มากกว่า)", goal: { type: "kill", kind: "scarecrow", count: 8 }, reward: { exp: 400, gold: 120, gear: { tier: 1, minRarity: 1 } } },
  { id: "m5", name: "เลือกเส้นทาง", story: "ผู้ผูกด้ายทุกคนต้องเลือกว่าจะทอชะตาไปทางไหน เมื่อถึงเลเวล 10 ให้เลือกอาชีพ", goal: { type: "job" }, reward: { exp: 500, points: 1 } },
  { id: "m6", name: "แม่ไก่พิโรธ", story: "แม่ไก่ตัวใหญ่ผิดธรรมชาติกำลังอาละวาดทางใต้ของหมู่บ้าน ด้ายสีดำพันรอบตัวมัน ตัดมันให้ขาด", goal: { type: "kill", kind: "henqueen", count: 1 }, reward: { exp: 900, gold: 250, gear: { tier: 2, minRarity: 2 } } },
  { id: "m7", name: "ป่าที่มีหมอก", story: "ร่องรอยของด้ายดำนำไปทางตะวันออก สู่ป่ามอสเฟน ออกเดินทางไปที่นั่น", goal: { type: "visit", zone: "mossfen" }, reward: { exp: 600, gold: 100 } },
  { id: "m8", name: "แสงในหมอก", story: "ภูตตะเกียงกระซิบว่ามีของที่ผู้ผูกด้ายรุ่นก่อนซ่อนไว้หลังหมอก จุดโคมหินทั้งสามให้สว่างพร้อมกัน แล้วเปิดหีบในลานสมบัติ", goal: { type: "station", kind: "treasure", count: 1 }, reward: { exp: 1500, points: 1, items: [{ id: "crystal_1", qty: 3 }] } },
  { id: "m9", name: "ต้นไม้ผู้หลับใหล", story: "ต้นไม้เฒ่ากลางป่าถูกด้ายดำรัดจนตื่นขึ้นมาอย่างคลุ้มคลั่ง ปลดปล่อยมันเสีย", goal: { type: "kill", kind: "treant", count: 1 }, reward: { exp: 3000, gold: 500, points: 1, gear: { tier: 3, minRarity: 2 } } },
  { id: "m10", name: "รอยขาดของผืนทอ", story: "ด้ายดำทั้งหมดมาจาก Hollow รอยขาดกลางทวีป เข้าไปดูด้วยตาตัวเอง แล้วหนีออกมาทางประตูสีทองให้ได้ (ของที่พกไปเสี่ยงหาย)", goal: { type: "escape", count: 1 }, reward: { exp: 5000, gold: 800, points: 2, gear: { tier: 3, minRarity: 2, unique: 0.5 } } },
  { id: "m11", name: "ผู้ผูกด้ายขั้นสอง", story: "ยิ่งเข้าใกล้รอยขาด ยิ่งต้องทอชะตาให้แน่นกว่าเดิม ถึงเลเวล 30 แล้วเลือกอาชีพขั้นสอง", goal: { type: "job", second: true }, reward: { exp: 8000, points: 2 } },
  { id: "m12", name: "อัศวินด้ายขาด", story: "อัศวินที่เคยเฝ้าผืนทอกลายเป็นหุ่นของด้ายดำ ปลดปล่อยพวกเขาใน Hollow แล้วเรื่องราวของใครทำให้ผืนทอขาดจะเริ่มเปิดเผย... (เนื้อเรื่องต่อในรุ่นถัดไป)", goal: { type: "kill", kind: "threadknight", count: 10 }, reward: { exp: 15000, gold: 2000, points: 2, gear: { tier: 3, minRarity: 3, unique: 1 } } },
];

/** Daily tasks: three each day, picked by date, the same for everyone. */
export const DAILY_POOL: Quest[] = [
  { id: "d_hen", name: "ไก่ล้นทุ่ง", story: "ไก่แจ้หงอนไฟออกมาจิกแปลงผักอีกแล้ว", goal: { type: "kill", kind: "hen", count: 12 }, reward: { exp: 150, gold: 60 } },
  { id: "d_rat", name: "หนูในยุ้งข้าว", story: "หนูนาอ้วนแอบกินข้าวในยุ้ง", goal: { type: "kill", kind: "rat", count: 12 }, reward: { exp: 300, gold: 90 } },
  { id: "d_scare", name: "ทุ่งไม่สงบ", story: "หุ่นไล่กาซนเดินเพ่นพ่านอีกแล้ว", goal: { type: "kill", kind: "scarecrow", count: 10 }, reward: { exp: 700, gold: 150 } },
  { id: "d_wolf", name: "ฝูงหมาป่ามอส", story: "นักเดินทางในป่ามอสเฟนถูกหมาป่าไล่", goal: { type: "kill", kind: "wolf", count: 12 }, reward: { exp: 1500, gold: 250 } },
  { id: "d_bear", name: "หมีขโมยน้ำผึ้ง", story: "หมีน้ำผึ้งบุกรังผึ้งของชาวบ้าน", goal: { type: "kill", kind: "bear", count: 8 }, reward: { exp: 2500, gold: 350 } },
  { id: "d_ore", name: "แร่สำหรับช่าง", story: "ช่างตีเหล็กต้องการแร่ทองแดงเพิ่ม", goal: { type: "gather", item: "ore_1", count: 10 }, reward: { exp: 200, gold: 120 } },
  { id: "d_wood", name: "ไม้สำหรับรั้ว", story: "รั้วหมู่บ้านพังอีกแล้ว", goal: { type: "gather", item: "wood_1", count: 10 }, reward: { exp: 200, gold: 120 } },
  { id: "d_herb", name: "สมุนไพรของหมอ", story: "หมอประจำหมู่บ้านต้องการใบหอม", goal: { type: "gather", item: "herb_1", count: 8 }, reward: { exp: 200, gold: 120 } },
  { id: "d_iron", name: "เหล็กจากป่า", story: "แร่เหล็กในมอสเฟนดีกว่าที่ไหน", goal: { type: "gather", item: "ore_2", count: 8 }, reward: { exp: 900, gold: 250 } },
  { id: "d_rift", name: "นักสำรวจหมอก", story: "ปิดพอร์ทัลหมอกให้ได้หนึ่งอัน", goal: { type: "rift", count: 1 }, reward: { exp: 1200, gold: 300, items: [{ id: "crystal_1", qty: 1 }] } },
  { id: "d_dungeon", name: "ลงดันเจี้ยน", story: "ผ่านดันเจี้ยนจนถึงหีบห้องสุดท้าย", goal: { type: "rift", count: 1, dungeon: true }, reward: { exp: 1500, gold: 400, items: [{ id: "crystal_1", qty: 2 }] } },
  { id: "d_boss", name: "ล่ายักษ์", story: "ช่วยปราบบอสโลกให้ได้", goal: { type: "worldboss", count: 1 }, reward: { exp: 2000, gold: 500, gear: { tier: 2, minRarity: 1 } } },
];
export const DAILY_COUNT = 3;

export interface QuestState {
  /** index of the main step being worked on (MAIN_QUESTS.length = all done) */
  main: number;
  mainProgress: number;
  /** "YYYY-MM-DD" of the dailies below */
  day: string;
  daily: { id: string; progress: number; done: boolean }[];
  /** passive points earned from quests */
  points: number;
}

export function today(now = Date.now()) {
  const d = new Date(now + 7 * 3600_000); // the day turns at midnight in Thailand
  return d.toISOString().slice(0, 10);
}

/** The same three dailies for everyone on a given day. */
export function dailiesFor(day: string): string[] {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = [...DAILY_POOL];
  const out: string[] = [];
  while (out.length < DAILY_COUNT && pool.length) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0].id);
  }
  return out;
}

export function emptyQuests(now = Date.now()): QuestState {
  const day = today(now);
  return { main: 0, mainProgress: 0, day, daily: dailiesFor(day).map((id) => ({ id, progress: 0, done: false })), points: 0 };
}

/** Reads saved progress; brings the dailies up to today. */
export function cleanQuests(saved: unknown, now = Date.now()): QuestState {
  const q = emptyQuests(now);
  const v = saved as Partial<QuestState> | null;
  if (!v || typeof v !== "object") return q;
  q.main = Math.max(0, Math.min(MAIN_QUESTS.length, Math.floor(Number(v.main) || 0)));
  q.mainProgress = Math.max(0, Math.floor(Number(v.mainProgress) || 0));
  q.points = Math.max(0, Math.min(20, Math.floor(Number(v.points) || 0)));
  if (v.day === q.day && Array.isArray(v.daily)) {
    const ids = new Set(q.daily.map((d) => d.id));
    q.daily = v.daily
      .filter((d) => d && ids.has(d.id))
      .map((d) => ({ id: d.id, progress: Math.max(0, Math.floor(Number(d.progress) || 0)), done: !!d.done }));
    for (const id of ids) if (!q.daily.some((d) => d.id === id)) q.daily.push({ id, progress: 0, done: false });
  }
  return q;
}

/** About the level for each story step; characters far past it skip the step (keeping its passive points). */
export const STORY_LEVEL: Record<string, number> = { m1: 1, m2: 1, m3: 2, m4: 5, m5: 10, m6: 12, m7: 10, m8: 12, m9: 18, m10: 15, m11: 30, m12: 30 };

/** A character from before quests existed starts at the step that fits its level. */
export function catchUp(q: QuestState, level: number) {
  for (let m = MAIN_QUESTS[q.main]; m && (STORY_LEVEL[m.id] ?? 1) + 4 <= level && m.goal.type !== "job"; m = MAIN_QUESTS[q.main]) {
    q.points += m.reward.points ?? 0;
    q.main++;
    q.mainProgress = 0;
  }
}

export const QUESTS = new Map([...MAIN_QUESTS, ...DAILY_POOL].map((q) => [q.id, q]));

/** How many steps a goal needs. */
export function goalCount(g: Goal): number {
  return "count" in g ? g.count : 1;
}

/** Thai line for a goal, with progress. */
export function goalText(g: Goal, progress: number, names: { monster: (k: string) => string; item: (k: string) => string }): string {
  const n = `${Math.min(progress, goalCount(g))}/${goalCount(g)}`;
  switch (g.type) {
    case "kill":
      return `ปราบ${names.monster(g.kind)} ${n}`;
    case "gather":
      return `เก็บ${names.item(g.item)} ${n}`;
    case "passive":
      return `เรียนโหนดพาสซีฟ ${n}`;
    case "level":
      return `ถึงเลเวล ${g.level}`;
    case "job":
      return g.second ? "เลือกอาชีพขั้นสองที่ Lv 30" : "เลือกอาชีพที่ Lv 10";
    case "visit":
      return g.zone === "mossfen" ? "ไปที่ป่ามอสเฟน" : `ไปที่ ${g.zone}`;
    case "station":
      return `เปิดหีบลานสมบัติในป่ามอสเฟน ${n}`;
    case "escape":
      return `หนีออกจาก Hollow ทางประตูสีทอง ${n}`;
    case "rift":
      return g.dungeon ? `เปิดหีบห้องสุดท้ายของดันเจี้ยน ${n}` : `เปิดหีบในพอร์ทัลหมอกหรือพอร์ทัลดำ ${n}`;
    case "worldboss":
      return `ช่วยปราบบอสโลก ${n}`;
  }
}

/** Something happened; how far does it move this goal? */
export type QuestEvent =
  | { type: "kill"; kind: string }
  | { type: "gather"; item: string; qty: number }
  | { type: "passive" }
  | { type: "job"; second: boolean }
  | { type: "visit"; zone: string }
  | { type: "station"; kind: string }
  | { type: "escape" }
  | { type: "rift"; dungeon: boolean }
  | { type: "worldboss" };

export function stepFor(g: Goal, e: QuestEvent): number {
  if (g.type !== e.type) return 0;
  switch (g.type) {
    case "kill":
      return (e as { kind: string }).kind === g.kind ? 1 : 0;
    case "gather":
      return (e as { item: string }).item === g.item ? (e as { qty: number }).qty : 0;
    case "job":
      return (e as { second: boolean }).second === !!g.second ? 1 : 0;
    case "visit":
      return (e as { zone: string }).zone === g.zone ? 1 : 0;
    case "station":
      return (e as { kind: string }).kind === g.kind ? 1 : 0;
    case "rift":
      return !g.dungeon || (e as { dungeon: boolean }).dungeon ? 1 : 0;
    default:
      return 1;
  }
}
