import { expToNext, Job, JOB_CHANGE_LEVEL, JOB_NAMES, MAX_LEVEL, RESPAWN_DELAY_MS, skillPointsEarned, SKILLS } from "../../shared/stats";

import { GLOW_AT } from "../../shared/hollow";

/** The DOM parts of the game screen: status panel, skill bar, death box. */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface MeView {
  name: string;
  level: number;
  exp: number;
  job: string;
  hp: number;
  maxHp: number;
  dead: boolean;
  skills: Map<string, number>;
}

export interface HudActions {
  useSkill(id: string): void;
  learnSkill(id: string): void;
  changeJob(): void;
  respawn(): void;
}

const cooldownEnds = new Map<string, { end: number; total: number }>();
let actions: HudActions;
let lastSkillsKey = "";
let deathShownAt = 0;

export function initHud(a: HudActions) {
  actions = a;
  $("hud").hidden = false;
  $("skillbar").hidden = false;
  $("chat").hidden = false;
  $("job-change").onclick = () => actions.changeJob();
  $("respawn").onclick = () => actions.respawn();
  if (!started) requestAnimationFrame(drawCooldowns);
  started = true;
}

let started = false;

/** Name of the map, and whether the Hollow bars show. */
export function setZone(name: string, hollow: boolean) {
  $("map-name").textContent = name;
  $("corruption-row").hidden = !hollow;
  $("death-text").textContent = hollow ? "ของที่พกมาตกอยู่ที่นี่ คุณจะฟื้นที่หมู่บ้าน" : "ฟื้นขึ้นที่ลานกลางหมู่บ้าน";
  cooldownEnds.clear();
  document.querySelectorAll<HTMLElement>(".skill .cd").forEach((el) => (el.style.height = "0"));
}

export function setCorruption(value: number, gatesUntil: number) {
  $("corruption-fill").style.width = `${value}%`;
  $("corruption-text").textContent = `การกัดกร่อน ${value}%${value >= GLOW_AT ? " ทุกคนเห็นคุณ!" : ""}`;
  const s = Math.max(0, Math.round((gatesUntil - Date.now()) / 1000));
  $("gate-timer").textContent = `ประตูย้ายใน ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function askEnterHollow(yes: () => void) {
  const box = $("enter-hollow");
  box.hidden = false;
  $("hollow-no").onclick = () => (box.hidden = true);
  $("hollow-yes").onclick = () => {
    box.hidden = true;
    yes();
  };
}

export function setOnline(n: number) {
  $("online").textContent = `ออนไลน์ ${n} คน`;
}

export function startCooldown(skill: string, ms: number) {
  cooldownEnds.set(skill, { end: performance.now() + ms, total: ms });
}

function drawCooldowns() {
  const now = performance.now();
  for (const [skill, cd] of cooldownEnds) {
    const el = document.querySelector<HTMLElement>(`.skill[data-skill="${skill}"] .cd`);
    const left = Math.max(0, cd.end - now);
    if (el) el.style.height = `${(left / cd.total) * 100}%`;
    if (!left) cooldownEnds.delete(skill);
  }
  requestAnimationFrame(drawCooldowns);
}

export function updateMe(me: MeView) {
  $("hud-name").textContent = me.name;
  $("hud-level").textContent = `Lv ${me.level}`;
  $("hud-job").textContent = JOB_NAMES[me.job as Job] ?? me.job;
  const hpPct = (Math.max(0, me.hp) / me.maxHp) * 100;
  $("hp-fill").style.width = `${hpPct}%`;
  $("hp-text").textContent = `HP ${Math.max(0, me.hp)} / ${me.maxHp}`;
  const need = expToNext(me.level);
  $("exp-fill").style.width = me.level >= MAX_LEVEL ? "100%" : `${(me.exp / need) * 100}%`;
  $("exp-text").textContent = me.level >= MAX_LEVEL ? "เลเวลสูงสุด" : `EXP ${me.exp} / ${need} (${((me.exp / need) * 100).toFixed(1)}%)`;

  $("job-change").hidden = !(me.job === "wanderer" && me.level >= JOB_CHANGE_LEVEL);

  let spent = 0;
  me.skills.forEach((v) => (spent += v));
  const points = skillPointsEarned(me.level) - spent;
  const key = `${me.job}|${points}|${[...me.skills.entries()].join(",")}`;
  if (key !== lastSkillsKey) {
    lastSkillsKey = key;
    renderSkills(me, points);
  }

  const death = $("death");
  if (me.dead && death.hidden) {
    death.hidden = false;
    deathShownAt = performance.now();
    $<HTMLButtonElement>("respawn").disabled = true;
    setTimeout(() => ($<HTMLButtonElement>("respawn").disabled = false), RESPAWN_DELAY_MS);
  } else if (!me.dead && !death.hidden) {
    death.hidden = true;
  }
  void deathShownAt;
}

function renderSkills(me: MeView, points: number) {
  const box = $("skills");
  box.replaceChildren();
  const squire = me.job === "squire";
  $("skill-points").textContent = squire
    ? points > 0
      ? `แต้มสกิลเหลือ ${points} (กด + เพื่ออัปสกิล)`
      : ""
    : me.level < JOB_CHANGE_LEVEL
      ? `สกิลสไควร์จะเปิดเมื่อเปลี่ยนอาชีพที่ Lv ${JOB_CHANGE_LEVEL}`
      : "";
  for (const [id, def] of Object.entries(SKILLS)) {
    const lvl = me.skills.get(id) ?? 0;
    const slot = document.createElement("div");
    slot.className = "skill" + (!squire || lvl === 0 ? " locked" : "");
    slot.dataset.skill = id;
    slot.title = `${def.name} (ขั้น ${lvl}/${def.maxLevel})\n${def.desc}\nคูลดาวน์ ${def.cooldownMs / 1000} วินาที`;
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = def.key;
    const name = document.createElement("div");
    name.textContent = def.name;
    const lv = document.createElement("span");
    lv.className = "lv";
    lv.textContent = `${lvl}/${def.maxLevel}`;
    const cd = document.createElement("div");
    cd.className = "cd";
    slot.append(key, name, lv, cd);
    slot.onclick = () => lvl > 0 && actions.useSkill(id);
    if (squire && points > 0 && lvl < def.maxLevel) {
      const plus = document.createElement("button");
      plus.className = "learn";
      plus.textContent = "+";
      plus.title = `อัป ${def.name}`;
      plus.onclick = (e) => {
        e.stopPropagation();
        actions.learnSkill(id);
      };
      slot.append(plus);
    }
    box.append(slot);
  }
}

/** Skill id bound to a number key, if any. */
export function skillForKey(key: string): string | undefined {
  return Object.entries(SKILLS).find(([, d]) => d.key === key)?.[0];
}
