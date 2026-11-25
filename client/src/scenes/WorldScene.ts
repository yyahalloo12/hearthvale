import { getStateCallbacks, Room } from "colyseus.js";
import Phaser from "phaser";
import { TILE_H } from "../../../shared/constants";
import { buildBrindleVillage, GameMap, isHouseAnchor, isWalkable, Prop } from "../../../shared/map";
import { ChatLine, Msg } from "../../../shared/protocol";
import { addChatLine } from "../chat";
import { toScreen, toTile } from "../iso";
import { PlayerView } from "../PlayerView";
import { groundKey, makeTextures } from "../textures";

const PROP_TEXTURE: Partial<Record<Prop, string>> = {
  [Prop.Tree]: "p-tree",
  [Prop.Well]: "p-well",
  [Prop.Fence]: "p-fence",
  [Prop.Rock]: "p-rock",
  [Prop.Bush]: "p-bush",
};

export class WorldScene extends Phaser.Scene {
  private room!: Room;
  private map!: GameMap;
  private views = new Map<string, PlayerView>();
  private marker!: Phaser.GameObjects.Image;
  private dragStart?: { x: number; y: number; scrollX: number; scrollY: number };

  constructor() {
    super("world");
  }

  init(data: { room: Room }) {
    this.room = data.room;
  }

  create() {
    makeTextures(this);
    this.map = buildBrindleVillage();
    this.drawMap();

    this.marker = this.add.image(0, 0, "click-marker").setVisible(false).setDepth(-1);
    this.cameras.main.setBackgroundColor("#2c5a34");
    this.cameras.main.setRoundPixels(true);

    this.bindRoom();
    this.bindInput();
  }

  private drawMap() {
    const { map } = this;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const p = toScreen(x, y);
        this.add.image(p.x, p.y, groundKey(map.tiles[y][x], x, y)).setDepth(-10000);
        const prop = map.props[y][x];
        if (prop === Prop.House) {
          if (isHouseAnchor(map, x, y)) {
            // bottom vertex of the 2x2 footprint
            const b = toScreen(x + 1.5, y + 1.5);
            this.add.image(b.x, b.y, "p-house").setOrigin(0.5, 1).setDepth(b.y - TILE_H / 2);
          }
          continue;
        }
        const key = PROP_TEXTURE[prop];
        if (key) {
          this.add
            .image(p.x, p.y + TILE_H / 2 - 4, key)
            .setOrigin(0.5, 1)
            .setDepth(p.y);
        }
      }
    }
  }

  private bindRoom() {
    const $ = getStateCallbacks(this.room);
    const state = this.room.state as any;

    $(state).players.onAdd((player: any, id: string) => {
      const view = new PlayerView(this, player.name, player.color, player.x, player.y, id === this.room.sessionId);
      view.setFacing(player.facing);
      this.views.set(id, view);
      if (id === this.room.sessionId) {
        this.cameras.main.startFollow(view.root, true, 0.15, 0.15);
      }
      $(player).onChange(() => {
        view.targetX = player.x;
        view.targetY = player.y;
        view.moving = player.moving;
        view.setFacing(player.facing);
        if (id === this.room.sessionId && !player.moving) this.marker.setVisible(false);
      });
      this.updateOnline();
    });

    $(state).players.onRemove((_player: any, id: string) => {
      this.views.get(id)?.destroy();
      this.views.delete(id);
      this.updateOnline();
    });

    this.room.onMessage(Msg.ChatLine, (line: ChatLine) => {
      addChatLine(line);
      if (line.from) this.views.get(line.from)?.say(line.text);
    });
    this.room.onMessage(Msg.Notice, (n: { text: string }) => addChatLine({ from: "", name: "", text: n.text }, "notice"));

    this.room.onLeave((code) => {
      if (code !== 1000) addChatLine({ from: "", name: "", text: "หลุดการเชื่อมต่อกับเซิร์ฟเวอร์ ลองรีเฟรชหน้านี้" }, "notice");
    });
  }

  private updateOnline() {
    const el = document.getElementById("online");
    if (el) el.textContent = `ออนไลน์ ${this.views.size} คน`;
  }

  private bindInput() {
    // Left click: walk. Right drag: look around (camera snaps back when you walk).
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        const cam = this.cameras.main;
        cam.stopFollow();
        this.dragStart = { x: pointer.x, y: pointer.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
        return;
      }
      const t = toTile(pointer.worldX, pointer.worldY);
      if (!isWalkable(this.map, t.x, t.y)) return;
      this.room.send(Msg.Move, { x: t.x, y: t.y });
      const p = toScreen(t.x, t.y);
      this.marker.setPosition(p.x, p.y).setVisible(true).setAlpha(1);
      const me = this.views.get(this.room.sessionId);
      if (me) this.cameras.main.startFollow(me.root, true, 0.15, 0.15);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart || !pointer.rightButtonDown()) return;
      const cam = this.cameras.main;
      cam.scrollX = this.dragStart.scrollX - (pointer.x - this.dragStart.x);
      cam.scrollY = this.dragStart.scrollY - (pointer.y - this.dragStart.y);
    });
    this.input.on("pointerup", () => (this.dragStart = undefined));
  }

  update(_time: number, delta: number) {
    for (const v of this.views.values()) v.update(delta);
    if (this.marker.visible) this.marker.setAlpha(0.6 + Math.sin(_time / 120) * 0.4);
  }
}
