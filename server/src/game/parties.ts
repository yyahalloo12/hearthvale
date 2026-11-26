import { PARTY_MAX, PartyData, PartyMember } from "../../../shared/protocol";

/**
 * Parties, shared by all rooms (one room per map), keyed by account id so a
 * party stays together while its members travel between maps.
 */

export const INVITE_MS = 60_000;
/** A member who stays offline this long leaves the party. */
export const OFFLINE_DROP_MS = 10 * 60_000;

/** What a room reports about each of its players, a few times a second. */
export interface Presence {
  name: string;
  level: number;
  job: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  dead: boolean;
  zone: string;
  online: boolean;
  /** when it went offline (0 while online) */
  since: number;
}

interface Party {
  id: number;
  leader: number;
  members: number[];
}

/** A room that can deliver messages to the players inside it. */
export interface PartyHost {
  sendToAccount(accountId: number, type: string, payload: unknown): boolean;
}

const parties = new Map<number, Party>();
const partyOf = new Map<number, number>();
const invites = new Map<number, { from: number; party: number | null; until: number }>();
const presence = new Map<number, Presence>();
const hosts = new Set<PartyHost>();
let nextId = 1;

export function addHost(h: PartyHost) {
  hosts.add(h);
}
export function removeHost(h: PartyHost) {
  hosts.delete(h);
}

/** Sends to a player wherever they are. */
export function deliver(accountId: number, type: string, payload: unknown) {
  for (const h of hosts) if (h.sendToAccount(accountId, type, payload)) return true;
  return false;
}

export function report(accountId: number, p: Presence) {
  presence.set(accountId, p);
}

/** The player logged out (or the server lost them). */
export function wentOffline(accountId: number) {
  const p = presence.get(accountId);
  if (p && p.online) {
    p.online = false;
    p.since = Date.now();
  }
  if (!partyOf.has(accountId)) presence.delete(accountId);
  invites.delete(accountId);
}

export function findOnline(name: string): number | null {
  const want = name.trim().toLowerCase();
  for (const [id, p] of presence) if (p.online && p.name.toLowerCase() === want) return id;
  return null;
}

export function nameOf(accountId: number) {
  return presence.get(accountId)?.name ?? "?";
}

export function partyMembers(accountId: number): number[] {
  const id = partyOf.get(accountId);
  return id ? [...parties.get(id)!.members] : [accountId];
}

export function sameParty(a: number, b: number) {
  const pa = partyOf.get(a);
  return pa !== undefined && pa === partyOf.get(b);
}

export class PartyError extends Error {}

export function invite(from: number, to: number) {
  if (from === to) throw new PartyError("ชวนตัวเองไม่ได้");
  if (!presence.get(to)?.online) throw new PartyError("ไม่พบผู้เล่นที่ออนไลน์ชื่อนี้");
  if (partyOf.has(to)) throw new PartyError(`${nameOf(to)} อยู่ในปาร์ตี้อื่นแล้ว`);
  const pid = partyOf.get(from) ?? null;
  if (pid && parties.get(pid)!.leader !== from) throw new PartyError("หัวหน้าปาร์ตี้เท่านั้นที่ชวนคนเพิ่มได้");
  if (pid && parties.get(pid)!.members.length >= PARTY_MAX) throw new PartyError(`ปาร์ตี้เต็มแล้ว (${PARTY_MAX} คน)`);
  invites.set(to, { from, party: pid, until: Date.now() + INVITE_MS });
  deliver(to, "party_invite", { from: nameOf(from) });
}

export function pendingInvite(to: number): string | null {
  const i = invites.get(to);
  if (!i || i.until < Date.now()) return null;
  return nameOf(i.from);
}

/** Says yes to the invite. Returns the party's members. */
export function accept(to: number): number[] {
  const i = invites.get(to);
  invites.delete(to);
  if (!i || i.until < Date.now()) throw new PartyError("คำชวนหมดเวลาแล้ว");
  if (partyOf.has(to)) throw new PartyError("คุณอยู่ในปาร์ตี้แล้ว");
  let pid = partyOf.get(i.from);
  if (i.party !== null && pid !== i.party) throw new PartyError("ปาร์ตี้นั้นไม่มีแล้ว");
  if (!pid) {
    if (!presence.has(i.from)) throw new PartyError("คนชวนออกจากเกมไปแล้ว");
    pid = nextId++;
    parties.set(pid, { id: pid, leader: i.from, members: [i.from] });
    partyOf.set(i.from, pid);
  }
  const party = parties.get(pid)!;
  if (party.members.length >= PARTY_MAX) throw new PartyError(`ปาร์ตี้เต็มแล้ว (${PARTY_MAX} คน)`);
  party.members.push(to);
  partyOf.set(to, pid);
  notify(party, `${nameOf(to)} เข้าร่วมปาร์ตี้`);
  return [...party.members];
}

