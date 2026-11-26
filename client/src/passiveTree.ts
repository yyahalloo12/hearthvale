import {
  ATTRIBUTE_HELP,
  canReach,
  canRefund,
  describeMods,
  Mods,
  NumMod,
  PASSIVE_EDGES,
  PASSIVE_NODES,
  PassiveNode,
  passiveMods,
  passivePointsEarned,
  PASSIVES,
  refundCost,
  pointsLeftFor,
  rootsFor,
  SKILL_MODS,
  SUB_POINTS,
} from "../../shared/passives";
import { isMainJob, JOB_NAMES, jobId } from "../../shared/stats";

/**
 * The passive tree window (key P). Draws the whole tree as SVG: drag to move,
 * wheel or +/- to zoom, search and filters to find nodes, and a click on a
 * far node plans the shortest way there, learned with one more click.
 */

const NS = "http://www.w3.org/2000/svg";
const $ = <T extends Element = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;

const SCALE = 40; // pixels per unit of the JSON at zoom 1
const RADIUS = { small: 10, notable: 17, keystone: 22, root: 15 } as const;
const SIZE_NAME = { small: "โหนดเล็ก", notable: "โหนดเด่น", keystone: "โหนดหลัก", root: "จุดเริ่ม" } as const;
const AREA = {
  center: { name: "สายผสม", color: "#c9a227" },
  end: { name: "ความอึด", color: "#7d8f69" },
  str: { name: "กำลัง", color: "#d8573f" },
  agi: { name: "ความคล่อง", color: "#3fae5a" },
  int: { name: "ปัญญา", color: "#4a8fe0" },
  fai: { name: "ศรัทธา", color: "#d99ae6" },
} as const;

/** A picture for a notable or keystone, from its main bonus. */
const GLYPH: Partial<Record<NumMod, string>> = {
  extraProjectiles: "🏹", aoePct: "◎", chainJumps: "⚡", stunPct: "💫", durationPct: "⏳", healPct: "✚", manaCostPct: "💧", mpPct: "💧",
  meleeSplash: "⚔", multiStrike: "✦", critDmgPct: "☠", critChance: "🎯", hpPct: "❤", defPct: "🛡", dmgReduce: "🛡", regenPct: "♥",
  atkPct: "⚔", skillDmgPct: "✷", attackSpeedPct: "»", dodge: "≈", moveSpeedPct: "»", lifesteal: "🩸", lowHpDmgPct: "🔥", cdrPct: "⟳",
  str: "💪", agi: "🍃", int: "📘", fai: "☀",
};

const FILTERS: { id: string; name: string; test: (n: PassiveNode) => boolean }[] = [
  { id: "all", name: "ทั้งหมด", test: () => true },
  { id: "atk", name: "โจมตี", test: (n) => has(n, ["atkPct", "critChance", "critDmgPct", "attackSpeedPct", "skillDmgPct", "lowHpDmgPct", "str", "agi", "int"]) },
  { id: "def", name: "ป้องกัน", test: (n) => has(n, ["hpPct", "defPct", "dmgReduce", "regenPct", "dodge", "lifesteal", "fai"]) },
  { id: "skill", name: "เปลี่ยนสกิล", test: (n) => Object.keys(n.mods).some((k) => SKILL_MODS.has(k as NumMod)) },
  { id: "big", name: "โหนดเด่น/หลัก", test: (n) => n.size === "notable" || n.size === "keystone" },
];
const has = (n: PassiveNode, keys: NumMod[]) => keys.some((k) => (n.mods[k] ?? 0) !== 0);

export interface TreeActions {
  learn(id: string): void;
  refund(id: string): void;
}

const state = { level: 1, job: "wanderer", gold: 0, nodes: new Set<string>(), ready: false };
const view = { x: 0, y: 0, zoom: 1 };
let actions: TreeActions;
let selected: string | null = null;
let built = false;
let filter = "all";
let search = "";
/** the planned way to the selected node (not yet learned) */
let plan: string[] = [];

