/** Every map in the world, by id. */
import { buildHollow } from "./hollow";
import { buildBrindleVillage, GameMap, ZoneId } from "./map";
import { buildMossfen } from "./mossfen";
import { buildRift, RiftInfo } from "./rift";
import { buildAldermere, buildRegion } from "./regions";
import { buildArena } from "./arena";

export const ZONE_IDS: ZoneId[] = ["brindle", "mossfen", "hollow", "aldermere", "copperhill", "sunreach", "thornmarsh", "greywater", "arena"];
export const ZONE_NAMES: Record<ZoneId, string> = {
  brindle: "หมู่บ้านบรินเดิล",
  mossfen: "ป่ามอสเฟน",
  hollow: "Hollow",
  rift: "พอร์ทัล",
  aldermere: "เมืองหลวงอัลเดอเมียร์",
  copperhill: "เหมืองคอปเปอร์ฮิลล์",
  sunreach: "ชายฝั่งซันรีช",
  thornmarsh: "ชายแดนธอร์นมาร์ช",
  greywater: "หนองเกรย์วอเตอร์",
  arena: "โคลอสเซียม",
};

export function buildZone(id: ZoneId, rift?: RiftInfo): GameMap {
  if (id === "rift") return buildRift(rift ?? { seed: 1, origin: "brindle", rarity: 0, dark: false, at: { x: 26, y: 26 } });
  if (id === "hollow") return buildHollow();
  if (id === "mossfen") return buildMossfen();
  if (id === "aldermere") return buildAldermere();
  if (id === "arena") return buildArena();
  if (id === "copperhill" || id === "sunreach" || id === "thornmarsh" || id === "greywater") return buildRegion(id);
  return buildBrindleVillage();
}

/** A zone id from anywhere; unknown ones mean the village. */
export function zoneId(v: unknown): ZoneId {
  return ZONE_IDS.includes(v as ZoneId) ? (v as ZoneId) : "brindle";
}
