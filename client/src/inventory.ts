import {
  BAG_SIZE,
  canUse,
  countItem,
  CRAFT_NAMES,
  CRAFT_SKILL,
  CraftKind,
  CRYSTAL,
  emptyInventory,
  Inventory,
  ItemDef,
  itemFlat,
  ITEMS,
  ItemStack,
  qualityChances,
  Recipe,
  RECIPES,
  sellPrice,
  Slot,
  SLOT_NAMES,
  SLOTS,
  stackName,
  StationKind,
  STORAGE_SIZE,
} from "../../shared/items";
import { describeMods } from "../../shared/passives";
import { Job, JOB_NAMES } from "../../shared/stats";
import { itemIcon } from "./icons";
import { drawHero, lookOf } from "./hero";
import { equipTotals, ItemSlot } from "../../shared/items";

/** Bag and gear (key I), the blacksmith window and the storage chest. */

const $ = (id: string) => document.getElementById(id) as HTMLElement;

export interface ItemActions {
  equip(uid: string): void;
  unequip(slot: Slot): void;
  craft(item: string, crystal: boolean): void;
  buy(item: string): void;
  sell(uid: string): void;
  deposit(uid: string): void;
  withdraw(uid: string): void;
}

let actions: ItemActions;
let inv: Inventory = emptyInventory();
let gold = 0;
let level = 1;
let job: Job = "wanderer";
let craftKind: CraftKind = "smith";
let station: StationKind | null = null;
/** which group of things the bag shows, and which way the hero faces */
let tab = "all";
let facing = 0;
let heroColor = 0x4a90d9;
let heroKey = "";
export function setHeroColor(c: number) {
  heroColor = c;
}
interface Tab {
  id: string;
  icon: string;
  name: string;
  test: (d: ItemDef) => boolean;
}
const inSlots = (...s: ItemSlot[]) => (d: ItemDef) => !!d.slot && s.includes(d.slot);
const TABS: Tab[] = [
  { id: "all", icon: "🎒", name: "ทั้งหมด", test: () => true },
  { id: "weapon", icon: "⚔️", name: "อาวุธและมือรอง", test: inSlots("weapon", "offhand") },
  { id: "armor", icon: "🛡️", name: "หมวก เกราะ และชุด", test: inSlots("head", "body", "hands", "feet", "belt", "cloak") },
  { id: "trinket", icon: "💍", name: "สร้อยและแหวน", test: inSlots("neck", "ring") },
  { id: "material", icon: "🪨", name: "วัตถุดิบ", test: (d) => d.kind === "material" },
  { id: "tool", icon: "⛏️", name: "เครื่องมือ", test: (d) => d.kind === "tool" },
];
/** what the details box shows */
let selected: { where: "bag" | "storage" | "equip"; uid: string } | null = null;

export function initInventory(a: ItemActions) {
  const first = !actions;
  actions = a;
  closeStation();
  if (!first) return;
  $("bag-open").hidden = false;
  $("bag-open").onclick = () => toggleBag();
  $("bag-close").onclick = () => toggleBag(false);
  $("hero-left").onclick = () => turnHero(1);
  $("hero-right").onclick = () => turnHero(-1);
  // drag across the hero to turn them
  const stage = $("hero-canvas");
  let dragX: number | null = null;
  stage.addEventListener("pointerdown", (e) => {
    dragX = e.clientX;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (dragX === null) return;
    const steps = Math.trunc((e.clientX - dragX) / 40);
    if (steps) {
      dragX += steps * 40;
      turnHero(-steps);
    }
  });
  stage.addEventListener("pointerup", () => (dragX = null));
  $("station-close").onclick = () => closeStation();
  $("use-crystal").onchange = () => render();
  window.addEventListener("keydown", (e) => {
    const el = document.activeElement as HTMLInputElement | null;
    if ((el?.tagName === "INPUT" && el.type !== "checkbox") || el?.tagName === "SELECT" || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === "KeyI") toggleBag();
    else if (e.code === "Escape") {
      closeStation();
      toggleBag(false);
    }
  });
}

export function setInventory(i: Inventory, g: number) {
  inv = i;
  gold = g;
  render();
}

export function setItemLevel(l: number, j: Job) {
  if (l === level && j === job) return;
  level = l;
  job = j;
  render();
}

export function toggleBag(open = $("bag").hidden) {
  $("bag").hidden = !open;
  if (!open) closeStation();
  render();
}

function turnHero(by: number) {
  facing = (facing + by + 8) % 8;
  heroKey = "";
  if (!$("bag").hidden) drawHeroNow();
}

