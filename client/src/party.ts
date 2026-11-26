import { Job, JOB_NAMES } from "../../shared/stats";
import { PARTY_MAX, PartyAction, PartyData, PartyMember } from "../../shared/protocol";
import { ZONE_NAMES } from "../../shared/zones";

/** Party frames on the left, the party window (O) and the invite card. */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const JOB_ICON: Record<string, string> = { wanderer: "🧭", squire: "🛡️", archer: "🏹", weaver: "🔮", acolyte: "✨" };

let send: (a: PartyAction) => void = () => {};
let data: PartyData = { members: [] };
let started = false;

export function initParty(act: (a: PartyAction) => void) {
  send = act;
  $("party-open").hidden = false;
  if (started) return;
  started = true;
  $("party-open").onclick = () => toggleParty();
  $("party-close").onclick = () => toggleParty(false);
  $<HTMLFormElement>("party-form").onsubmit = (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>("party-name");
    const name = input.value.trim();
    if (name) send({ action: "invite", name });
    input.value = "";
  };
  $("party-leave").onclick = () => send({ action: "leave" });
  $("invite-yes").onclick = () => send({ action: "accept" });
  $("invite-no").onclick = () => send({ action: "decline" });
  window.addEventListener("keydown", (e) => {
    const el = document.activeElement as HTMLInputElement | null;
    if ((el?.tagName === "INPUT" && el.type !== "checkbox") || el?.tagName === "SELECT" || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === "KeyO") {
      e.preventDefault();
      toggleParty();
    }
    else if (e.code === "Escape") toggleParty(false);
  });
}

function toggleParty(open = $("party").hidden) {
  $("party").hidden = !open;
  if (open) $<HTMLInputElement>("party-name").focus();
}

/** Session ids of party members in this map (not you). */
export function partySessions(): Set<string> {
  return new Set(data.members.filter((m) => !m.me && m.sid).map((m) => m.sid!));
}

/** Invite somebody you clicked, by name. */
export function inviteByName(name: string) {
  send({ action: "invite", name });
}

export function setParty(d: PartyData) {
  data = d;
  const others = d.members.filter((m) => !m.me);
  // frames under your own
  $("party-frames").replaceChildren(...others.map(frame));
  // invite card
  $("party-invite").hidden = !d.invite;
  $("invite-from").textContent = d.invite ?? "";
  // the window
  const me = d.members.find((m) => m.me);
  $("party-count").textContent = d.members.length ? `${d.members.length}/${PARTY_MAX} คน` : "ยังไม่มีปาร์ตี้";
  $("party-leave").hidden = !d.members.length;
  $("party-form").hidden = !!me && !me.leader;
  $("party-list").replaceChildren(
    ...(d.members.length
      ? d.members.map((m) => row(m, !!me?.leader))
      : [Object.assign(document.createElement("p"), { className: "hint", textContent: "พิมพ์ชื่อผู้เล่นที่ออนไลน์เพื่อชวน หรือพิมพ์ /invite ชื่อ ในแชท ปาร์ตี้แบ่ง EXP และเหรียญเมื่ออยู่ใกล้กัน และไม่ตีกันเองใน Hollow" })]),
  );
}

function bars(m: PartyMember) {
  const box = document.createElement("div");
  box.className = "mid";
  const nm = document.createElement("div");
  nm.className = "nm";
  nm.append(Object.assign(document.createElement("span"), { textContent: `${m.leader ? "👑 " : ""}${m.name}` }), Object.assign(document.createElement("span"), { textContent: `Lv${m.level}` }));
  const hp = document.createElement("div");
  hp.className = "bar hp";
  hp.append(Object.assign(document.createElement("div"), { style: `width:${m.dead ? 0 : (m.hp / Math.max(1, m.maxHp)) * 100}%` }));
  box.append(nm, hp);
  if (m.maxMp > 0) {
    const mp = document.createElement("div");
    mp.className = "bar mp";
    mp.append(Object.assign(document.createElement("div"), { style: `width:${(m.mp / m.maxMp) * 100}%` }));
    box.append(mp);
  }
  return box;
}

function frame(m: PartyMember) {
  const el = document.createElement("div");
  el.className = "mate frame" + (m.online ? "" : " away") + (m.dead ? " dead" : "");
  const face = Object.assign(document.createElement("div"), { className: "face", textContent: m.dead ? "💀" : JOB_ICON[m.job] ?? "🧭" });
  el.title = `${m.name} · ${JOB_NAMES[m.job as Job] ?? m.job} · ${m.online ? ZONE_NAMES[m.zone as keyof typeof ZONE_NAMES] ?? m.zone : "ออฟไลน์"}`;
  el.append(face, bars(m));
  if (!m.sid && m.online) el.append(Object.assign(document.createElement("small"), { className: "where", textContent: ZONE_NAMES[m.zone as keyof typeof ZONE_NAMES] ?? m.zone }));
  return el;
}

function row(m: PartyMember, leader: boolean) {
  const el = document.createElement("div");
  el.className = "prow";
  el.append(
    Object.assign(document.createElement("div"), { className: "face", textContent: JOB_ICON[m.job] ?? "🧭" }),
    bars(m),
    Object.assign(document.createElement("small"), { textContent: m.online ? ZONE_NAMES[m.zone as keyof typeof ZONE_NAMES] ?? m.zone : "ออฟไลน์" }),
  );
  if (leader && !m.me) {
    const kick = Object.assign(document.createElement("button"), { type: "button", textContent: "เชิญออก", className: "kick" });
    kick.onclick = () => send({ action: "kick", name: m.name });
    el.append(kick);
  }
  return el;
}
