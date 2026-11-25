import { Client, Room, ServerError } from "@colyseus/core";
import {
  CHAT_COOLDOWN_MS,
  CHAT_MAX,
  MAX_PATH_STEPS,
  MAX_PLAYERS_PER_ROOM,
  TICK_RATE,
  TUNIC_COLORS,
  WALK_SPEED,
} from "../../../shared/constants";
import { buildBrindleVillage, GameMap, isWalkable } from "../../../shared/map";
import { cleanChat, cleanName } from "../../../shared/names";
import { findPath, Point } from "../../../shared/pathfinding";
import { ChatLine, JoinOptions, Msg } from "../../../shared/protocol";
import { Player, WorldState } from "./schema";

/** Server-only data kept per player (not sent to clients). */
interface Walker {
  path: Point[];
  lastChatAt: number;
}

/** Turns a step on the tile grid into one of 8 facings on screen. */
export function facingFor(dx: number, dy: number): number {
  const sx = dx - dy;
  const sy = (dx + dy) / 2;
  if (sx === 0 && sy === 0) return 0;
  // angle 0 = screen down, increasing clockwise (towards screen left).
  const angle = Math.atan2(-sx, sy);
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  map!: GameMap;
  walkers = new Map<string, Walker>();

  onCreate() {
    this.map = buildBrindleVillage();
    this.setState(new WorldState());
    this.state.mapName = this.map.name;
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / TICK_RATE);
    this.setPatchRate(1000 / TICK_RATE);

    this.onMessage(Msg.Move, (client, msg) => this.handleMove(client, msg));
    this.onMessage(Msg.Chat, (client, msg) => this.handleChat(client, msg));
  }

  onAuth(_client: Client, options: Partial<JoinOptions>) {
    const name = cleanName(options?.name);
    if (!name) throw new ServerError(400, "ชื่อต้องยาว 2–16 ตัว ใช้ตัวอักษร ตัวเลข ช่องว่าง _ หรือ - ได้");
    const taken = [...this.state.players.values()].some(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) throw new ServerError(409, "มีคนใช้ชื่อนี้อยู่ในโลกแล้ว");
    return { name };
  }

  onJoin(client: Client, options: Partial<JoinOptions>, auth: { name: string }) {
    const p = new Player();
    p.name = auth.name;
    p.color = (TUNIC_COLORS as readonly number[]).includes(Number(options?.color))
      ? Number(options.color)
      : TUNIC_COLORS[Math.floor(Math.random() * TUNIC_COLORS.length)];
    const spot = this.findSpawn();
    p.x = spot.x;
    p.y = spot.y;
    p.facing = Math.floor(Math.random() * 8);
    this.state.players.set(client.sessionId, p);
    this.walkers.set(client.sessionId, { path: [], lastChatAt: 0 });
    this.broadcastSystem(`${p.name} เดินทางมาถึง${this.map.name === "Brindle Village" ? "หมู่บ้านบรินเดิล" : this.map.name}`);
    console.log(`[world] join ${p.name} (${client.sessionId}), online ${this.clients.length}`);
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.walkers.delete(client.sessionId);
    if (p) {
      this.broadcastSystem(`${p.name} ออกจากเกมแล้ว`);
      console.log(`[world] leave ${p.name}, online ${this.clients.length}`);
    }
  }

  private findSpawn(): Point {
    const { spawn } = this.map;
    for (let tries = 0; tries < 50; tries++) {
      const x = spawn.x + Math.floor(Math.random() * 5) - 2;
      const y = spawn.y + Math.floor(Math.random() * 5) - 2;
      if (isWalkable(this.map, x, y)) return { x, y };
    }
    return { ...spawn };
  }

  private handleMove(client: Client, msg: unknown) {
    const p = this.state.players.get(client.sessionId);
    const w = this.walkers.get(client.sessionId);
    if (!p || !w || typeof msg !== "object" || msg === null) return;
    const gx = Math.floor(Number((msg as Point).x));
    const gy = Math.floor(Number((msg as Point).y));
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;

    // Plan from the tile we are standing on, or the tile we are stepping into.
    const from: Point = w.path.length ? w.path[0] : { x: Math.round(p.x), y: Math.round(p.y) };
    const rest = findPath(this.map, from, { x: gx, y: gy }, MAX_PATH_STEPS);
    if (!rest) return; // unreachable or blocked: ignore the click
    w.path = w.path.length ? [w.path[0], ...rest] : rest;
  }

  private handleChat(client: Client, msg: unknown) {
    const p = this.state.players.get(client.sessionId);
    const w = this.walkers.get(client.sessionId);
    if (!p || !w) return;
    const text = cleanChat((msg as { text?: unknown })?.text, CHAT_MAX);
    if (!text) return;
    const now = Date.now();
    if (now - w.lastChatAt < CHAT_COOLDOWN_MS) {
      client.send(Msg.Notice, { text: "พิมพ์เร็วไปนิด รอสักครู่นะ" });
      return;
    }
    w.lastChatAt = now;
    const line: ChatLine = { from: client.sessionId, name: p.name, text };
    this.broadcast(Msg.ChatLine, line);
  }

  private broadcastSystem(text: string) {
    const line: ChatLine = { from: "", name: "", text, system: true };
    this.broadcast(Msg.ChatLine, line);
  }

  /** Moves every walking player along their path. */
  tick(dtMs: number) {
    const dt = Math.min(dtMs, 250) / 1000;
    this.state.players.forEach((p, id) => {
      const w = this.walkers.get(id);
      if (!w) return;
      let budget = WALK_SPEED * dt;
      while (budget > 0 && w.path.length) {
        const next = w.path[0];
        const dx = next.x - p.x;
        const dy = next.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-4) p.facing = facingFor(Math.sign(Math.round(dx * 10)), Math.sign(Math.round(dy * 10)));
        if (dist <= budget) {
          p.x = next.x;
          p.y = next.y;
          budget -= dist;
          w.path.shift();
        } else {
          p.x += (dx / dist) * budget;
          p.y += (dy / dist) * budget;
          budget = 0;
        }
      }
      const moving = w.path.length > 0;
      if (p.moving !== moving) p.moving = moving;
    });
  }
}