function drawHeroNow() {
  const look = lookOf(heroColor, inv);
  const key = JSON.stringify(look) + facing;
  if (key === heroKey) return;
  heroKey = key;
  void drawHero($("hero-canvas") as HTMLCanvasElement, look, facing);
}

export function openStation(kind: StationKind) {
  station = kind;
  document.body.classList.add("station-open");
  $("bag").hidden = false;
  $("station").hidden = false;
  render();
}

export function closeStation() {
  if (!station) return;
  station = null;
  document.body.classList.remove("station-open");
  $("station").hidden = true;
  if (selected?.where === "storage") selected = null;
  render();
}

export const openStationKind = () => station;

// ---- drawing ------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Lines describing an item: numbers, bonuses, who made it. */
export function itemLines(s: ItemStack): string[] {
  const d = ITEMS[s.id];
  const out: string[] = [];
  if (d.slot) {
    if (d.unique) out.push("★ ของตำนาน");
    out.push(`${d.slot === "ring" ? "แหวน" : SLOT_NAMES[d.slot]} · Tier ${d.tier}${(d.level ?? 1) > 1 ? ` · ต้อง Lv ${d.level}` : ""}`);
    if (d.jobs) out.push(`ใช้ได้: ${d.jobs.map((j) => JOB_NAMES[j]).join(" ")}`);
    const f = itemFlat(s);
    if (f.atk) out.push(`พลังโจมตี +${f.atk}`);
    if (f.def) out.push(`ป้องกัน +${f.def}`);
    if (f.hp) out.push(`เลือด +${f.hp}`);
    out.push(...describeMods(d.mods ?? {}));
    out.push(...describeMods(s.affixes ?? {}).map((t) => `✦ ${t}`));
    if (s.maker) out.push(`ฝีมือของ ${s.maker}`);
  } else out.push(d.kind === "tool" ? "เครื่องมือ" : `วัตถุดิบ Tier ${d.tier}`);
  if (d.desc) out.push(d.desc);
  return out;
}

function slotButton(s: ItemStack | undefined, where: "bag" | "storage" | "equip", empty = "") {
  const b = el("button", "islot");
  b.type = "button";
  if (!s) {
    b.disabled = true;
    b.append(el("span", "empty", empty));
    return b;
  }
  const d = ITEMS[s.id];
  b.classList.add(`q${s.quality ?? 0}`, `tier${d.tier}`);
  if (d.unique) b.classList.add("unique");
  if (selected?.uid === s.uid) b.classList.add("sel");
  b.append(itemIcon(s.id));
  if (s.qty > 1) b.append(el("span", "qty", String(s.qty)));
  else if (d.kind === "equip") b.append(el("span", "qty", `T${d.tier}`));
  b.title = [stackName(s), ...itemLines(s)].join("\n");
  b.setAttribute("aria-label", stackName(s));
  b.onclick = () => {
    selected = { where, uid: s.uid };
    render();
  };
  b.ondblclick = () => {
    if (where === "storage") actions.withdraw(s.uid);
    else if (where === "equip") actions.unequip(slotOf(s.uid));
    else if (station === "storage") actions.deposit(s.uid);
    else if (d.slot) actions.equip(s.uid);
  };
  return b;
}

/** The slot this worn item is in. */
function slotOf(uid: string): Slot {
  return (Object.entries(inv.equip).find(([, x]) => x?.uid === uid)?.[0] ?? "weapon") as Slot;
}

function findSelected(): ItemStack | undefined {
  if (!selected) return undefined;
  const { where, uid } = selected;
  const list = where === "bag" ? inv.bag : where === "storage" ? inv.storage : Object.values(inv.equip);
  return list.find((s) => s?.uid === uid);
}

function render() {
  if (!actions) return;
  if (!$("bag").hidden) renderBag();
  if (station === "smith") renderSmith();
  else if (station === "storage") renderStorage();
}