export function initPassiveTree(a: TreeActions) {
  const first = !actions;
  actions = a;
  if (!first) return;
  $("tree-open").hidden = false;
  $("tree-open").onclick = () => toggleTree();
  $("tree-close").onclick = () => toggleTree(false);
  window.addEventListener("keydown", (e) => {
    if (/^(INPUT|SELECT)$/.test(document.activeElement?.tagName ?? "") || e.ctrlKey || e.altKey || e.metaKey) return;
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

/** Free points in the big tree (the second job's own tree counts apart). */
function pointsLeft() {
  return pointsLeftFor("start", state.nodes, state.level, state.job);
}
function subLeft() {
  return isMainJob(state.job) || state.job === "wanderer" ? 0 : pointsLeftFor(`sj_${state.job}`, state.nodes, state.level, state.job);
}
function leftFor(id: string) {
  return pointsLeftFor(id, state.nodes, state.level, state.job);
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
const neighbours = new Map<string, string[]>(PASSIVE_NODES.map((n) => [n.id, []]));
for (const [a, b] of PASSIVE_EDGES) {
  neighbours.get(a)!.push(b);
  neighbours.get(b)!.push(a);
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function mainMod(n: PassiveNode): NumMod | undefined {
  const entries = Object.entries(n.mods) as [NumMod, number][];
  const skill = entries.find(([k, v]) => SKILL_MODS.has(k) && v > 0);
  return (skill ?? entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0])?.[0];
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
    const skillish = Object.keys(n.mods).some((k) => SKILL_MODS.has(k as NumMod));
    const g = svg("g", {
      class: `node ${n.size}${skillish ? " skillmod" : ""}`,
      transform: `translate(${n.x * SCALE} ${n.y * SCALE})`,
      tabindex: 0,
      role: "button",
      "aria-label": n.name,
    });
    g.style.setProperty("--c", AREA[n.area].color);
    const r = RADIUS[n.size];
    // a bigger, invisible circle so small nodes are easy to hit
    g.append(svg("circle", { r: r + 6, class: "hit" }));
    if (n.size === "keystone") g.append(svg("rect", { x: -r * 0.8, y: -r * 0.8, width: r * 1.6, height: r * 1.6, transform: "rotate(45)", class: "shape" }));
    else g.append(svg("circle", { r, class: "shape" }));
    const glyph = n.size === "root" ? "★" : GLYPH[mainMod(n) as NumMod];
    if (glyph && n.size !== "small") {
      const t = svg("text", { y: 5, class: "glyph" });
      t.textContent = glyph;
      g.append(t);
    }
    if (n.size !== "small" && n.id !== "start") {
      const t = svg("text", { y: r + 14, class: "label" });
      t.textContent = n.name;
      g.append(t);
    }
    g.addEventListener("click", () => select(n.id));
    g.addEventListener("dblclick", () => quickLearn(n.id));
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
  // filters and search
  $("tree-filters").replaceChildren(
    ...FILTERS.map((f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = f.name;
      b.dataset.id = f.id;
      b.onclick = () => {
        filter = f.id;
        refresh();
      };
      return b;
    }),
  );
  const input = $<HTMLInputElement>("tree-search");
  input.oninput = () => {
    search = input.value.trim().toLowerCase();
    refresh();
  };
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      // jump to the first match
      const hit = PASSIVE_NODES.find((n) => matches(n));
      if (hit) {
        select(hit.id);
        focusOn(hit);
      }
    }
  };
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
  const pad = 40;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  view.zoom = Math.max(0.25, Math.min(1.2, box.width / w, box.height / h));
  view.x = box.width / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * view.zoom;
  view.y = box.height / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * view.zoom;
  applyView();
}

function focusOn(n: PassiveNode) {
  const box = $("tree-canvas").getBoundingClientRect();
  view.zoom = Math.max(view.zoom, 0.9);
  view.x = box.width / 2 - n.x * SCALE * view.zoom;
  view.y = box.height / 2 - n.y * SCALE * view.zoom;
  applyView();
}

function zoomBy(k: number, mx?: number, my?: number) {
  const box = $("tree-canvas").getBoundingClientRect();
  const x = mx ?? box.width / 2;
  const y = my ?? box.height / 2;
  const z = Math.max(0.25, Math.min(2.4, view.zoom * k));
  view.x = x - ((x - view.x) / view.zoom) * z;
  view.y = y - ((y - view.y) / view.zoom) * z;
  view.zoom = z;
  applyView();
}

function bindPanZoom() {
  const el = $("tree-canvas");
  let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
  el.addEventListener("pointerdown", (e) => {
    if ((e.target as Element).closest("#tree-filters")) return;
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
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - box.left, e.clientY - box.top);
    },
    { passive: false },
  );
  $("tree-centre").onclick = () => centre();
  $("tree-zoom-in").onclick = () => zoomBy(1.25);
  $("tree-zoom-out").onclick = () => zoomBy(1 / 1.25);
}

// ---- planning ------------------------------------------------------------------

/** Shortest way from what we have to this node, through nodes not learned yet. */
function pathTo(id: string): string[] {
  if (state.nodes.has(id) || PASSIVES.get(id)?.size === "root") return [];
  const roots = rootsFor(state.job);
  const have = new Set([...roots, ...state.nodes]);
  const prev = new Map<string, string | null>();
  const queue: string[] = [];
  for (const h of have) for (const n of neighbours.get(h) ?? []) if (!have.has(n) && !prev.has(n) && PASSIVES.get(n)!.size !== "root") {
    prev.set(n, null);
    queue.push(n);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === id) break;
    for (const n of neighbours.get(cur) ?? []) {
      if (have.has(n) || prev.has(n) || PASSIVES.get(n)!.size === "root") continue;
      prev.set(n, cur);
      queue.push(n);
    }
  }
  if (!prev.has(id)) return [];
  const out: string[] = [];
  for (let c: string | null = id; c; c = prev.get(c) ?? null) out.unshift(c);
  return out;
}

