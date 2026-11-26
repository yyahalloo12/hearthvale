import { emptyInventory, equipTotals, ITEMS, Inventory, Slot, SLOT_NAMES, stackName } from "../../shared/items";
import { passiveMods } from "../../shared/passives";
import { Job, JOB_NAMES, playerStats, CRIT_CHANCE } from "../../shared/stats";
import { WALK_SPEED } from "../../shared/constants";
import { itemIcon } from "./icons";
import { itemLines } from "./inventory";

/** The character window (key C): gear on both sides, the full numbers beside. */

const $ = (id: string) => document.getElementById(id) as HTMLElement;

const who = { name: "", level: 1, job: "wanderer" as Job, portrait: "" };
let inv: Inventory = emptyInventory();
let nodes: string[] = [];
let unequip: (slot: Slot) => void = () => {};
let started = false;

export function initCharWin(off: (slot: Slot) => void) {
  unequip = off;
  $("char-open").hidden = false;
  if (started) return;
  started = true;
  $("char-open").onclick = () => toggleChar();
  $("char-close").onclick = () => toggleChar(false);
  window.addEventListener("keydown", (e) => {
    const el = document.activeElement as HTMLInputElement | null;
    if ((el?.tagName === "INPUT" && el.type !== "checkbox") || el?.tagName === "SELECT" || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === "KeyC") toggleChar();
    else if (e.code === "Escape") toggleChar(false);
  });
}

export function toggleChar(open = $("charwin").hidden) {
  $("charwin").hidden = !open;
  if (open) render();
}

export function setCharacter(name: string, level: number, job: string) {
  if (who.name === name && who.level === level && who.job === job) return;
  Object.assign(who, { name, level, job });
  if (!$("charwin").hidden) render();
}
export function setCharPrivate(i: Inventory, n: string[]) {
  inv = i;
  nodes = n;
  if (!$("charwin").hidden) render();
}
export function setCharPortrait(src: string) {
  who.portrait = src;
  const img = document.getElementById("char-doll") as HTMLImageElement | null;
  if (img && !$("charwin").hidden) img.src = src;
}

function slot(s: Slot) {
  const box = document.createElement("div");
  box.className = "cslot";
  const worn = inv.equip[s];
  box.title = worn ? [stackName(worn), ...itemLines(worn), "คลิกเพื่อถอด"].join("\n") : `${SLOT_NAMES[s]} (ว่าง)`;
  if (worn) {
    box.append(itemIcon(worn.id));
    box.classList.add(`q${worn.quality ?? 0}`);
    if (ITEMS[worn.id].unique) box.classList.add("unique");
    box.onclick = () => unequip(s);
  } else box.append(Object.assign(document.createElement("span"), { className: "empty", textContent: SLOT_NAMES[s] }));
  return box;
}

function render() {
  $("char-title").textContent = `${who.name} · Lv ${who.level} ${JOB_NAMES[who.job] ?? ""}`;
  (document.getElementById("char-doll") as HTMLImageElement).src = who.portrait || "";
  $("char-left").replaceChildren(slot("head"), slot("neck"), slot("body"), slot("cloak"), slot("belt"));
  $("char-right").replaceChildren(slot("weapon"), slot("offhand"), slot("hands"), slot("ring1"), slot("ring2"), slot("feet"));
  const gear = equipTotals(inv.equip);
  const m = passiveMods(nodes, gear.mods);
  const st = playerStats(who.level, who.job, m, gear.flat);
  const pct = (v: number) => `${Math.round(v * 10) / 10}%`;
  const rows: [string, string][] = [
    ["เลือดสูงสุด", st.maxHp.toLocaleString("th-TH")],
    ["มานาสูงสุด", st.maxMp ? st.maxMp.toLocaleString("th-TH") : "-"],
    ["พลังโจมตี", st.atk.toLocaleString("th-TH")],
    ["ป้องกัน", st.def.toLocaleString("th-TH")],
    ["โอกาสคริติคอล", pct(CRIT_CHANCE * 100 + m.critChance)],
    ["ความแรงคริติคอล", pct(150 * (1 + m.critDmgPct / 100))],
    ["ความเร็วโจมตี", pct(100 + m.attackSpeedPct)],
    ["ความเร็วเดิน", `${(WALK_SPEED * (1 + m.moveSpeedPct / 100)).toFixed(1)} ช่อง/วิ`],
    ["หลบหลีก", pct(m.dodge)],
    ["ดาเมจสกิล", `+${pct(m.skillDmgPct)}`],
    ["คูลดาวน์สกิล", `-${pct(m.cdrPct)}`],
    ["รับดาเมจน้อยลง", pct(m.dmgReduce)],
    ["ดูดเลือด", pct(m.lifesteal)],
    ["ฟื้นเลือด", `+${pct(m.regenPct)}`],
    ["ลูกศร/กระสุนเพิ่ม", `+${Math.floor(m.extraProjectiles)}`],
    ["รัศมีสกิล", `+${pct(m.aoePct)}`],
    ["รักษาแรงขึ้น", `+${pct(m.healPct)}`],
    ["ใช้มานาน้อยลง", pct(m.manaCostPct)],
  ];
  $("char-details").replaceChildren(
    ...rows.map(([k, v]) => {
      const r = document.createElement("div");
      r.className = "drow";
      r.append(Object.assign(document.createElement("span"), { textContent: k }), Object.assign(document.createElement("b"), { textContent: v }));
      return r;
    }),
  );
}
