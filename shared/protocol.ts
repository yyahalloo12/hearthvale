/** Message names and payloads exchanged between client and server. */

export const Msg = {
  /** client -> server: walk to a tile */
  Move: "move",
  /** client -> server: attack a monster {id} */
  Attack: "attack",
  /** client -> server: use a skill {skill, target?} */
  Skill: "skill",
  /** client -> server: spend a skill point {skill} */
  LearnSkill: "learn_skill",
  /** client -> server: become a Squire at level 10 */
  ChangeJob: "change_job",
  /** client -> server: get up after dying */
  Respawn: "respawn",
  /** client -> server: say something in chat */
  Chat: "chat",

  /** server -> clients: a chat line */
  ChatLine: "chat_line",
  /** server -> client: a system notice (only for that client) */
  Notice: "notice",
  /** server -> clients: someone hit someone */
  Hit: "hit",
  /** server -> clients: someone levelled up */
  LevelUp: "level_up",
  /** server -> client: EXP you gained */
  ExpGain: "exp_gain",
  /** server -> client: a skill went on cooldown */
  Cooldown: "cooldown",
} as const;

export interface JoinOptions {
  name: string;
  password: string;
  /** true = make a new character, false = log in */
  create: boolean;
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

export interface HitEvent {
  /** attacker id: a player's session id or a monster id ("m12") */
  from: string;
  to: string;
  dmg: number;
  crit?: boolean;
  skill?: string;
  killed?: boolean;
}

export interface CooldownEvent {
  skill: string;
  ms: number;
}

/** Eight facing directions, clockwise from "down" on screen. */
export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
