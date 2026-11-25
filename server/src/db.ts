import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { DatabaseSync as DB } from "node:sqlite";

/**
 * Saved accounts and characters, in one SQLite file (server/data/hearthvale.db).
 * Uses the SQLite built into Node.js, so there is nothing to install. Set
 * HV_DB=":memory:" for a throwaway database (tests do this).
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export interface CharacterRow {
  account_id: number;
  name: string;
  color: number;
  level: number;
  exp: number;
  job: string;
  skills: string; // JSON
  nodes: string; // JSON: learned passive nodes
  gold: number;
  inv: string; // JSON: bag, gear, storage, crafting skill
  zone: string;
  corruption: number;
  x: number;
  y: number;
}

/** Things a dead player left on the ground, kept in the database so a restart loses nothing. */
export interface BundleRow {
  id: string;
  zone: string;
  x: number;
  y: number;
  owner: string;
  items: string; // JSON
  expires: number; // epoch ms
}

let db: DB | undefined;

async function open(): Promise<DB> {
  if (db) return db;
  let sqlite: typeof import("node:sqlite");
  try {
    sqlite = await import("node:sqlite");
  } catch {
    throw new Error("Node.js รุ่นนี้ไม่มี SQLite ในตัว กรุณาอัปเดต Node.js เป็นรุ่น 22.13 ขึ้นไป (LTS)");
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = process.env.HV_DB ?? path.resolve(here, "../data/hearthvale.db");
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  db = new sqlite.DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass_hash BLOB NOT NULL,
      salt BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS characters (
      account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color INTEGER NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      exp INTEGER NOT NULL DEFAULT 0,
      job TEXT NOT NULL DEFAULT 'wanderer',
      skills TEXT NOT NULL DEFAULT '{}',
      nodes TEXT NOT NULL DEFAULT '[]',
      gold INTEGER NOT NULL DEFAULT 0,
      inv TEXT NOT NULL DEFAULT '{}',
      zone TEXT NOT NULL DEFAULT 'brindle',
      corruption REAL NOT NULL DEFAULT 0,
      x REAL NOT NULL DEFAULT -1,
      y REAL NOT NULL DEFAULT -1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bundles (
      id TEXT PRIMARY KEY,
      zone TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      owner TEXT NOT NULL,
      items TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
  `);
  // Files made by an older version of the game: add the columns that came later.
  const have = new Set((db.prepare("PRAGMA table_info(characters)").all() as { name: string }[]).map((c) => c.name));
  if (!have.has("nodes")) db.exec("ALTER TABLE characters ADD COLUMN nodes TEXT NOT NULL DEFAULT '[]'");
  if (!have.has("gold")) db.exec("ALTER TABLE characters ADD COLUMN gold INTEGER NOT NULL DEFAULT 0");
  if (!have.has("inv")) db.exec("ALTER TABLE characters ADD COLUMN inv TEXT NOT NULL DEFAULT '{}'");
  if (!have.has("zone")) db.exec("ALTER TABLE characters ADD COLUMN zone TEXT NOT NULL DEFAULT 'brindle'");
  if (!have.has("corruption")) db.exec("ALTER TABLE characters ADD COLUMN corruption REAL NOT NULL DEFAULT 0");
  return db;
}

export async function createAccount(name: string, password: string, color: number): Promise<CharacterRow> {
  const d = await open();
  const exists = d.prepare("SELECT 1 FROM accounts WHERE name = ?").get(name);
  if (exists) throw new Error("NAME_TAKEN");
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  d.exec("BEGIN");
  try {
    const r = d.prepare("INSERT INTO accounts (name, pass_hash, salt) VALUES (?, ?, ?)").run(name, hash, salt);
    const id = Number(r.lastInsertRowid);
    d.prepare("INSERT INTO characters (account_id, name, color) VALUES (?, ?, ?)").run(id, name, color);
    d.exec("COMMIT");
    return (await loadCharacter(id))!;
  } catch (e) {
    d.exec("ROLLBACK");
    if (String(e).includes("UNIQUE")) throw new Error("NAME_TAKEN");
    throw e;
  }
}

/** Returns the character when name and password match, otherwise null. */
export async function login(name: string, password: string): Promise<CharacterRow | null> {
  const d = await open();
  const row = d.prepare("SELECT id, pass_hash, salt FROM accounts WHERE name = ?").get(name) as
    | { id: number; pass_hash: Uint8Array; salt: Uint8Array }
    | undefined;
  // Hash even when the name is unknown so both cases take the same time.
  const salt = row ? Buffer.from(row.salt) : randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  if (!row || !timingSafeEqual(hash, Buffer.from(row.pass_hash))) return null;
  return loadCharacter(row.id);
}

export async function loadCharacter(accountId: number): Promise<CharacterRow | null> {
  const d = await open();
  return (d.prepare("SELECT * FROM characters WHERE account_id = ?").get(accountId) as unknown as CharacterRow) ?? null;
}

export type CharacterSave = Omit<CharacterRow, "name" | "color">;

export async function saveCharacter(c: CharacterSave) {
  writeCharacter(await open(), c);
}

/** Saves a character and changes a bundle together: both happen, or neither. */
export async function saveWithBundle(c: CharacterSave, change: { put: BundleRow } | { remove: string }) {
  const d = await open();
  d.exec("BEGIN");
  try {
    writeCharacter(d, c);
    if ("put" in change) {
      const b = change.put;
      d.prepare("INSERT OR REPLACE INTO bundles (id, zone, x, y, owner, items, expires) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        b.id,
        b.zone,
        b.x,
        b.y,
        b.owner,
        b.items,
        b.expires,
      );
    } else d.prepare("DELETE FROM bundles WHERE id = ?").run(change.remove);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

/** Bundles still lying in a map; old ones are cleared away. */
export async function loadBundles(zone: string, now = Date.now()): Promise<BundleRow[]> {
  const d = await open();
  d.prepare("DELETE FROM bundles WHERE expires <= ?").run(now);
  return d.prepare("SELECT * FROM bundles WHERE zone = ?").all(zone) as unknown as BundleRow[];
}

function writeCharacter(d: DB, c: CharacterSave) {
  d.prepare(
    `UPDATE characters SET level = ?, exp = ?, job = ?, skills = ?, nodes = ?, gold = ?, inv = ?, zone = ?, corruption = ?, x = ?, y = ?, updated_at = datetime('now')
     WHERE account_id = ?`,
  ).run(c.level, c.exp, c.job, c.skills, c.nodes, c.gold, c.inv, c.zone, c.corruption, c.x, c.y, c.account_id);
}
