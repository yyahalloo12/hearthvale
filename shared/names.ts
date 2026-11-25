import { NAME_MAX, NAME_MIN } from "./constants";

/**
 * Cleans a character name. Letters (any language, Thai included), digits,
 * spaces, "_" and "-" are allowed. Returns null when the name is not valid.
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  const len = [...name].length;
  if (len < NAME_MIN || len > NAME_MAX) return null;
  if (!/^[\p{L}\p{M}\p{N} _-]+$/u.test(name)) return null;
  return name;
}

/** Cleans a chat line: strips control characters, trims, caps length. */
export function cleanChat(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  if (!text) return null;
  return [...text].slice(0, max).join("");
}
