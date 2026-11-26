import { isMainJob, Job, JOB_CHANGE_LEVEL, JOB_NAMES, jobHas, SECOND_JOB_LEVEL, SkillDef, SKILLS } from "../../shared/stats";
import icons from "./icons.json";
import { itemIcon } from "./icons";

/**
 * The skill window (key K): every skill of your jobs as a card, with what the
 * next level changes and a button to learn it. Points are spent here, not on
 * the action bar.
 */

const $ = (id: string) => document.getElementById(id) as HTMLElement;

interface SkillView {
  job: string;
  level: number;
  skills: Map<string, number>;
  points: number;
}

let view: SkillView | null = null;
let learn: (id: string) => void = () => {};
let started = false;
let lastKey = "";

export function initSkillWindow(onLearn: (id: string) => void) {
  learn = onLearn;
  $("skill-open").hidden = false;
  if (started) return;
  started = true;
  $("skill-open").onclick = () => toggleSkills();
  $("skillwin-close").onclick = () => toggleSkills(false);
  window.addEventListener("keydown", (e) => {
    const el = document.activeElement as HTMLInputElement | null;
    if ((el?.tagName === "INPUT" && el.type !== "checkbox") || el?.tagName === "SELECT" || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === "KeyK") toggleSkills();
    else if (e.code === "Escape") toggleSkills(false);
  });
}

export function toggleSkills(open = $("skillwin").hidden) {
  $("skillwin").hidden = !open;
  if (open) {
    lastKey = "";
    render();
  }
}

/** Called with every update of the player; redraws only when something changed. */
export function setSkillView(v: SkillView) {
  view = v;
  const badge = $("skill-badge");
  badge.hidden = v.points <= 0 || v.job === "wanderer";
  badge.textContent = String(v.points);
  if (!$("skillwin").hidden) render();
}

