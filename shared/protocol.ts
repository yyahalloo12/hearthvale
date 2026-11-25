/** Message names and payloads exchanged between client and server. */

export const Msg = {
  /** client -> server: walk to a tile */
  Move: "move",
  /** client -> server: say something in chat */
  Chat: "chat",
  /** server -> clients: a chat line */
  ChatLine: "chat_line",
  /** server -> client: a system notice (only for that client) */
  Notice: "notice",
} as const;

export interface JoinOptions {
  name: string;
  color: number;
}

export interface MoveRequest {
  x: number;
  y: number;
}

export interface ChatRequest {
  text: string;
}

export interface ChatLine {
  /** session id of the speaker, empty for system lines */
  from: string;
  name: string;
  text: string;
  system?: boolean;
}

/** Eight facing directions, clockwise from "down" on screen. */
export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
