import type { Room } from "colyseus.js";
import Phaser from "phaser";
import { CHAT_MAX, PASSWORD_MIN, TUNIC_COLORS } from "../../shared/constants";
import { cleanName } from "../../shared/names";
import { JoinOptions, Msg, ROOM_OF, TicketOptions, TravelEvent, ZONE_ERROR } from "../../shared/protocol";
import type { ZoneId } from "../../shared/map";
import { zoneId } from "../../shared/zones";
import { addChatLine } from "./chat";
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
    let zone: ZoneId = "brindle";
    let room: Room;
    try {
      room = await client.joinOrCreate(ROOM_OF[zone], opts);
    } catch (ex: any) {
      // the character is in another map: go there
      const at = String(ex?.message ?? "").split(ZONE_ERROR)[1];
      if (!at) throw ex;
      zone = zoneId(at);
      room = await client.joinOrCreate(ROOM_OF[zone], opts);
    }
    try {
      localStorage.setItem("hv-name", name);
    } catch {
      /* ignore */
    }
    startGame(room, zone);
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
function startGame(first: Room, zone: ZoneId) {
  $("login").remove();
  let room = first;
  let n = 0;

  /** The server sent us to another map: join that room and start a fresh scene. */
  const travel = async (e: TravelEvent) => {
    const old = room;
    const opts: TicketOptions = { ticket: e.ticket };
    try {
      room = await client.joinOrCreate(ROOM_OF[e.zone], opts);
    } catch {
      addChatLine({ from: "", name: "", text: "เดินทางไม่สำเร็จ รีเฟรชหน้านี้แล้วเข้าใหม่" }, "notice");
      return;
    }
    old.leave().catch(() => {});
    game.scene.remove(`world${n}`);
    n++;
    game.scene.add(`world${n}`, WorldScene, true, { room, zone: e.zone, travel });
  };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#2c5a34",
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [],
    callbacks: {
      postBoot: (g) => g.scene.add("world0", WorldScene, true, { room, zone, travel }),
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
