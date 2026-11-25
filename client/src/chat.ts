import { ChatLine } from "../../shared/protocol";

const log = () => document.getElementById("chat-log")!;

/** Adds one line to the chat box (textContent only, never HTML from players). */
export function addChatLine(line: ChatLine, kind?: "notice") {
  const row = document.createElement("div");
  if (kind === "notice") {
    row.className = "notice";
    row.textContent = line.text;
  } else if (line.system) {
    row.className = "sys";
    row.textContent = line.text;
  } else {
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = `${line.name}: `;
    row.append(who, document.createTextNode(line.text));
  }
  const el = log();
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  el.append(row);
  while (el.childElementCount > 100) el.firstElementChild?.remove();
  if (atBottom) el.scrollTop = el.scrollHeight;
}
