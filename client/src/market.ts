import { emptyInventory, Inventory, ITEMS, ItemStack, stackName } from "../../shared/items";
import { afterTax, BoardData, Listing, PRICE_MAX, STALL_SLOTS, STALL_TITLE_MAX, StallData } from "../../shared/market";
import { itemIcon } from "./icons";
import { itemLines } from "./inventory";

/** The auction board and player stalls: one window with different pages. */

const $ = (id: string) => document.getElementById(id) as HTMLElement;

export interface MarketActions {
  refresh(): void;
  sell(uid: string, qty: number, price: number): void;
  buy(id: string, qty: number): void;
  cancel(id: string): void;
  order(item: string, qty: number, price: number): void;
  fill(id: string, uid: string, qty: number): void;
  claim(id: string): void;
  stallOpen(title: string, items: { uid: string; qty: number; price: number }[]): void;
  stallClose(): void;
  stallBuy(id: string, uid: string, qty: number): void;
}

type Page = "buy" | "sell" | "orders" | "mine";
const PAGES: [Page, string][] = [
  ["buy", "ซื้อ"],
  ["sell", "ขาย"],
  ["orders", "รับซื้อ"],
  ["mine", "ของฉัน"],
];

let actions: MarketActions;
let inv: Inventory = emptyInventory();
let gold = 0;
let board: BoardData | null = null;
let stall: StallData | null = null;
let mode: "board" | "stall" | "setup" | null = null;
let page: Page = "buy";
let search = "";
/** prices typed so far, kept when the window is drawn again */
const typed = new Map<string, string>();

export function initMarket(a: MarketActions) {
  const first = !actions;
  actions = a;
  closeMarket();
  if (!first) return;
  $("market-close").onclick = () => closeMarket();
  $("stall-new").onclick = () => openSetup();
  window.addEventListener("keydown", (e) => e.code === "Escape" && mode && closeMarket());
}

export const marketMode = () => mode;
export const visitedStall = () => (mode === "stall" ? stall?.id ?? null : null);

export function setMarketInventory(i: Inventory, g: number) {
  inv = i;
  gold = g;
  // do not redraw under somebody's typing
  if (mode && !$("market").contains(document.activeElement)) render();
}

export function openBoard() {
  mode = "board";
  board = null;
  actions.refresh();
  render();
}

export function setBoard(d: BoardData) {
  board = d;
  if (mode === "board") render();
}

export function setStall(d: StallData | null) {
  stall = d;
  if (d) mode = "stall";
  else if (mode === "stall" || mode === "setup") mode = null;
  render();
}

function openSetup() {
  mode = "setup";
  typed.clear();
  render();
}

export function closeMarket() {
  mode = null;
  stall = null;
  render();
}

// ---- small pieces ---------------------------------------------------------------

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

/** A number box that remembers what was typed under `key`. */
function numberBox(key: string, value: number, max: number, label: string) {
  const i = el("input", "num");
  i.type = "number";
  i.min = "1";
  i.max = String(max);
  i.step = "1";
  i.value = typed.get(key) ?? String(value);
  i.title = label;
  i.setAttribute("aria-label", label);
  i.oninput = () => typed.set(key, i.value);
  return i;
}
const read = (i: HTMLInputElement) => Math.floor(Number(i.value)) || 0;
const coins = (n: number) => `${n.toLocaleString("th-TH")} เหรียญ`;

function itemInfo(s: ItemStack, under: string) {
  const mid = el("div", "mid");
  mid.append(el("div", `rname qt${s.quality ?? 0}`, stackName(s) + (s.qty > 1 ? ` × ${s.qty}` : "")), el("div", "rnum", under));
  mid.title = [stackName(s), ...itemLines(s)].join("\n");
  return mid;
}

function row(s: ItemStack, under: string, ...right: HTMLElement[]) {
  const r = el("div", "recipe");
  r.append(itemIcon(s.id), itemInfo(s, under), ...right);
  return r;
}

const plain = (id: string, qty = 1): ItemStack => ({ uid: "", id, qty });

// ---- pages ------------------------------------------------------------------------

function render() {
  if (!actions) return;
  const win = $("market");
  win.hidden = mode === null;
  if (!mode) return;
  const body = $("market-body");
  const scroll = body.scrollTop;
  body.replaceChildren();
  $("market-tabs").replaceChildren();
  if (mode === "board") renderBoard(body);
  else if (mode === "stall") renderStall(body);
  else renderSetup(body);
  body.scrollTop = scroll;
}