function renderBag() {
  // gear worn, on both sides of the hero
  const worn = (slot: Slot) => {
    const box = el("div", "eslot");
    box.append(slotButton(inv.equip[slot], "equip", SLOT_NAMES[slot]));
    box.title = inv.equip[slot] ? "" : `${SLOT_NAMES[slot]} (ว่าง)`;
    return box;
  };
  $("equip-left").replaceChildren(...(["head", "neck", "body", "cloak", "belt", "feet"] as Slot[]).map(worn));
  $("equip-right").replaceChildren(...(["weapon", "offhand", "hands", "ring1", "ring2"] as Slot[]).map(worn));
  void SLOTS;
  $("bag-count").textContent = `${inv.bag.length} / ${BAG_SIZE} ช่อง`;
  $("bag-gold").textContent = `🪙 ${gold.toLocaleString("th-TH")}`;
  // the tabs down the left side
  $("inv-tabs").replaceChildren(
    ...TABS.map((t) => {
      const b = el("button", "inv-tab" + (t.id === tab ? " on" : ""), t.icon);
      b.type = "button";
      b.title = t.name;
      const n = inv.bag.filter((s) => t.test(ITEMS[s.id])).length;
      if (t.id !== "all" && n) b.append(el("small", "", String(n)));
      b.onclick = () => {
        tab = t.id;
        render();
      };
      return b;
    }),
  );
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  $("inv-tab-name").textContent = current.name;
  const grid = $("bag-grid");
  grid.replaceChildren();
  const shown = inv.bag.filter((s) => current.test(ITEMS[s.id]));
  for (const s of shown) grid.append(slotButton(s, "bag"));
  const empty = tab === "all" ? BAG_SIZE - shown.length : Math.max(0, 24 - shown.length);
  for (let i = 0; i < empty; i++) grid.append(slotButton(undefined, "bag"));
  // what all the gear adds up to
  const t = equipTotals(inv.equip).flat;
  $("hero-stats").replaceChildren(
    ...[
      ["⚔️", "โจมตี", t.atk],
      ["🛡️", "ป้องกัน", t.def],
      ["❤️", "เลือด", t.hp],
    ].map(([icon, name, v]) => {
      const c = el("div", "hstat");
      c.title = `${name}จากอุปกรณ์`;
      c.append(el("span", "", String(icon)), el("b", "", `+${v ?? 0}`), el("small", "", String(name)));
      return c;
    }),
  );
  drawHeroNow();
  renderDetails();
}

function actionButton(text: string, run: () => void, cls = "") {
  const b = el("button", cls, text);
  b.type = "button";
  b.onclick = run;
  return b;
}

function renderDetails() {
  const box = $("item-details");
  box.replaceChildren();
  const s = findSelected();
  if (!s || !selected) {
    box.append(el("div", "hint", "คลิกของเพื่อดูรายละเอียด ดับเบิลคลิกเพื่อสวมใส่"));
    return;
  }
  const d = ITEMS[s.id];
  const head = el("div", "dhead");
  head.append(itemIcon(s.id));
  const title = el("div", "dtitle");
  title.append(el("h3", d.unique ? "qtu" : `qt${s.quality ?? 0}`, stackName(s) + (s.qty > 1 ? ` × ${s.qty}` : "")));
  title.append(el("div", "dstars", "★".repeat(Math.max(1, d.tier)) + "☆".repeat(Math.max(0, 6 - Math.max(1, d.tier)))));
  head.append(title);
  box.append(head);
  if (d.slot) {
    const f = itemFlat(s);
    const chips = el("div", "dchips");
    if (f.atk) chips.append(el("span", "chip atk", `⚔️ ${f.atk}`));
    if (f.def) chips.append(el("span", "chip def", `🛡️ ${f.def}`));
    if (f.hp) chips.append(el("span", "chip hp", `❤️ ${f.hp}`));
    for (const m of [...describeMods(d.mods ?? {}), ...describeMods(s.affixes ?? {})]) chips.append(el("span", "chip mod", m));
    box.append(chips);
  }
  const lines = itemLines(s).filter((t) => !/^(พลังโจมตี|ป้องกัน|เลือด) \+/.test(t) && !describeMods(d.mods ?? {}).includes(t) && !t.startsWith("✦"));
  for (const t of lines) box.append(el("div", t === d.desc ? "ddesc" : "dline", t));
  const row = el("div", "row");
  if (selected.where === "equip") row.append(actionButton("ถอด", () => actions.unequip(slotOf(s.uid))));
  if (selected.where === "bag" && d.slot) {
    const b = actionButton("สวมใส่", () => actions.equip(s.uid));
    b.disabled = level < (d.level ?? 1) || !canUse(d, job);
    row.append(b);
  }
  if (selected.where === "bag" && station === "storage") row.append(actionButton("ฝากเข้าคลัง", () => actions.deposit(s.uid)));
  if (selected.where === "bag" && station === "smith")
    row.append(actionButton(`ขายทั้งกอง (${sellPrice(s) * s.qty} เหรียญ)`, () => actions.sell(s.uid), "sell"));
  if (selected.where === "storage") row.append(actionButton("ถอนออก", () => actions.withdraw(s.uid)));
  if (row.children.length) box.append(row);
}

