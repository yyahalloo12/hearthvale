import { HONOR, MATCH_MS } from "../../shared/arena";
import type { ArenaAct, ArenaData } from "../../shared/protocol";

/**
 * The colosseum panel: honour and rank, the 1 on 1 queue, challenging someone
 * by name, the fight you are in with its timer, and the big countdown.
 */

const $ = (id: string) => document.getElementById(id) as HTMLElement;

let send: (a: ArenaAct) => void = () => {};
let data: ArenaData | null = null;
let started = false;
let timer = 0;

export function initArena(act: (a: ArenaAct) => void, inArena: boolean) {
  send = act;
  $("arenawin").hidden = !inArena;
  $("arena-count").hidden = true;
  data = null;
  if (inArena) render();
  if (started) return;
  started = true;
  $("arena-duel-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("arena-duel-name") as HTMLInputElement;
    if (input.value.trim()) send({ action: "duel", name: input.value.trim() });
    input.value = "";
  });
  clearInterval(timer);
  timer = window.setInterval(tick, 200);
}

export function setArena(d: ArenaData) {
  data = d;
  render();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function button(text: string, run: () => void, cls = "") {
  const b = el("button", cls, text);
  b.type = "button";
  b.onclick = run;
  return b;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function render() {
  if ($("arenawin").hidden) return;
  const d = data;
  const r = d?.record ?? { honor: 0, wins: 0, losses: 0, draws: 0 };
  $("arena-rank").textContent = `${d?.rank ?? "มือใหม่"} · เกียรติยศ ${r.honor}`;
  $("arena-record").textContent = `ชนะ ${r.wins} · แพ้ ${r.losses} · เสมอ ${r.draws}`;
  const box = $("arena-state");
  box.replaceChildren();
  if (d?.match) {
    box.append(el("div", "arena-vs", `⚔ คู่ต่อสู้: ${d.match.opponent}`), el("div", "arena-timer", ""), el("small", "", `ลานที่ ${d.match.pit + 1} · หมดเวลาแล้วใครเลือดเหลือมากกว่า (%) ชนะ`));
  } else {
    if (d?.invite) {
      const ask = el("div", "arena-invite");
      ask.append(el("b", "", `${d.invite} ท้าคุณดวล!`), button("รับคำท้า", () => send({ action: "accept" })), button("ไม่รับ", () => send({ action: "decline" }), "danger"));
      box.append(ask);
    }
    box.append(
      d?.queued
        ? button(`ออกจากคิว (รออยู่ ${d.queueSize} คน)`, () => send({ action: "unqueue" }), "danger")
        : button("เข้าคิวดวล 1 ต่อ 1", () => send({ action: "queue" }), "arena-go"),
    );
    if (d?.asked) box.append(el("small", "", `รอ ${d.asked} ตอบรับคำท้า...`));
  }
  $("arena-duel-form").hidden = !!d?.match;
  const fights = $("arena-fights");
  fights.replaceChildren(...(d?.fights.length ? d.fights.map((f) => el("div", "", `ลาน ${f.pit + 1}: ${f.a} ⚔ ${f.b}`)) : [el("div", "hint", "ยังไม่มีใครสู้กัน")]));
  const top = $("arena-top");
  top.replaceChildren(...(d?.top ?? []).map((t, i) => el("div", "", `${["🥇", "🥈", "🥉", "4.", "5."][i]} ${t.name} · ${t.honor} (${t.wins} ชนะ)`)));
}

/** The countdown and the fight timer. */
function tick() {
  const m = data?.match;
  const count = $("arena-count");
  if (!m || $("arenawin").hidden) {
    count.hidden = true;
    return;
  }
  const now = Date.now();
  const left = m.startAt - now;
  if (left > 0) {
    count.hidden = false;
    count.textContent = String(Math.ceil(left / 1000));
  } else if (left > -900) {
    count.hidden = false;
    count.textContent = "สู้!";
  } else count.hidden = true;
  const t = document.querySelector<HTMLElement>("#arena-state .arena-timer");
  if (t) t.textContent = `⏱ ${clock(Math.min(MATCH_MS, m.endsAt - now))}`;
}

export const HONOR_TEXT = `ชนะ +${HONOR.win} · เสมอ +${HONOR.draw} · แพ้ +${HONOR.loss} เกียรติยศ`;
