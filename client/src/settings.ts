/** Player settings, kept in this browser (key: hv-settings). */

export interface Settings {
  numbers: boolean;
  monsterNames: boolean;
  night: boolean;
  mist: boolean;
  shake: boolean;
  /** pixels per tile on the minimap */
  mmZoom: number;
}

const DEFAULTS: Settings = { numbers: true, monsterNames: true, night: true, mist: true, shake: true, mmZoom: 2.6 };
const LABELS: [keyof Settings, string, string][] = [
  ["numbers", "ตัวเลขดาเมจและฮีล", "ตัวเลขลอยขึ้นเวลาตีหรือรักษา"],
  ["monsterNames", "ชื่อมอนสเตอร์", "ป้ายชื่อและเลเวลบนหัวมอนสเตอร์"],
  ["night", "ความมืดตอนกลางคืน", "ปิดแล้วฉากสว่างตลอด (โบนัสกลางคืนยังมีอยู่)"],
  ["mist", "หมอกในป่ามอสเฟน", "หมอกจางๆ ที่ลอยบนจอ"],
  ["shake", "จอสั่น", "จอสั่นเวลาพื้นถล่มหรือประตูเปิด"],
];

let current: Settings = load();
const listeners = new Set<(s: Settings) => void>();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("hv-settings") ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setting<K extends keyof Settings>(k: K): Settings[K] {
  return current[k];
}

export function setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
  current = { ...current, [k]: v };
  try {
    localStorage.setItem("hv-settings", JSON.stringify(current));
  } catch {
    /* private mode: only for this visit */
  }
  for (const f of listeners) f(current);
}

export function onSettings(f: (s: Settings) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;

let started = false;
export function initSettings() {
  if (started) return;
  started = true;
  $("settings-open").hidden = false;
  $("settings-open").onclick = () => toggleSettings();
  $("settings-close").onclick = () => toggleSettings(false);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape") toggleSettings(false);
  });
  render();
}

export function toggleSettings(open = $("settings").hidden) {
  $("settings").hidden = !open;
  if (open) render();
}

function render() {
  const box = $("settings-list");
  box.replaceChildren(
    ...LABELS.map(([k, name, hint]) => {
      const row = document.createElement("label");
      row.className = "srow";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!current[k];
      input.onchange = () => setSetting(k, input.checked as never);
      const text = document.createElement("div");
      text.append(Object.assign(document.createElement("b"), { textContent: name }), Object.assign(document.createElement("small"), { textContent: hint }));
      row.append(input, text);
      return row;
    }),
  );
  const keys = document.createElement("div");
  keys.className = "keys";
  keys.innerHTML = "";
  for (const [k, what] of [
    ["คลิกซ้าย", "เดิน / ตี / เก็บของ"],
    ["คลิกขวาลาก", "เลื่อนกล้อง"],
    ["1–7", "สกิล"],
    ["I", "กระเป๋า"],
    ["C", "ตัวละคร"],
    ["P", "ต้นไม้พาสซีฟ"],
    ["O", "ปาร์ตี้"],
    ["M", "แผนที่โลก"],
    ["Enter", "แชท (/p ปาร์ตี้)"],
    ["Esc", "ปิดหน้าต่าง"],
  ]) {
    const r = document.createElement("div");
    r.append(Object.assign(document.createElement("kbd"), { textContent: k }), document.createTextNode(` ${what}`));
    keys.append(r);
  }
  box.append(Object.assign(document.createElement("h3"), { textContent: "ปุ่มลัด" }), keys);
}
