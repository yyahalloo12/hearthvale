import { MapSchema, Schema, type } from "@colyseus/schema";

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

export class WorldState extends Schema {
  @type("string") mapName = "";
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Monster }) monsters = new MapSchema<Monster>();
  /** Rocks and trees that are used up for now, by "x,y". */
  @type({ map: "boolean" }) depleted = new MapSchema<boolean>();
}