/** A number that grows with each level, the way the server works it out. */
const at = (base: number | undefined, per: number | undefined, lvl: number) => (base ?? 0) + (per ?? 0) * (lvl - 1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (ms: number) => `${+(ms / 1000).toFixed(1)} วิ`;

/** What changes from level to level, as "name: now → next" lines. */
function growth(d: SkillDef, lvl: number): { label: string; now: string; next: string }[] {
  const out: { label: string; now: string; next: string }[] = [];
  const add = (label: string, base: number | undefined, per: number | undefined, fmt: (v: number) => string) => {
    if (base === undefined && !per) return;
    const n = lvl > 0 ? fmt(at(base, per, lvl)) : "—";
    const x = lvl < d.maxLevel ? fmt(at(base, per, lvl + 1)) : "";
    out.push({ label, now: n, next: x });
  };
  if (d.power !== undefined || d.powerPerLevel) add("ดาเมจ", d.power, d.powerPerLevel, pct);
  if (d.amount !== undefined || d.amountPerLevel) add(d.kind === "heal" || d.kind === "massheal" ? "ฟื้นฟู" : "ผล", d.amount, d.amountPerLevel, (v) => (Math.abs(v) < 5 ? pct(v) : String(Math.round(v))));
  if (d.reduce !== undefined || d.reducePerLevel) add("ลดดาเมจ", d.reduce, d.reducePerLevel, pct);
  if (d.stunMs !== undefined || d.stunPerLevelMs) add("มึน", d.stunMs, d.stunPerLevelMs, sec);
  if (d.durationMs !== undefined || d.durationPerLevel) add("นาน", d.durationMs, d.durationPerLevel, sec);
  if (d.radius !== undefined || d.radiusPerLevel) add("รัศมี", d.radius, d.radiusPerLevel, (v) => `${+v.toFixed(1)} ช่อง`);
  if (d.crit !== undefined || d.critPerLevel) add("คริติคอล", d.crit, d.critPerLevel, (v) => `+${+v.toFixed(1)}%`);
  if (d.dodge !== undefined || d.dodgePerLevel) add("หลบ", d.dodge, d.dodgePerLevel, (v) => `+${+v.toFixed(1)}%`);
  if (d.cooldownPerLevel) add("คูลดาวน์", d.cooldownMs, d.cooldownPerLevel, sec);
  return out;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function card(id: string, d: SkillDef, lvl: number, points: number) {
  const c = el("div", "skcard" + (lvl === 0 ? " unlearned" : "") + (lvl >= d.maxLevel ? " maxed" : ""));
  const pic = (icons.index as Record<string, number>)[`sk_${id}`] !== undefined ? itemIcon(`sk_${id}`, "pic") : el("div", "pic", d.name.slice(0, 2));
  const icon = el("div", "skicon");
  icon.append(pic, el("span", "skkey", d.key));
  const head = el("div", "skhead");
  const pips = el("div", "skpips");
  for (let i = 1; i <= d.maxLevel; i++) pips.append(el("i", i <= lvl ? "on" : ""));
  head.append(el("b", "", d.name), pips, el("small", "", `ขั้น ${lvl}/${d.maxLevel}`));
  const info = el("div", "skinfo");
  info.append(head, el("p", "skdesc", d.desc));
  const meta = el("div", "skmeta");
  meta.append(el("span", "", `⏱ ${sec(d.cooldownMs)}`));
  if (d.mp) meta.append(el("span", "", `💧 ${d.mp} MP`));
  if (d.range > 0) meta.append(el("span", "", `🎯 ${+d.range.toFixed(1)} ช่อง`));
  info.append(meta);
  const rows = growth(d, lvl);
  if (rows.length) {
    const g = el("div", "skgrow");
    for (const r of rows) {
      const line = el("div", "");
      line.append(el("span", "lbl", r.label), el("span", "now", r.now));
      if (r.next) line.append(el("span", "arrow", "→"), el("span", "next", r.next));
      g.append(line);
    }
    info.append(g);
  }
  const btn = el("button", "sklearn", lvl >= d.maxLevel ? "สูงสุด" : lvl === 0 ? "เรียน" : "อัปขั้น");
  btn.type = "button";
  btn.disabled = lvl >= d.maxLevel || points <= 0;
  btn.onclick = () => learn(id);
  c.append(icon, info, btn);
  return c;
}

function render() {
  if (!view) return;
  const v = view;
  const key = `${v.job}|${v.points}|${v.level}|${[...v.skills.entries()].join(",")}`;
  if (key === lastKey) return;
  lastKey = key;
  const body = $("skillwin-body");
  $("skillwin-points").textContent = v.job === "wanderer" ? "" : `แต้มสกิลเหลือ ${v.points}`;
  $("skillwin-points").classList.toggle("has", v.points > 0);
  body.replaceChildren();
  if (v.job === "wanderer") {
    body.append(el("p", "skempty", v.level < JOB_CHANGE_LEVEL ? `ยังไม่มีสกิล เลือกอาชีพได้เมื่อถึง Lv ${JOB_CHANGE_LEVEL} แล้วจะได้แต้มสกิลมาอัปที่นี่` : "เลือกอาชีพที่แถบด้านล่างก่อน แล้วสกิลจะมาอยู่ที่นี่"));
    return;
  }
  // the first job's skills, then the second job's
  const groups = new Map<string, [string, SkillDef][]>();
  for (const [id, d] of Object.entries(SKILLS)) {
    if (!jobHas(v.job, d.job)) continue;
    const list = groups.get(d.job) ?? [];
    list.push([id, d]);
    groups.set(d.job, list);
  }
  const order = [...groups.keys()].sort((a, b) => Number(!isMainJob(a)) - Number(!isMainJob(b)));
  for (const job of order) {
    const sec2 = el("section", "skgroup");
    sec2.append(el("h3", "", `${JOB_NAMES[job as Job] ?? job}${isMainJob(job) ? "" : " · อาชีพขั้นสอง"}`));
    const grid = el("div", "skgrid");
    for (const [id, d] of groups.get(job)!.sort((a, b) => (a[1].key === "0" ? 10 : +a[1].key) - (b[1].key === "0" ? 10 : +b[1].key))) grid.append(card(id, d, v.skills.get(id) ?? 0, v.points));
    sec2.append(grid);
    body.append(sec2);
  }
  if (isMainJob(v.job)) body.append(el("p", "skempty", v.level < SECOND_JOB_LEVEL ? `อาชีพขั้นสองและสกิลชุดใหม่ปลดล็อกที่ Lv ${SECOND_JOB_LEVEL}` : "เลือกอาชีพขั้นสองได้ที่แถบด้านล่าง"));
}