export function decline(to: number) {
  const i = invites.get(to);
  invites.delete(to);
  if (i) deliver(i.from, "notice", { text: `${nameOf(to)} ปฏิเสธคำชวน` });
}

/** Leaves the party (or is kicked). */
export function leave(accountId: number, why = "ออกจากปาร์ตี้") {
  const pid = partyOf.get(accountId);
  if (!pid) return;
  const party = parties.get(pid)!;
  party.members = party.members.filter((m) => m !== accountId);
  partyOf.delete(accountId);
  if (!presence.get(accountId)?.online) presence.delete(accountId);
  deliver(accountId, "party", { members: [] } satisfies PartyData);
  if (party.members.length <= 1) {
    for (const m of party.members) {
      partyOf.delete(m);
      deliver(m, "party", { members: [] } satisfies PartyData);
      deliver(m, "notice", { text: "ปาร์ตี้ยุบแล้ว" });
      if (!presence.get(m)?.online) presence.delete(m);
    }
    parties.delete(pid);
    return;
  }
  if (party.leader === accountId) party.leader = party.members.find((m) => presence.get(m)?.online) ?? party.members[0];
  notify(party, `${nameOf(accountId)} ${why}`);
}

export function kick(leader: number, name: string) {
  const pid = partyOf.get(leader);
  const party = pid ? parties.get(pid)! : null;
  if (!party || party.leader !== leader) throw new PartyError("หัวหน้าปาร์ตี้เท่านั้นที่เตะสมาชิกได้");
  const who = party.members.find((m) => nameOf(m).toLowerCase() === name.trim().toLowerCase());
  if (!who || who === leader) throw new PartyError("ไม่มีสมาชิกชื่อนี้");
  deliver(who, "notice", { text: "คุณถูกเชิญออกจากปาร์ตี้" });
  leave(who, "ถูกเชิญออกจากปาร์ตี้");
}

/** Party chat: every member gets it, in whatever map they are. */
export function say(from: number, text: string) {
  const pid = partyOf.get(from);
  if (!pid) throw new PartyError("คุณยังไม่มีปาร์ตี้ (ชวนด้วย /invite ชื่อ)");
  for (const m of parties.get(pid)!.members) deliver(m, "chat_line", { from: "", name: nameOf(from), text, party: true });
}

function notify(party: Party, text: string) {
  for (const m of party.members) deliver(m, "chat_line", { from: "", name: "", text, system: true, party: true });
}

/** The party as one member sees it. */
export function view(accountId: number): PartyData {
  const pid = partyOf.get(accountId);
  if (!pid) return { members: [], invite: pendingInvite(accountId) ?? undefined };
  const party = parties.get(pid)!;
  return {
    members: party.members.map((m): PartyMember => {
      const p = presence.get(m);
      return {
        id: m,
        name: p?.name ?? "?",
        level: p?.level ?? 1,
        job: p?.job ?? "",
        hp: p?.hp ?? 0,
        maxHp: p?.maxHp ?? 1,
        mp: p?.mp ?? 0,
        maxMp: p?.maxMp ?? 0,
        dead: p?.dead ?? false,
        zone: p?.zone ?? "",
        online: p?.online ?? false,
        leader: m === party.leader,
        me: m === accountId,
      };
    }),
    invite: pendingInvite(accountId) ?? undefined,
  };
}

/** Drops members who stayed away too long. */
export function sweep(now = Date.now()) {
  for (const [to, i] of invites) if (i.until < now) invites.delete(to);
  for (const party of [...parties.values()])
    for (const m of [...party.members]) {
      const p = presence.get(m);
      if (!p || (!p.online && now - p.since > OFFLINE_DROP_MS)) leave(m, "ออฟไลน์นานเกินไป ออกจากปาร์ตี้");
    }
}

/** For tests. */
export function resetParties() {
  parties.clear();
  partyOf.clear();
  invites.clear();
  presence.clear();
}
