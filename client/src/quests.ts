import { ITEMS } from "../../shared/items";
import { emptyQuests, goalCount, goalText, MAIN_QUESTS, QuestState, QUESTS, Reward } from "../../shared/quests";
import { MONSTERS } from "../../shared/stats";

/** The quest window (key J) and the line on the board of what to do next. */

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const names = { monster: (k: string) => MONSTERS[k]?.name ?? k, item: (k: string) => ITEMS[k]?.name ?? k };

let state: QuestState = emptyQuests();
let started = false;

export function initQuests() {
  $("quest-open").hidden = false;
  if (started) return;
  started = true;
  $("quest-open").onclick = () => toggleQuests();
  $("quest-close").onclick = () => toggleQuests(false);
  window.addEventListener("keydown", (e) => {
    const el = document.activeElement as HTMLInputElement | null;
    if ((el?.tagName === "INPUT" && el.type !== "checkbox") || el?.tagName === "SELECT" || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === "KeyJ") toggleQuests();
    else if (e.code === "Escape") toggleQuests(false);
  });
}

export function setQuests(q: QuestState | undefined) {
  if (!q) return;
  state = q;
  if (!$("questwin").hidden) render();
}

/** The current story step and the first unfinished daily, for the board. */
export function questTracker(): { title: string; text: string }[] {
  const out: { title: string; text: string }[] = [];
  const main = MAIN_QUESTS[state.main];
  if (main) out.push({ title: `📜 ${main.name}`, text: goalText(main.goal, state.mainProgress, names) });
  const d = state.daily.find((x) => !x.done);
  const dq = d && QUESTS.get(d.id);
  if (d && dq) out.push({ title: `🗓️ ${dq.name}`, text: goalText(dq.goal, d.progress, names) });
  return out;
}

export function toggleQuests(open = $("questwin").hidden) {
  $("questwin").hidden = !open;
  if (open) render();
}

function rewardText(r: Reward) {
  const parts: string[] = [];
  if (r.exp) parts.push(`EXP ${r.exp.toLocaleString("th-TH")}`);
  if (r.gold) parts.push(`${r.gold.toLocaleString("th-TH")} เหรียญ`);
  if (r.points) parts.push(`แต้มพาสซีฟ +${r.points}`);
  for (const it of r.items ?? []) parts.push(`${ITEMS[it.id]?.name ?? it.id} ×${it.qty}`);
  if (r.gear) parts.push(r.gear.unique === 1 ? "ของตำนาน" : `อุปกรณ์ Tier ${r.gear.tier}${r.gear.unique ? " (อาจเป็นของตำนาน)" : ""}`);
  return parts.join(" · ");
}

function bar(progress: number, total: number) {
  const b = document.createElement("div");
  b.className = "bar exp qbar";
  const f = document.createElement("div");
  f.style.width = `${Math.min(100, (progress / Math.max(1, total)) * 100)}%`;
  b.append(f);
  return b;
}

function render() {
  const main = MAIN_QUESTS[state.main];
  const box = $("quest-main");
  box.replaceChildren();
  const chapter = Object.assign(document.createElement("div"), { className: "kind", textContent: `เนื้อเรื่องหลัก · บทที่ ${Math.min(state.main + 1, MAIN_QUESTS.length)} / ${MAIN_QUESTS.length}` });
  if (!main) {
    box.append(chapter, Object.assign(document.createElement("p"), { textContent: "คุณผ่านเนื้อเรื่องทั้งหมดที่มีแล้ว เนื้อเรื่องต่อจะมาในรุ่นถัดไป" }));
  } else {
    box.append(
      chapter,
      Object.assign(document.createElement("h3"), { textContent: main.name }),
      Object.assign(document.createElement("p"), { className: "story", textContent: main.story }),
      Object.assign(document.createElement("b"), { textContent: goalText(main.goal, state.mainProgress, names) }),
      bar(state.mainProgress, goalCount(main.goal)),
      Object.assign(document.createElement("div"), { className: "reward", textContent: `รางวัล: ${rewardText(main.reward)}` }),
    );
  }
  $("quest-points").textContent = `แต้มพาสซีฟจากเควสต์: ${state.points}`;
  $("quest-daily").replaceChildren(
    ...state.daily.map((d) => {
      const q = QUESTS.get(d.id);
      const row = document.createElement("div");
      row.className = "qrow" + (d.done ? " done" : "");
      if (!q) return row;
      row.append(
        Object.assign(document.createElement("b"), { textContent: `${d.done ? "✅ " : ""}${q.name}` }),
        Object.assign(document.createElement("small"), { textContent: q.story }),
        Object.assign(document.createElement("div"), { textContent: goalText(q.goal, d.progress, names) }),
        bar(d.done ? goalCount(q.goal) : d.progress, goalCount(q.goal)),
        Object.assign(document.createElement("div"), { className: "reward", textContent: `รางวัล: ${rewardText(q.reward)}` }),
      );
      return row;
    }),
  );
}