/** Double click: learn this node, or the whole way to it. */
function quickLearn(id: string) {
  select(id);
  if (plan.length && plan.length <= leftFor(id)) learnPath();
}

function learnPath() {
  const steps = [...plan];
  steps.forEach((id, i) => setTimeout(() => actions.learn(id), i * 60));
}

// ---- info -------------------------------------------------------------------

function linesOf(n: PassiveNode): string[] {
  const out = describeMods(n.mods);
  if (n.desc) out.push(n.desc);
  if (n.size === "root") out.push(n.job === "wanderer" ? "ทุกคนเริ่มจากตรงนี้ได้" : n.sub ? `ต้นไม้ย่อยของ${JOB_NAMES[jobId(n.job)]} ใช้แต้มขั้นสองแยก ${SUB_POINTS} แต้ม` : `${JOB_NAMES[jobId(n.job)]}เริ่มจากตรงนี้ได้ด้วย`);
  else if (n.sub) out.push(`ต้นไม้ย่อยของ${JOB_NAMES[jobId(n.sub)]}`);
  return out;
}

function matches(n: PassiveNode) {
  if (!search) return false;
  return n.name.toLowerCase().includes(search) || linesOf(n).some((l) => l.toLowerCase().includes(search));
}

function showTip(n: PassiveNode, e: PointerEvent) {
  const tip = $("tree-tip");
  tip.replaceChildren();
  const b = document.createElement("b");
  b.textContent = n.name;
  const kind = line(`${SIZE_NAME[n.size]} · ${AREA[n.area].name}`);
  kind.className = "kind";
  tip.append(b, kind, ...linesOf(n).map(line));
  const way = pathTo(n.id);
  if (way.length > 1) tip.append(line(`ต้องใช้ ${way.length} แต้มจึงถึง (ดับเบิลคลิกเพื่อเรียนทั้งเส้น)`));
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
  plan = pathTo(id);
  refresh();
}

