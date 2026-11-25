import {
  ATTRIBUTE_HELP,
  canReach,
  canRefund,
  describeMods,
  PASSIVE_EDGES,
  PASSIVE_NODES,
  PassiveNode,
  passiveMods,
  passivePointsEarned,
  PASSIVES,
  refundCost,
  rootsFor,
} from "../../shared/passives";

/**
 * The passive tree window (key P). Draws the whole tree as SVG: drag to move,
 * wheel to zoom, click a node to see it, then learn it or give it back.
 */

const NS = "http://www.w3.org/2000/svg";
const $ = <T extends Element = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;

const SCALE = 46; // pixels per unit of the JSON at zoom 1
const RADIUS = { small: 12, notable: 18, keystone: 23, root: 16 } as const;
const SIZE_NAME = { small: "โหนดเล็ก", notable: "โหนดเด่น", keystone: "โหนดหลัก", root: "จุดเริ่ม" } as const;
const AREA = {
  center: { name: "ใจกลาง", color: "#c9a227" },
  end: { name: "ความอึด", color: "#7d8f69" },
  str: { name: "กำลัง", color: "#c8503c" },
  agi: { name: "ความคล่อง", color: "#3f9d5a" },
  int: { name: "ปัญญา", color: "#4a7fd0" },
  fai: { name: "ศรัทธา", color: "#d9a0e0" },
} as const;

export interface TreeActions {
  learn(id: string): void;
  refund(id: string): void;
}

const state = { level: 1, job: "wanderer", gold: 0, nodes: new Set<string>(), ready: false };
const view = { x: 0, y: 0, zoom: 1 };
let actions: TreeActions;
let selected: string | null = null;
let built = false;

export function initPassiveTree(a: TreeActions) {
  const first = !actions;
  actions = a;
  if (!first) return;
  $("tree-open").hidden = false;
  $("tree-open").onclick = () => toggleTree();
  $("tree-close").onclick = () => toggleTree(false);
  window.addEventListener("keydown", (e) => {
    if (document.activeElement?.tagName === "INPUT" || e.ctrlKey || e.altKey || e.metaKey) return;
    // `code` is the physical key, so this works with a Thai keyboard layout too
    if (e.code === "KeyP") toggleTree();
    else if (e.code === "Escape" && !$("tree").hidden) toggleTree(false);
  });
}

export function setTreeCharacter(level: number, job: string) {
  if (state.level === level && state.job === job) return;
  state.level = level;
  state.job = job;
  refresh();
}

export function setTreePrivate(gold: number, nodes: string[]) {
  state.gold = gold;
  state.nodes = new Set(nodes);
  state.ready = true;
  refresh();
}

function pointsLeft() {
  return passivePointsEarned(state.level) - state.nodes.size;
}

export function toggleTree(open = $("tree").hidden) {
  $("tree").hidden = !open;
  if (!open) return;
  if (!built) build();
  refresh();
}

// ---- drawing ----------------------------------------------------------------

const nodeEls = new Map<string, SVGGElement>();
const edgeEls: { a: string; b: string; el: SVGLineElement }[] = [];

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function build() {
  built = true;
  const root = $<SVGGElement>("tree-nodes");
  for (const [a, b] of PASSIVE_EDGES) {
    const na = PASSIVES.get(a)!;
    const nb = PASSIVES.get(b)!;
    const el = svg("line", { x1: na.x * SCALE, y1: na.y * SCALE, x2: nb.x * SCALE, y2: nb.y * SCALE, class: "edge" });
    edgeEls.push({ a, b, el });
    root.append(el);
  }
  for (const n of PASSIVE_NODES) {
    const g = svg("g", {
      class: `node ${n.size}`,
      transform: `translate(${n.x * SCALE} ${n.y * SCALE})`,
      tabindex: 0,
      role: "button",
      "aria-label": n.name,
    });
    g.style.setProperty("--c", AREA[n.area].color);
    const r = RADIUS[n.size];
    if (n.size === "keystone") g.append(svg("rect", { x: -r * 0.8, y: -r * 0.8, width: r * 1.6, height: r * 1.6, transform: "rotate(45)", class: "shape" }));
    else g.append(svg("circle", { r, class: "shape" }));
    if (n.size !== "small" && n.id !== "start") {
      const t = svg("text", { y: r + 14, class: "label" });
      t.textContent = n.name;
      g.append(t);
    }
    g.addEventListener("click", () => select(n.id));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        select(n.id);
      }
    });
    g.addEventListener("pointerenter", (e) => showTip(n, e));
    g.addEventListener("pointermove", (e) => moveTip(e));
    g.addEventListener("pointerleave", () => ($("tree-tip").hidden = true));
    nodeEls.set(n.id, g);
    root.append(g);
  }
  bindPanZoom();
  centre();
}