function recipeRow(r: Recipe) {
  const d: ItemDef = ITEMS[r.item];
  const row = el("div", "recipe");
  const plain: ItemStack = { uid: "", id: r.item, qty: 1 };
  row.title = [d.name, ...itemLines(plain)].join("\n");
  row.append(itemIcon(r.item));
  const mid = el("div", "mid");
  mid.append(el("div", "rname", d.name));
  const f = itemFlat(plain);
  const nums = [f.atk && `โจมตี +${f.atk}`, f.def && `ป้องกัน +${f.def}`, f.hp && `เลือด +${f.hp}`].filter(Boolean).join(" · ");
  mid.append(el("div", "rnum", `${nums}${(d.level ?? 1) > 1 ? ` · ต้อง Lv ${d.level}` : ""}`));
  const needs = el("div", "needs");
  const skill = inv[CRAFT_SKILL[r.craft ?? "smith"]];
  let ok = skill >= r.minSkill;
  for (const [id, n] of Object.entries(r.needs)) {
    const have = countItem(inv.bag, id);
    if (have < n) ok = false;
    needs.append(el("span", have < n ? "lack" : "", `${ITEMS[id].name} ${have}/${n}`));
  }
  if (skill < r.minSkill) needs.append(el("span", "lack", `ฝีมือ ${r.minSkill}`));
  mid.append(needs);
  const crystal = ($("use-crystal") as HTMLInputElement).checked;
  if (crystal && countItem(inv.bag, CRYSTAL) < 1) ok = false;
  const b = actionButton("ทำ", () => actions.craft(r.item, crystal));
  b.disabled = !ok;
  row.append(mid, b);
  return row;
}

function renderSmith() {
  $("station-title").textContent = "ช่างฝีมือ";
  $("craft-tabs").replaceChildren(
    ...(Object.keys(CRAFT_NAMES) as CraftKind[]).map((k) => {
      const b = actionButton(CRAFT_NAMES[k], () => {
        craftKind = k;
        render();
      });
      b.setAttribute("aria-pressed", String(k === craftKind));
      return b;
    }),
  );
  const skill = inv[CRAFT_SKILL[craftKind]];
  $("smith-only").hidden = false;
  $("storage-grid").hidden = true;
  const crystal = ($("use-crystal") as HTMLInputElement).checked;
  const [good, great, master] = qualityChances(skill, crystal).map((c) => Math.round(c * 100));
  $("smith-skill").textContent = `ฝีมือ${CRAFT_NAMES[craftKind]} ${skill}/100 · โอกาสระดับดี ${good}% ชั้นเยี่ยม ${great}% ผลงานชิ้นเอก ${master}%`;
  $("crystal-have").textContent = `ใส่${ITEMS[CRYSTAL].name} 1 ก้อน (มี ${countItem(inv.bag, CRYSTAL)})`;
  $("recipes").replaceChildren(...RECIPES.filter((r) => (r.craft ?? "smith") === craftKind).map(recipeRow));
  $("shop").replaceChildren(
    ...Object.entries(ITEMS)
      .filter(([, d]) => d.buy)
      .map(([id, d]) => {
        const row = el("div", "recipe");
        const mid = el("div", "mid");
        mid.append(el("div", "rname", d.name), el("div", "rnum", d.desc ?? ""));
        const b = actionButton(`ซื้อ ${d.buy}`, () => actions.buy(id));
        b.disabled = gold < d.buy!;
        row.append(itemIcon(id), mid, b);
        return row;
      }),
  );
}

function renderStorage() {
  $("station-title").textContent = `คลังเก็บของ ${inv.storage.length} / ${STORAGE_SIZE}`;
  $("smith-only").hidden = true;
  const grid = $("storage-grid");
  grid.hidden = false;
  grid.replaceChildren();
  for (let i = 0; i < STORAGE_SIZE; i++) grid.append(slotButton(inv.storage[i], "storage"));
}

// ---- gathering bar ------------------------------------------------------------

export function showGathering(ms: number, name = "") {
  const bar = $("castbar");
  bar.hidden = ms <= 0;
  if (ms <= 0) return;
  $("cast-text").textContent = `กำลังเก็บ${name}...`;
  const fill = $("cast-fill");
  fill.style.transition = "none";
  fill.style.width = "0";
  void fill.offsetWidth; // restart the animation
  fill.style.transition = `width ${ms}ms linear`;
  fill.style.width = "100%";
}
