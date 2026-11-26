import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

/** What every client can see about one player. */
export class Player extends Schema {
  @type("string") name = "";
  @type("uint32") color = 0;
  /** Position in tile units (fractional while walking). */
  @type("float32") x = 0;
  @type("float32") y = 0;
  /** 0..7, clockwise from "down" on screen. */
  @type("uint8") facing = 0;
  @type("boolean") moving = false;

  @type("uint8") level = 1;
  @type("uint32") exp = 0;
  @type("string") job = "wanderer";
  @type("int32") hp = 1;
  @type("int32") maxHp = 1;
  /** 0 for jobs without mana */
  @type("int32") mp = 0;
  @type("int32") maxMp = 0;
  /** the windmill's blessing */
  @type("boolean") windy = false;
  /** standing in a colour spring: everyone sees you */
  @type("boolean") inSpring = false;
  @type("boolean") blessed = false;
  @type("boolean") manaShield = false;
  @type("boolean") slowed = false;
  @type("boolean") marked = false;
  @type("boolean") dead = false;
  @type("boolean") guarding = false;
  /** Item ids of what others can see on you ("" = nothing). */
  @type("boolean") offline = false;
  /** game master (shown as a star by the name) */
  @type("boolean") gm = false;
  /** just arrived: cannot hurt or be hurt yet */
  @type("boolean") shielded = false;
  /** Hollow corruption 0-100; from GLOW_AT on, everyone sees you on the map */
  @type("uint8") corruption = 0;
  @type("string") weapon = "";
  @type("string") helm = "";
  /** Learned skill levels, e.g. { heavy_strike: 2 }. */
  @type({ map: "uint8" }) skills = new MapSchema<number>();
}

export class Monster extends Schema {
  @type("string") kind = "";
  @type("uint8") level = 1;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("uint8") facing = 0;
  @type("boolean") moving = false;
  @type("int32") hp = 1;
  @type("int32") maxHp = 1;
  @type("boolean") stunned = false;
  @type("boolean") slowed = false;
  @type("boolean") marked = false;
}

export class Gate extends Schema {
  @type("uint8") x = 0;
  @type("uint8") y = 0;
}

/** Things a dead player left behind. */
export class Bundle extends Schema {
  @type("uint8") x = 0;
  @type("uint8") y = 0;
  @type("string") owner = "";
}

/** A player's stall; stays open while the owner is offline. */
export class Stall extends Schema {
  @type("uint8") x = 0;
  @type("uint8") y = 0;
  @type("string") owner = "";
  @type("string") title = "";
  @type("uint32") color = 0;
  @type("string") weapon = "";
  @type("string") helm = "";
}

/** A mist (or black) portal standing in an open map. */
export class Portal extends Schema {
  @type("uint8") x = 0;
  @type("uint8") y = 0;
  @type("uint8") rarity = 0;
  @type("boolean") dark = false;
  /** closes at this time (epoch ms) */
  @type("float64") until = 0;
  /** how many have gone in (max 7) */
  @type("uint8") inside = 0;
}

export class WorldState extends Schema {
  @type({ map: Portal }) portals = new MapSchema<Portal>();
  /** the event going on now ("" for none) and when it ends */
  @type("string") eventKind = "";
  @type("float64") eventUntil = 0;
  /** when the giant wakes next, and its monster id while it is up */
  @type("float64") bossAt = 0;
  @type("string") bossId = "";
  /** inside a portal: which wave, how many, when it closes, and whether all are beaten */
  @type("uint8") riftWave = 0;
  @type("uint8") riftWaves = 0;
  @type("float64") riftEnds = 0;
  @type("boolean") riftCleared = false;
  @type("string") mapName = "";
  /** regions of the map that are closed now (fog, fallen ground) */
  @type({ map: "boolean" }) closed = new MapSchema<boolean>();
  /** region about to fall, or "" */
  @type("string") cracking = "";
  /** lit lantern stones: "x,y" -> when they go out (epoch ms) */
  @type({ map: "float64" }) lit = new MapSchema<number>();
  /** the fog is open until this time (epoch ms), 0 = closed */
  @type("float64") fogUntil = 0;
  @type([Gate]) gates = new ArraySchema<Gate>();
  /** when the gates move next (epoch ms) */
  @type("float64") gatesUntil = 0;
  @type({ map: Bundle }) bundles = new MapSchema<Bundle>();
  @type({ map: Stall }) stalls = new MapSchema<Stall>();
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Monster }) monsters = new MapSchema<Monster>();
  /** Rocks and trees that are used up for now, by "x,y". */
  @type({ map: "boolean" }) depleted = new MapSchema<boolean>();
}
