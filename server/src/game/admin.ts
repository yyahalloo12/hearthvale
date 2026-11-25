import type { ZoneId } from "../../../shared/map";
import { ITEMS, QUALITY_NAMES } from "../../../shared/items";
import { Job, MAX_LEVEL, MONSTERS } from "../../../shared/stats";

/**
 * Game master commands, typed in chat ("/help"). Only accounts with the admin
 * flag in the database may use them; the flag is set with `npm run admin` on
 * the server machine and can never be given inside the game.
 */

/** What a command may do. The room provides these; `id` is a player's session id. */
export interface AdminHost {
  playerByName(name: string): string | null;
  nameOf(id: string): string;
  online(): string[];
  posOf(id: string): { x: number; y: number };
  setLevel(id: string, level: number): void;
  addExp(id: string, amount: number): void;
  addGold(id: string, amount: number): void;
  /** returns how many did not fit in the bag */
  give(id: string, item: string, qty: number, quality: number): number;
  setSmithing(id: string, skill: number): void;
  setJob(id: string, job: Job): void;
  resetTree(id: string): void;
  heal(id: string): void;
  kill(id: string): boolean;
  toggleGod(id: string): boolean;
  setSpeed(id: string, times: number): void;
  setCorruption(id: string, value: number): boolean;
  teleport(id: string, x: number, y: number): boolean;
  goZone(id: string, zone: ZoneId): boolean;
  spawn(kind: string, count: number, x: number, y: number): number;
  clearMonsters(x: number, y: number, radius: number): number;
  moveGates(): boolean;
  announce(text: string): void;
  kick(id: string): void;
}

export const ADMIN_HELP = [
  "คำสั่ง GM (ใส่ @ชื่อ ต่อท้ายเพื่อใช้กับผู้เล่นคนอื่นในแผนที่เดียวกัน)",
  "/level 20 · /exp 500 · /gold 1000 · /job squire · /smith 100 · /resettree",
  "/give ore_1 50 · /give sword_2 1 3 (เลขท้าย = คุณภาพ 0-3) · /items ค้นรหัสไอเทม",
  "/heal · /god (อมตะ) · /speed 3 · /kill @ชื่อ",
  "/tp 24 24 · /goto @ชื่อ · /bring @ชื่อ · /hollow · /village",
  "/spawn hen 3 · /monsters · /clear 10 (ลบมอนสเตอร์ในรัศมี)",
  "/gates (ย้ายประตู Hollow) · /corrupt 60 · /say ข้อความ · /who · /kick @ชื่อ",
];

const num = (s: string | undefined, lo: number, hi: number): number | null => {
  if (s === undefined || s.trim() === "") return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
};

/** Splits "/give ore_1 5 @Some Name" into its parts. */
export function parseCommand(text: string): { cmd: string; args: string[]; target: string | null; rest: string } {
  const body = text.slice(1).trim();
  const at = body.indexOf("@");
  const head = at >= 0 ? body.slice(0, at).trim() : body;
  const target = at >= 0 ? body.slice(at + 1).trim() || null : null;
  const [cmd = "", ...args] = head.split(/\s+/);
  return { cmd: cmd.toLowerCase(), args, target, rest: body.slice(cmd.length).trim() };
}