function renderBoard(body: HTMLElement) {
  $("market-title").textContent = "กระดานประมูล";
  for (const [id, name] of PAGES) {
    const n = id === "mine" ? (board?.mine.claims.length ?? 0) : 0;
    const b = button(n ? `${name} (${n})` : name, () => {
      page = id;
      render();
    });
    b.setAttribute("aria-pressed", String(page === id));
    $("market-tabs").append(b);
  }
  if (!board) {
    body.append(el("div", "hint", "กำลังโหลด..."));
    return;
  }
  body.append(el("div", "hint", `มี ${coins(gold)} · กระดานหักภาษี 5% จากผู้ขาย ประกาศอยู่ 3 วัน`));
  if (page === "buy") pageBuy(body, board);
  else if (page === "sell") pageSell(body);
  else if (page === "orders") pageOrders(body, board);
  else pageMine(body, board);
}

function pageBuy(body: HTMLElement, d: BoardData) {
  const q = el("input", "search");
  q.placeholder = "ค้นหาชื่อไอเทม";
  q.value = search;
  const list = el("div");
  const fill = () => {
    const found = d.listings.filter((l) => stackName(l.item).includes(search.trim()));
    list.replaceChildren(...(found.length ? found.map(buyRow) : [el("div", "hint", "ยังไม่มีของขาย")]));
  };
  q.oninput = () => {
    search = q.value;
    fill();
  };
  body.append(q, list);
  fill();
}

function buyRow(l: Listing) {
  const qty = numberBox(`buy${l.id}`, 1, l.item.qty, "จำนวน");
  qty.hidden = l.item.qty === 1;
  const b = button("ซื้อ", () => actions.buy(l.id, l.item.qty === 1 ? 1 : read(qty)));
  const cost = () => (b.disabled = gold < l.price * Math.max(1, read(qty)));
  qty.addEventListener("input", cost);
  cost();
  return row(l.item, `ชิ้นละ ${coins(l.price)} · ${l.seller}`, qty, b);
}

function pageSell(body: HTMLElement) {
  if (!inv.bag.length) body.append(el("div", "hint", "กระเป๋าว่าง"));
  for (const s of inv.bag) {
    const qty = numberBox(`q${s.uid}`, s.qty, s.qty, "จำนวน");
    qty.hidden = s.qty === 1;
    const price = numberBox(`p${s.uid}`, Math.max(1, ITEMS[s.id].price * 2), PRICE_MAX, "ราคาต่อชิ้น");
    const under = el("span");
    const b = button("ตั้งขาย", () => {
      actions.sell(s.uid, s.qty === 1 ? 1 : read(qty), read(price));
      typed.delete(`q${s.uid}`);
    });
    const r = row(s, "", qty, price, b);
    const note = () => {
      under.textContent = `ขายหมดได้ ${coins(afterTax(read(price) * (s.qty === 1 ? 1 : read(qty))))}`;
    };
    qty.addEventListener("input", note);
    price.addEventListener("input", note);
    note();
    r.querySelector(".rnum")!.append(under);
    body.append(r);
  }
}

function pageOrders(body: HTMLElement, d: BoardData) {
  body.append(el("h3", "", "ตั้งรับซื้อ (วางเงินไว้ก่อน)"));
  const pick = el("select", "search");
  for (const [id, def] of Object.entries(ITEMS)) {
    const o = el("option", "", def.name);
    o.value = id;
    pick.append(o);
  }
  pick.value = typed.get("oitem") ?? "ore_1";
  pick.onchange = () => typed.set("oitem", pick.value);
  const qty = numberBox("oqty", 10, 99, "จำนวน");
  const price = numberBox("oprice", 5, PRICE_MAX, "ราคาต่อชิ้น");
  const line = el("div", "recipe");
  line.append(pick, qty, price, button("รับซื้อ", () => actions.order(pick.value, read(qty), read(price))));
  body.append(line, el("h3", "", "คนอื่นรับซื้อ"));
  if (!d.orders.length) body.append(el("div", "hint", "ยังไม่มีใครรับซื้อ"));
  for (const o of d.orders) {
    const have = inv.bag.filter((s) => s.id === o.item).sort((a, b) => (a.quality ?? 0) - (b.quality ?? 0) || b.qty - a.qty);
    const s = have[0];
    const max = s ? Math.min(s.qty, o.qty) : 0;
    const n = numberBox(`f${o.id}`, Math.max(1, max), Math.max(1, max), "จำนวน");
    n.hidden = max <= 1;
    const b = button("ขายให้", () => s && actions.fill(o.id, s.uid, max <= 1 ? 1 : read(n)));
    b.disabled = !s;
    body.append(row(plain(o.item, o.qty), `ให้ชิ้นละ ${coins(o.price)} (ได้จริง ${coins(afterTax(o.price))}) · ${o.buyer}${s ? "" : " · คุณไม่มี"}`, n, b));
  }
}