function refresh() {
  const left = pointsLeft();
  const badge = $("tree-badge");
  badge.hidden = !state.ready || left + subLeft() <= 0;
  badge.textContent = String(left + subLeft());
  $("hud-gold").textContent = state.ready ? `🪙 ${state.gold.toLocaleString("th-TH")}` : "";
  $("hud-gold").title = "เหรียญ";
  if ($("tree").hidden || !built) return;

  // learned nodes leave the plan
  plan = selected ? pathTo(selected) : [];
  const onPlan = new Set(plan);
  const roots = new Set(rootsFor(state.job));
  const on = (id: string) => state.nodes.has(id) || roots.has(id);
  const f = FILTERS.find((x) => x.id === filter)!;
  for (const n of PASSIVE_NODES) {
    const g = nodeEls.get(n.id)!;
    const open = canReach(n.id, state.nodes, state.job);
    g.classList.toggle("on", on(n.id));
    g.classList.toggle("open", open && leftFor(n.id) > 0);
    g.classList.toggle("othersub", !!n.sub && n.sub !== state.job);
    g.classList.toggle("sel", selected === n.id);
    g.classList.toggle("path", onPlan.has(n.id) && selected !== n.id);
    g.classList.toggle("match", matches(n));
    g.classList.toggle("dim", (search !== "" && !matches(n)) || (filter !== "all" && !f.test(n) && n.size !== "root"));
  }
  for (const { a, b, el } of edgeEls) {
    el.classList.toggle("on", on(a) && on(b));
    el.classList.toggle("path", (onPlan.has(a) || on(a)) && (onPlan.has(b) || on(b)) && (onPlan.has(a) || onPlan.has(b)));
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>("#tree-filters button")) b.setAttribute("aria-pressed", String(b.dataset.id === filter));

  $("tree-points").textContent =
    `แต้มเหลือ ${Math.max(0, left)} / ${passivePointsEarned(state.level)}` + (isMainJob(state.job) || state.job === "wanderer" ? "" : ` · ขั้นสอง ${subLeft()} / ${SUB_POINTS}`);
  $("tree-gold").textContent = `${state.gold.toLocaleString("th-TH")} เหรียญ`;
  renderSelected(left);

  const mods = passiveMods(state.nodes);
  const stats = describeMods(onlyMods(mods, false));
  const skill = describeMods(onlyMods(mods, true));
  if (mods.bloodthirst) skill.push("กระหายเลือด: ไม่ฟื้นเลือดเอง ดูดเลือด 3 เท่า");
  if (mods.firststrike) skill.push("นัดแรกเด็ดขาด: ตีแรกใส่เป้าใหม่คริติคอลเสมอ");
  $("tree-total").replaceChildren(...(stats.length ? stats : ["ยังไม่ได้เรียนโหนด"]).map(line));
  $("tree-skill").replaceChildren(...(skill.length ? skill : ["ยังไม่มี ลองตัวกรอง \"เปลี่ยนสกิล\""]).map(line));
  $("tree-help").replaceChildren(...ATTRIBUTE_HELP.map(line));
}

function onlyMods(m: Mods, skill: boolean): Partial<Mods> {
  const out: Partial<Record<NumMod, number>> = {};
  for (const [k, v] of Object.entries(m)) if (typeof v === "number" && SKILL_MODS.has(k as NumMod) === skill) out[k as NumMod] = v;
  // attributes are already turned into percents in the totals
  if (!skill) for (const k of ["str", "agi", "int", "fai"] as const) delete out[k];
  return out;
}

function renderSelected(left: number) {
  const box = $("tree-selected");
  box.replaceChildren();
  const n = selected ? PASSIVES.get(selected) : undefined;
  if (!n) {
    box.append(line("คลิกโหนดเพื่อดูรายละเอียด ดับเบิลคลิกเพื่อเรียนทั้งเส้นทาง"));
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
  } else if (n.sub && n.sub !== state.job) {
    btn.textContent = "เรียนโหนดนี้";
    why.textContent = `ต้นไม้ย่อยของ${JOB_NAMES[jobId(n.sub)]} (เลือกอาชีพขั้นสองนี้ที่ Lv 30)`;
  } else if (plan.length > 1) {
    const have = leftFor(n.id);
    btn.textContent = `เรียนทั้งเส้นทาง (${plan.length} แต้ม)`;
    if (plan.length > have) why.textContent = `แต้มไม่พอ ต้องใช้ ${plan.length} มีอยู่ ${Math.max(0, have)}`;
    btn.onclick = () => learnPath();
    const what = describeMods(passiveMods(plan));
    if (what.length) box.append(line(`ทั้งเส้นทางได้: ${what.slice(0, 4).join(", ")}${what.length > 4 ? " ..." : ""}`));
  } else {
    btn.textContent = "เรียนโหนดนี้ (1 แต้ม)";
    if (!canReach(n.id, state.nodes, state.job)) why.textContent = "ยังไปไม่ถึง";
    else if (leftFor(n.id) <= 0) why.textContent = n.sub ? "แต้มขั้นสองหมดแล้ว (8 แต้ม)" : "ไม่มีแต้มเหลือ เลเวลอัปเพื่อรับแต้ม";
    btn.onclick = () => actions.learn(n.id);
  }
  btn.disabled = why.textContent !== "";
  box.append(btn, why);
}
