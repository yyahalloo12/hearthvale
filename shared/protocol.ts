/** Message names and payloads exchanged between client and server. */
import type { Inventory, StationKind } from "./items";
import type { ZoneId } from "./map";

export const Msg = {
  /** client -> server: walk to a tile */
  Move: "move",
  /** client -> server: attack a monster {id} */
  Attack: "attack",
  /** client -> server: use a skill {skill, target?} */
  Skill: "skill",
  /** client -> server: spend a skill point {skill} */
  LearnSkill: "learn_skill",
  /** client -> server: pick a job at level 10 {job} */
  ChangeJob: "change_job",
  /** client -> server: learn a passive node {id} */
  LearnPassive: "learn_passive",
  /** client -> server: give a passive node back for coins {id} */
  RefundPassive: "refund_passive",
  /** client -> server: walk to a treasure bundle and take what fits {id} */
  LootBundle: "loot_bundle",
  /** client -> server (at the portal): go into the Hollow */
  EnterHollow: "enter_hollow",
  /** client -> server (at the board): show me the board */
  Board: "board",
  /** client -> server (at the board): offer items {uid, qty, price} */
  BoardSell: "board_sell",
  /** client -> server (at the board): buy from an offer {id, qty} */
  BoardBuy: "board_buy",
  /** client -> server (at the board): take an offer or order back {id} */
  BoardCancel: "board_cancel",
  /** client -> server (at the board): ask for items {item, qty, price} */
  OrderPlace: "order_place",
  /** client -> server (at the board): sell to somebody's order {id, uid, qty} */
  OrderFill: "order_fill",
  /** client -> server (at the board): pick something up {id} */
  Claim: "claim",
  /** client -> server: set up a stall here {title, items: [{uid, qty, price}]} */
  StallOpen: "stall_open",
  /** client -> server: pack the stall up */
  StallClose: "stall_close",
  /** client -> server: walk to a stall and look {id} */
  StallVisit: "stall_visit",
  /** client -> server (near a stall): buy {id, uid, qty} */
  StallBuy: "stall_buy",
  /** client -> server: walk to a rock, tree, anvil or chest and use it {x, y} */
  Interact: "interact",
  /** client -> server: wear an item {uid} */
  Equip: "equip",
  /** client -> server: take worn gear off {slot} */
  Unequip: "unequip",
  /** client -> server (at the smith): make an item {item, crystal} */
  Craft: "craft",
  /** client -> server (at the smith): buy a tool {item} */
  Buy: "buy",
  /** client -> server (at the smith): sell a whole stack {uid} */
  Sell: "sell",
  /** client -> server (at the chest): bag to storage {uid} */
  Deposit: "deposit",
  /** client -> server (at the chest): storage to bag {uid} */
  Withdraw: "withdraw",
  /** client -> server: the game screen is ready, send me my private data */
  Sync: "sync",
  /** client -> server: get up after dying */
  Respawn: "respawn",
  /** client -> server: say something in chat */
  Chat: "chat",
  /** client -> server: walk to a mist portal and go in {id} */
  EnterRift: "enter_rift",
  /** client -> server: party things {action: invite|accept|decline|leave|kick, name?} */
  PartyAct: "party_act",
  /** server -> client: your party now (PartyData) */
  Party: "party",
  /** server -> client: somebody asks you to join {from} */
  PartyInvite: "party_invite",

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
  /** server -> client: everything on the board, seen by you */
  BoardData: "board_data",
  /** server -> client: what a stall sells, or null when it is gone */
  StallData: "stall_data",
  /** server -> client: go to another map; join that room with the ticket */
  Travel: "travel",
  /** server -> client: you reached the anvil or the chest {kind} */
  OpenStation: "open_station",
  /** server -> client: gathering started {ms, name}, or stopped {ms: 0} */
  Gathering: "gathering",
  /** server -> client: items you picked up */
  Loot: "loot",
  /** server -> client: things only you may see (coins, passive nodes, items) */
  Private: "private",
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

/** Instead of name and password, when travelling between maps. */
export interface TicketOptions {
  ticket: string;
}

/** Room name of each map. */
export const ROOM_OF: Record<ZoneId, string> = { brindle: "world", mossfen: "mossfen", hollow: "hollow", rift: "rift" };
/** Join error text when the character is in another map: this plus the zone id. */
export const ZONE_ERROR = "ZONE:";

export interface TravelEvent {
  zone: ZoneId;
  ticket: string;
  /** a mist portal's own room, joined by id */
  roomId?: string;
  rift?: import("./rift").RiftInfo;
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
  /** said in party chat */
  party?: boolean;
}

export interface HitEvent {
  /** attacker id: a player's session id or a monster id ("m12") */
  from: string;
  to: string;
  dmg: number;
  crit?: boolean;
  skill?: string;
  killed?: boolean;
  /** the target dodged (dmg is 0) */
  miss?: boolean;
  /** healing instead of damage */
  heal?: boolean;
}

export interface PrivateData {
  gold: number;
  nodes: string[];
  inv: Inventory;
}

export interface LootEvent {
  items: { id: string; qty: number }[];
}

export interface GatheringEvent {
  ms: number;
  name?: string;
}

export interface OpenStationEvent {
  kind: StationKind;
}

export interface CooldownEvent {
  skill: string;
  ms: number;
}

/** Eight facing directions, clockwise from "down" on screen. */
export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ---- parties ------------------------------------------------------------------

export const PARTY_MAX = 5;
/** Members this close to a kill share its EXP and coins. */
export const PARTY_SHARE_RANGE = 12;
/** Each extra member nearby adds this much to the whole reward. */
export const PARTY_BONUS = 0.1;

export interface PartyMember {
  /** account id */
  id: number;
  name: string;
  level: number;
  job: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  dead: boolean;
  zone: string;
  online: boolean;
  leader: boolean;
  me: boolean;
  /** session id when in the same map as you */
  sid?: string;
}

export interface PartyData {
  members: PartyMember[];
  /** name of whoever asks you to join, if anyone */
  invite?: string;
}

export interface PartyAction {
  action: "invite" | "accept" | "decline" | "leave" | "kick";
  name?: string;
}
