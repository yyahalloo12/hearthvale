import type { Room } from "colyseus.js";
import Phaser from "phaser";
import { CHAT_MAX, PASSWORD_MIN, TUNIC_COLORS } from "../../shared/constants";
import { cleanName } from "../../shared/names";
import { JoinOptions, Msg } from "../../shared/protocol";
import { client } from "./net";
import { WorldScene } from "./scenes/WorldScene";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- Login screen -------------------------------------------------------
let chosenColor: number = TUNIC_COLORS[4];
const colorBox = $("colors");
for (const c of TUNIC_COLORS) {
  const b = document.createElement("button");
  b.type = "button";
  b.style.background = `#${c.toString(16).padStart(6, "0")}`;
  b.setAttribute("aria-label", "สีเสื้อ");
  b.setAttribute("aria-pressed", String(c === chosenColor));
  b.onclick = () => {
    chosenColor = c;
    colorBox.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  };
  colorBox.append(b);
}

const nameInput = $<HTMLInputElement>("name");
try {
  nameInput.value = localStorage.getItem("hv-name") ?? "";
} catch {
  /* storage may be blocked */
}
nameInput.focus();
if (nameInput.value) $("password").focus();

const passInput = $<HTMLInputElement>("password");

async function enterWorld(create: boolean) {
  const err = $("login-error");
  const enter = $<HTMLButtonElement>("enter");
  const createBtn = $<HTMLButtonElement>("create");
  const name = cleanName(nameInput.value);
  if (!name) {
    err.textContent = "ชื่อต้องยาว 2–16 ตัว ใช้ตัวอักษร ตัวเลข ช่องว่าง _ หรือ - ได้";
    return;
  }
  const password = passInput.value;
  if (password.length < PASSWORD_MIN) {
    err.textContent = `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัว`;
    return;
  }
  err.textContent = "";
  enter.disabled = createBtn.disabled = true;
  const busy = create ? createBtn : enter;
  const label = busy.textContent;
  busy.textContent = "กำลังเข้าสู่โลก...";
  try {
    const opts: JoinOptions = { name, password, create, color: chosenColor };
    const room = await client.joinOrCreate("world", opts);
    try {
      localStorage.setItem("hv-name", name);
    } catch {
      /* ignore */
    }
    startGame(room);
  } catch (ex: any) {
    const msg = ex?.message && /[\u0E00-\u0E7F]/.test(ex.message) ? ex.message : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ เปิดเซิร์ฟเวอร์อยู่หรือเปล่า?";
    err.textContent = msg;
    enter.disabled = createBtn.disabled = false;
    busy.textContent = label;
  }
}

$("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  enterWorld(false);
});
$("create").addEventListener("click", () => enterWorld(true));

// ---- In game ------------------------------------------------------------
function startGame(room: Room) {
  $("login").remove();

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#2c5a34",
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [],
    callbacks: {
      postBoot: (game) => game.scene.add("world", WorldScene, true, { room }),
    },
  });

  const chatInput = $<HTMLInputElement>("chat-input");
  chatInput.maxLength = CHAT_MAX;
  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text) room.send(Msg.Chat, { text });
    chatInput.value = "";
    chatInput.blur();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement !== chatInput) {
      e.preventDefault();
      chatInput.focus();
    } else if (e.key === "Escape") {
      chatInput.blur();
    }
  });
}
