/**
 * Things that happen on their own in the open maps: a short event every so
 * often, and a giant (world boss) that wakes up on a schedule.
 */

export type EventKind = "golden" | "swarm";

export const EVENTS: Record<EventKind, { name: string; icon: string; text: string }> = {
  golden: { name: "ชั่วโมงทอง", icon: "✨", text: "เก็บหิน ไม้ และสมุนไพรได้สองเท่า" },
  swarm: { name: "ฝูงบุก", icon: "🐾", text: "มอนสเตอร์ฝูงใหญ่บุกมา ฆ่าได้ EXP ×1.5" },
};
export const EVENT_MS = 5 * 60_000;
/** quiet time between two events, at random within */
export const EVENT_GAP_MS: [number, number] = [8 * 60_000, 14 * 60_000];
export const SWARM_EXP = 1.5;
export const SWARM_COUNT = 14;

/** The giant of each open map. */
export const WORLD_BOSS: Record<"brindle" | "mossfen", { kind: string; at: { x: number; y: number }; place: string }> = {
  brindle: { kind: "scarecrowking", at: { x: 64, y: 62 }, place: "ทุ่งตะวันออกเฉียงใต้" },
  mossfen: { kind: "bearking", at: { x: 88, y: 40 }, place: "ป่าลึกตะวันออก" },
};
export const BOSS_EVERY_MS = 30 * 60_000;
export const BOSS_WARN_MS = 60_000;
/** a giant nobody beats goes back to sleep after this long */
export const BOSS_STAYS_MS = 10 * 60_000;
/** extra health for each player in the map when it wakes */
export const BOSS_HP_PER_PLAYER = 0.5;
/** you need to have dealt this share of its health to get the reward */
export const BOSS_SHARE = 0.01;

/** What each helper gets when the giant falls. */
export function bossRewards(zone: "brindle" | "mossfen", rand: () => number) {
  const n = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const forest = zone === "mossfen";
  return {
    gold: forest ? n(400, 600) : n(200, 320),
    items: [
      { id: "crystal_1", qty: forest ? n(3, 5) : n(2, 3) },
      { id: forest ? "ore_3" : "ore_2", qty: n(4, 7) },
      { id: forest ? "thread_3" : "hide_2", qty: n(2, 4) },
    ],
  };
}