/** Runs one command; returns lines to show to the admin. */
export function runAdminCommand(host: AdminHost, me: string, text: string): string[] {
  const { cmd, args, target, rest } = parseCommand(text);
  if (cmd === "say") {
    if (!rest) return ["ใช้แบบนี้: /say ข้อความ"];
    host.announce(rest);
    return [];
  }
  const id = target === null ? me : host.playerByName(target);
  if (!id) return [`ไม่พบผู้เล่น ${target} ในแผนที่นี้`];
  const who = host.nameOf(id);
  const needTarget = () => (target === null || id === me ? [`ใช้แบบนี้: /${cmd} @ชื่อ`] : null);

  switch (cmd) {
    case "help":
    case "":
      return ADMIN_HELP;
    case "who":
      return [`ออนไลน์ในแผนที่นี้: ${host.online().join(", ")}`];
    case "level": {
      const n = num(args[0], 1, MAX_LEVEL);
      if (n === null) return ["ใช้แบบนี้: /level 20"];
      host.setLevel(id, n);
      return [`${who} เป็นเลเวล ${n} แล้ว`];
    }
    case "exp": {
      const n = num(args[0], 1, 10_000_000);
      if (n === null) return ["ใช้แบบนี้: /exp 500"];
      host.addExp(id, n);
      return [`${who} ได้ EXP ${n}`];
    }
    case "gold": {
      const n = num(args[0], -100_000_000, 100_000_000);
      if (n === null) return ["ใช้แบบนี้: /gold 1000 (ติดลบเพื่อหักออก)"];
      host.addGold(id, n);
      return [`${who} ${n >= 0 ? "ได้" : "ถูกหัก"} ${Math.abs(n)} เหรียญ`];
    }
    case "give": {
      const item = args[0] ?? "";
      if (!Object.hasOwn(ITEMS, item)) return ["ใช้แบบนี้: /give รหัส จำนวน [คุณภาพ 0-3] ดูรหัสด้วย /items"];
      const qty = num(args[1] ?? "1", 1, 999)!;
      const quality = ITEMS[item].kind === "equip" ? num(args[2] ?? "0", 0, 3)! : 0;
      const left = host.give(id, item, qty, quality);
      const q = QUALITY_NAMES[quality] ? ` (${QUALITY_NAMES[quality]})` : "";
      return [`${who} ได้ ${ITEMS[item].name}${q} × ${qty - left}${left > 0 ? ` กระเป๋าเต็ม อีก ${left} ใส่ไม่ได้` : ""}`];
    }
    case "items": {
      const q = args.join(" ").toLowerCase();
      const found = Object.entries(ITEMS).filter(([k, d]) => !q || k.includes(q) || d.name.includes(q));
      if (!found.length) return ["ไม่พบไอเทม"];
      const out: string[] = [];
      for (let i = 0; i < found.length; i += 4) out.push(found.slice(i, i + 4).map(([k, d]) => `${k} = ${d.name}`).join(" · "));
      return out;
    }
    case "monsters":
      return [Object.entries(MONSTERS).map(([k, d]) => `${k} = ${d.name}`).join(" · ")];
    case "smith": {
      const n = num(args[0], 0, 100);
      if (n === null) return ["ใช้แบบนี้: /smith 100"];
      host.setSmithing(id, n);
      return [`ฝีมือช่างตีเหล็กของ ${who} เป็น ${n}`];
    }
    case "job":
      if (args[0] !== "squire" && args[0] !== "wanderer") return ["ใช้แบบนี้: /job squire หรือ /job wanderer"];
      host.setJob(id, args[0]);
      return [`เปลี่ยนอาชีพของ ${who} แล้ว`];
    case "resettree":
      host.resetTree(id);
      return [`ล้างต้นไม้พาสซีฟของ ${who} แล้ว`];
    case "heal":
      host.heal(id);
      return [`${who} เลือดเต็มแล้ว`];
    case "god":
      return [host.toggleGod(id) ? `${who} เป็นอมตะแล้ว` : `${who} ไม่อมตะแล้ว`];
    case "speed": {
      const n = Number(args[0]);
      if (!(n > 0)) return ["ใช้แบบนี้: /speed 3 (1 = ปกติ)"];
      const times = Math.max(0.2, Math.min(10, n));
      host.setSpeed(id, times);
      return [`ความเร็วเดินของ ${who} × ${times}`];
    }
    case "kill":
      return needTarget() ?? [host.kill(id) ? `ล้ม ${who} แล้ว` : `${who} ล้มอยู่แล้ว`];
    case "tp": {
      const x = num(args[0], 0, 1000);
      const y = num(args[1], 0, 1000);
      if (x === null || y === null) return ["ใช้แบบนี้: /tp 24 24"];
      return [host.teleport(id, x, y) ? `ย้าย ${who} ไปที่ ${x}, ${y}` : "ตรงนั้นยืนไม่ได้"];
    }
    case "goto": {
      const bad = needTarget();
      if (bad) return bad;
      const p = host.posOf(id);
      return [host.teleport(me, Math.round(p.x), Math.round(p.y)) ? `ไปหา ${who} แล้ว` : "ไปไม่ได้"];
    }
    case "bring": {
      const bad = needTarget();
      if (bad) return bad;
      const p = host.posOf(me);
      return [host.teleport(id, Math.round(p.x), Math.round(p.y)) ? `พา ${who} มาแล้ว` : "พามาไม่ได้"];
    }
    case "hollow":
    case "village":
      return host.goZone(id, cmd === "hollow" ? "hollow" : "brindle") ? [] : [`${who} อยู่ที่นั่นแล้ว หรือล้มอยู่`];
    case "spawn": {
      const kind = args[0] ?? "";
      if (!Object.hasOwn(MONSTERS, kind)) return ["ใช้แบบนี้: /spawn hen 3 ดูรหัสด้วย /monsters"];
      const p = host.posOf(id);
      const n = host.spawn(kind, num(args[1] ?? "1", 1, 20)!, Math.round(p.x), Math.round(p.y));
      return [`เรียก ${MONSTERS[kind].name} ${n} ตัว`];
    }
    case "clear": {
      const p = host.posOf(id);
      return [`ลบมอนสเตอร์ ${host.clearMonsters(p.x, p.y, num(args[0] ?? "10", 1, 100)!)} ตัว (เกิดใหม่ตามเวลาปกติ)`];
    }
    case "gates":
      return [host.moveGates() ? "ย้ายประตูแล้ว" : "ใช้ได้ใน Hollow เท่านั้น"];
    case "corrupt": {
      const n = num(args[0], 0, 100);
      if (n === null) return ["ใช้แบบนี้: /corrupt 60"];
      return [host.setCorruption(id, n) ? `การกัดกร่อนของ ${who} เป็น ${n}%` : "ใช้ได้ใน Hollow เท่านั้น"];
    }
    case "kick": {
      const bad = needTarget();
      if (bad) return bad;
      host.kick(id);
      return [`เชิญ ${who} ออกแล้ว`];
    }
    default:
      return [`ไม่มีคำสั่ง /${cmd} พิมพ์ /help เพื่อดูทั้งหมด`];
  }
}
