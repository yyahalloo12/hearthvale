import {
  BAG_SIZE,
  countItem,
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
let station: StationKind | null = null;
/** what the details box shows */
let selected: { where: "bag" | "storage" | "equip"; uid: string } | null = null;

export function initInventory(a: ItemActions) {
  actions = a;
  $("bag-open").hidden = false;
  $("bag-open").onclick = () => toggleBag();
  $("bag-close").onclick = () => toggleBag(false);
  $("station-close").onclick = () => closeStation();
  $("use-crystal").onchange = () => render();
  window.addEventListener("keydown", (e) => {
    const el = document.activeElement as HTMLInputElement | null;
    if ((el?.tagName === "INPUT" && el.type !== "checkbox") || e.ctrlKey || e.altKey || e.metaKey) return;
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

export function setItemLevel(l: number) {
  if (l === level) return;
  level = l;
  render();
}

export function toggleBag(open = $("bag").hidden) {
  $("bag").hidden = !open;
  if (!open) closeStation();
  render();
}

export function openStation(kind: StationKind) {
  station = kind;
  $("bag").hidden = false;
  $("station").hidden = false;
  render();
}

export function closeStation() {
  if (!station) return;
  station = null;
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
function lines(s: ItemStack): string[] {
  const d = ITEMS[s.id];
  const out: string[] = [];
  if (d.slot) {
    out.push(`${SLOT_NAMES[d.slot]} · Tier ${d.tier}${(d.level ?? 1) > 1 ? ` · ต้อง Lv ${d.level}` : ""}`);
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
  if (selected?.uid === s.uid) b.classList.add("sel");
  b.append(el("span", "icon", d.icon));
  if (s.qty > 1) b.append(el("span", "qty", String(s.qty)));
  else if (d.kind === "equip") b.append(el("span", "qty", `T${d.tier}`));
  b.title = [stackName(s), ...lines(s)].join("\n");
  b.setAttribute("aria-label", stackName(s));
  b.onclick = () => {
    selected = { where, uid: s.uid };
    render();
  };
  b.ondblclick = () => {
    if (where === "storage") actions.withdraw(s.uid);
    else if (where === "equip") actions.unequip(d.slot!);
    else if (station === "storage") actions.deposit(s.uid);
    else if (d.slot) actions.equip(s.uid);
  };
  return b;
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
  const worn = $("equip-slots");
  worn.replaceChildren(
    ...SLOTS.map((slot) => {
      const box = el("div", "eslot");
      box.append(slotButton(inv.equip[slot], "equip", ""), el("div", "ename", SLOT_NAMES[slot]));
      return box;
    }),
  );
  $("bag-count").textContent = `${inv.bag.length} / ${BAG_SIZE} ช่อง · ${gold.toLocaleString("th-TH")} เหรียญ`;
  const grid = $("bag-grid");
  grid.replaceChildren();
  for (let i = 0; i < BAG_SIZE; i++) grid.append(slotButton(inv.bag[i], "bag"));
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
  box.append(el("h3", `qt${s.quality ?? 0}`, stackName(s) + (s.qty > 1 ? ` × ${s.qty}` : "")));
  for (const t of lines(s)) box.append(el("div", "", t));
  const row = el("div", "row");
  if (selected.where === "equip") row.append(actionButton("ถอด", () => actions.unequip(d.slot!)));
  if (selected.where === "bag" && d.slot) {
    const b = actionButton("สวมใส่", () => actions.equip(s.uid));
    b.disabled = level < (d.level ?? 1);
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
  row.title = [d.name, ...lines(plain)].join("\n");
  row.append(el("span", "icon", d.icon));
  const mid = el("div", "mid");
  mid.append(el("div", "rname", d.name));
  const f = itemFlat(plain);
  const nums = [f.atk && `โจมตี +${f.atk}`, f.def && `ป้องกัน +${f.def}`, f.hp && `เลือด +${f.hp}`].filter(Boolean).join(" · ");
  mid.append(el("div", "rnum", `${nums}${(d.level ?? 1) > 1 ? ` · ต้อง Lv ${d.level}` : ""}`));
  const needs = el("div", "needs");
  let ok = inv.smithing >= r.minSkill;
  for (const [id, n] of Object.entries(r.needs)) {
    const have = countItem(inv.bag, id);
    if (have < n) ok = false;
    needs.append(el("span", have < n ? "lack" : "", `${ITEMS[id].name} ${have}/${n}`));
  }
  if (inv.smithing < r.minSkill) needs.append(el("span", "lack", `ฝีมือ ${r.minSkill}`));
  mid.append(needs);
  const crystal = ($("use-crystal") as HTMLInputElement).checked;
  if (crystal && countItem(inv.bag, CRYSTAL) < 1) ok = false;
  const b = actionButton("ตี", () => actions.craft(r.item, crystal));
  b.disabled = !ok;
  row.append(mid, b);
  return row;
}

function renderSmith() {
  $("station-title").textContent = "ช่างตีเหล็ก";
  $("smith-only").hidden = false;
  $("storage-grid").hidden = true;
  const crystal = ($("use-crystal") as HTMLInputElement).checked;
  const [good, great, master] = qualityChances(inv.smithing, crystal).map((c) => Math.round(c * 100));
  $("smith-skill").textContent = `ฝีมือ ${inv.smithing}/100 · โอกาสระดับดี ${good}% ชั้นเยี่ยม ${great}% ผลงานชิ้นเอก ${master}%`;
  $("crystal-have").textContent = `ใส่${ITEMS[CRYSTAL].name} 1 ก้อน (มี ${countItem(inv.bag, CRYSTAL)})`;
  $("recipes").replaceChildren(...RECIPES.map(recipeRow));
  $("shop").replaceChildren(
    ...Object.entries(ITEMS)
      .filter(([, d]) => d.buy)
      .map(([id, d]) => {
        const row = el("div", "recipe");
        const mid = el("div", "mid");
        mid.append(el("div", "rname", d.name), el("div", "rnum", d.desc ?? ""));
        const b = actionButton(`ซื้อ ${d.buy}`, () => actions.buy(id));
        b.disabled = gold < d.buy!;
        row.append(el("span", "icon", d.icon), mid, b);
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
