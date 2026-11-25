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

export class WorldState extends Schema {
  @type("string") mapName = "";
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