function applyView() {
  $("tree-nodes").setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.zoom})`);
}

/** Fit the whole tree in the window. */
function centre() {
  const box = $("tree-canvas").getBoundingClientRect();
  const xs = PASSIVE_NODES.map((n) => n.x * SCALE);
  const ys = PASSIVE_NODES.map((n) => n.y * SCALE);
  const pad = 50;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  view.zoom = Math.max(0.4, Math.min(1.2, box.width / w, box.height / h));
  view.x = box.width / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * view.zoom;
  view.y = box.height / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * view.zoom;
  applyView();
}

function bindPanZoom() {
  const el = $("tree-canvas");
  let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
  el.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) el.setPointerCapture(e.pointerId); // only once it is a drag, so clicks still reach nodes
    drag.moved = true;
    view.x = drag.vx + dx;
    view.y = drag.vy + dy;
    applyView();
  });
  const stop = () => (drag = null);
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointercancel", stop);
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const mx = e.clientX - box.left;
      const my = e.clientY - box.top;
      const z = Math.max(0.4, Math.min(2.2, view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      view.x = mx - ((mx - view.x) / view.zoom) * z;
      view.y = my - ((my - view.y) / view.zoom) * z;
      view.zoom = z;
      applyView();
    },
    { passive: false },
  );
  $("tree-centre").onclick = () => centre();
}

// ---- info -------------------------------------------------------------------

function linesOf(n: PassiveNode): string[] {
  const out = describeMods(n.mods);
  if (n.desc) out.push(n.desc);
  if (n.size === "root") out.push(n.job === "wanderer" ? "ทุกคนเริ่มจากตรงนี้ได้" : "สไควร์เริ่มจากตรงนี้ได้ด้วย");
  return out;
}

function showTip(n: PassiveNode, e: PointerEvent) {
  const tip = $("tree-tip");
  tip.replaceChildren();
  const b = document.createElement("b");
  b.textContent = n.name;
  tip.append(b, ...linesOf(n).map(line));
  tip.hidden = false;
  moveTip(e);
}

function moveTip(e: PointerEvent) {
  const tip = $("tree-tip");
  const box = $("tree-canvas").getBoundingClientRect();
  const x = Math.min(e.clientX - box.left + 16, box.width - tip.offsetWidth - 6);
  const y = Math.min(e.clientY - box.top + 16, box.height - tip.offsetHeight - 6);
  tip.style.left = `${Math.max(0, x)}px`;
  tip.style.top = `${Math.max(0, y)}px`;
}

function line(text: string) {
  const d = document.createElement("div");
  d.textContent = text;
  return d;
}

function select(id: string) {
  selected = id;
  refresh();
}

function refresh() {
  const left = pointsLeft();
  const badge = $("tree-badge");
  badge.hidden = !state.ready || left <= 0;
  badge.textContent = String(left);
  $("hud-gold").textContent = state.ready ? `${state.gold.toLocaleString("th-TH")} เหรียญ` : "";
  if ($("tree").hidden || !built) return;

  const roots = new Set(rootsFor(state.job));
  const on = (id: string) => state.nodes.has(id) || roots.has(id);
  for (const n of PASSIVE_NODES) {
    const g = nodeEls.get(n.id)!;
    const open = canReach(n.id, state.nodes, state.job);
    g.classList.toggle("on", on(n.id));
    g.classList.toggle("open", open && left > 0);
    g.classList.toggle("sel", selected === n.id);
  }
  for (const { a, b, el } of edgeEls) el.classList.toggle("on", on(a) && on(b));

  $("tree-points").textContent = `แต้มเหลือ ${Math.max(0, left)} / ${passivePointsEarned(state.level)}`;
  $("tree-gold").textContent = `${state.gold.toLocaleString("th-TH")} เหรียญ`;
  renderSelected(left);

  const total = describeMods(passiveMods(state.nodes));
  $("tree-total").replaceChildren(...(total.length ? total : ["ยังไม่ได้เรียนโหนด"]).map(line));
  $("tree-help").replaceChildren(...ATTRIBUTE_HELP.map(line));
}

function renderSelected(left: number) {
  const box = $("tree-selected");
  box.replaceChildren();
  const n = selected ? PASSIVES.get(selected) : undefined;
  if (!n) {
    box.append(line("คลิกโหนดเพื่อดูรายละเอียด"));
    return;
  }
  const h = document.createElement("h3");
  h.textContent = n.name;
  const kind = line(`${SIZE_NAME[n.size]} · ${AREA[n.area].name}`);
  kind.className = "kind";
  box.append(h, kind, ...linesOf(n).map(line));
  if (n.size === "root") return;

  const btn = document.createElement("button");
  const why = document.createElement("div");
  why.className = "why";
  if (state.nodes.has(n.id)) {
    const cost = refundCost(state.level);
    btn.textContent = `ล้างโหนดนี้ (${cost} เหรียญ)`;
    btn.className = "refund";
    if (!canRefund(n.id, state.nodes, state.job)) why.textContent = "เป็นทางผ่านของโหนดอื่น ล้างโหนดปลายทางก่อน";
    else if (state.gold < cost) why.textContent = "เหรียญไม่พอ";
    btn.onclick = () => actions.refund(n.id);
  } else {
    btn.textContent = "เรียนโหนดนี้ (1 แต้ม)";
    if (!canReach(n.id, state.nodes, state.job)) why.textContent = "ต้องเรียนโหนดที่ติดกันก่อน";
    else if (left <= 0) why.textContent = "ไม่มีแต้มเหลือ เลเวลอัปเพื่อรับแต้ม";
    btn.onclick = () => actions.learn(n.id);
  }
  btn.disabled = why.textContent !== "";
  box.append(btn, why);
}
