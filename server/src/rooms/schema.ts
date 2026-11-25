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
}

export class WorldState extends Schema {
  @type("string") mapName = "";
  @type({ map: Player }) players = new MapSchema<Player>();
}