function pageMine(body: HTMLElement, d: BoardData) {
  const { claims, listings, orders } = d.mine;
  body.append(el("h3", "", "รอรับ"));
  if (!claims.length) body.append(el("div", "hint", "ไม่มีของรอรับ"));
  for (const c of claims) {
    const r = el("div", "recipe");
    if (c.item) r.append(itemIcon(c.item.id), itemInfo(c.item, c.note));
    else {
      const mid = el("div", "mid");
      mid.append(el("div", "rname", coins(c.gold)), el("div", "rnum", c.note));
      r.append(mid);
    }
    r.append(button("รับ", () => actions.claim(c.id)));
    body.append(r);
  }
  body.append(el("h3", "", "ที่ตั้งขายไว้"));
  if (!listings.length) body.append(el("div", "hint", "ไม่มี"));
  for (const l of listings) body.append(row(l.item, `ชิ้นละ ${coins(l.price)}`, button("ยกเลิก", () => actions.cancel(l.id), "sell")));
  body.append(el("h3", "", "ที่ตั้งรับซื้อไว้"));
  if (!orders.length) body.append(el("div", "hint", "ไม่มี"));
  for (const o of orders)
    body.append(row(plain(o.item, o.qty), `ชิ้นละ ${coins(o.price)} (วางไว้ ${coins(o.price * o.qty)})`, button("ยกเลิก", () => actions.cancel(o.id), "sell")));
}

function renderStall(body: HTMLElement) {
  if (!stall) return;
  const s = stall;
  $("market-title").textContent = s.title;
  const hours = Math.max(0, Math.ceil((s.expires - Date.now()) / 3600_000));
  body.append(el("div", "hint", s.mine ? `แผงของคุณ เปิดอยู่อีกไม่เกิน ${hours} ชั่วโมง ออกจากเกมได้ ของยังขายต่อ` : `แผงของ ${s.owner} · มี ${coins(gold)}`));
  for (const it of s.items) {
    const under = `ชิ้นละ ${coins(it.price)}`;
    if (s.mine) {
      body.append(row(it.stack, under));
      continue;
    }
    const qty = numberBox(`s${it.stack.uid}`, 1, it.stack.qty, "จำนวน");
    qty.hidden = it.stack.qty === 1;
    const b = button("ซื้อ", () => actions.stallBuy(s.id, it.stack.uid, it.stack.qty === 1 ? 1 : read(qty)));
    b.disabled = gold < it.price;
    body.append(row(it.stack, under, qty, b));
  }
  if (s.mine) body.append(button("เก็บแผง", () => actions.stallClose(), "wide sell"));
}

function renderSetup(body: HTMLElement) {
  $("market-title").textContent = "เปิดแผงลอย";
  body.append(el("div", "hint", `เลือกของ ใส่จำนวนและราคาต่อชิ้น (สูงสุด ${STALL_SLOTS} รายการ) เปิดได้ในหมู่บ้าน ไม่เสียภาษี อยู่ได้ 12 ชั่วโมงแม้ออกจากเกม`));
  const title = el("input", "search");
  title.placeholder = "ชื่อแผง";
  title.maxLength = STALL_TITLE_MAX;
  title.value = typed.get("title") ?? "";
  title.oninput = () => typed.set("title", title.value);
  body.append(title);
  const rows: { uid: string; on: HTMLInputElement; qty: HTMLInputElement; price: HTMLInputElement; one: boolean }[] = [];
  if (!inv.bag.length) body.append(el("div", "hint", "กระเป๋าว่าง"));
  for (const s of inv.bag) {
    const on = el("input");
    on.type = "checkbox";
    on.checked = typed.get(`on${s.uid}`) === "1";
    on.setAttribute("aria-label", `ขาย ${stackName(s)}`);
    on.onchange = () => typed.set(`on${s.uid}`, on.checked ? "1" : "");
    const qty = numberBox(`sq${s.uid}`, s.qty, s.qty, "จำนวน");
    qty.hidden = s.qty === 1;
    const price = numberBox(`sp${s.uid}`, Math.max(1, ITEMS[s.id].price * 2), PRICE_MAX, "ราคาต่อชิ้น");
    rows.push({ uid: s.uid, on, qty, price, one: s.qty === 1 });
    body.append(row(s, "", qty, price, on));
  }
  body.append(
    button(
      "เปิดแผง",
      () => {
        const items = rows.filter((r) => r.on.checked).map((r) => ({ uid: r.uid, qty: r.one ? 1 : read(r.qty), price: read(r.price) }));
        if (items.length) actions.stallOpen(title.value, items);
      },
      "wide",
    ),
  );
}
