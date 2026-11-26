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
  quests: string; // JSON: story step, dailies, quest points
  /** outlaw points: above 0 the name is red (GDD 3.2) */
  karma: number;
  /** 1 = game master (from the account; see setAdmin) */
  admin: number;
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

/** The open database. Rooms open it before anyone can play. */
export function connection(): DB {
  if (!db) throw new Error("database is not open yet");
  return db;
}

/** Runs `fn` so that all of its changes happen, or none. No waiting inside. */
export function transaction<T>(fn: (d: DB) => T): T {
  const d = connection();
  d.exec("BEGIN");
  try {
    const r = fn(d);
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

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
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass_hash BLOB NOT NULL,
      salt BLOB NOT NULL,
      admin INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      seller TEXT NOT NULL,
      item TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price INTEGER NOT NULL,
      expires INTEGER NOT NULL,
      created TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      buyer TEXT NOT NULL,
      item_id TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price INTEGER NOT NULL,
      expires INTEGER NOT NULL,
      created TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      gold INTEGER NOT NULL,
      item TEXT,
      note TEXT NOT NULL,
      created TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stalls (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
      owner TEXT NOT NULL,
      color INTEGER NOT NULL,
      weapon TEXT NOT NULL,
      helm TEXT NOT NULL,
      title TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      items TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
  `);
  // Files made by an older version of the game: add the columns that came later.
  const acc = new Set((db.prepare("PRAGMA table_info(accounts)").all() as { name: string }[]).map((c) => c.name));
  if (!acc.has("admin")) db.exec("ALTER TABLE accounts ADD COLUMN admin INTEGER NOT NULL DEFAULT 0");
  const have = new Set((db.prepare("PRAGMA table_info(characters)").all() as { name: string }[]).map((c) => c.name));
  if (!have.has("nodes")) db.exec("ALTER TABLE characters ADD COLUMN nodes TEXT NOT NULL DEFAULT '[]'");
  if (!have.has("gold")) db.exec("ALTER TABLE characters ADD COLUMN gold INTEGER NOT NULL DEFAULT 0");
  if (!have.has("inv")) db.exec("ALTER TABLE characters ADD COLUMN inv TEXT NOT NULL DEFAULT '{}'");
  if (!have.has("zone")) db.exec("ALTER TABLE characters ADD COLUMN zone TEXT NOT NULL DEFAULT 'brindle'");
  if (!have.has("corruption")) db.exec("ALTER TABLE characters ADD COLUMN corruption REAL NOT NULL DEFAULT 0");
  if (!have.has("quests")) db.exec("ALTER TABLE characters ADD COLUMN quests TEXT NOT NULL DEFAULT '{}'");
  if (!have.has("karma")) db.exec("ALTER TABLE characters ADD COLUMN karma REAL NOT NULL DEFAULT 0");
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
  return (d
    .prepare("SELECT c.*, a.admin FROM characters c JOIN accounts a ON a.id = c.account_id WHERE c.account_id = ?")
    .get(accountId) as unknown as CharacterRow) ?? null;
}

export type CharacterSave = Omit<CharacterRow, "name" | "color" | "admin" | "quests" | "karma"> & { quests?: string; karma?: number };

export async function saveCharacter(c: CharacterSave) {
  // Written at once when the database is open, so an older save can never land on top of a newer one.
  writeCharacter(db ?? (await open()), c);
}

/** Saves a character and changes a bundle together: both happen, or neither. */
export async function saveWithBundle(c: CharacterSave, change: { put: BundleRow } | { remove: string }) {
  const d = db ?? (await open());
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

/** Gives or takes the game master flag. Only ever called from scripts/admin.ts. */
export async function setAdmin(name: string, on: boolean): Promise<boolean> {
  const d = await open();
  return Number(d.prepare("UPDATE accounts SET admin = ? WHERE name = ?").run(on ? 1 : 0, name).changes) > 0;
}

export async function listAdmins(): Promise<string[]> {
  const d = await open();
  return (d.prepare("SELECT name FROM accounts WHERE admin = 1 ORDER BY name").all() as { name: string }[]).map((r) => r.name);
}

/** Bundles still lying in a map; old ones are cleared away. */
export async function loadBundles(zone: string, now = Date.now()): Promise<BundleRow[]> {
  const d = await open();
  d.prepare("DELETE FROM bundles WHERE expires <= ?").run(now);
  return d.prepare("SELECT * FROM bundles WHERE zone = ?").all(zone) as unknown as BundleRow[];
}

export function writeCharacter(d: DB, c: CharacterSave) {
  d.prepare(
    `UPDATE characters SET level = ?, exp = ?, job = ?, skills = ?, nodes = ?, gold = ?, inv = ?, zone = ?, corruption = ?, x = ?, y = ?, quests = ?, karma = ?, updated_at = datetime('now')
     WHERE account_id = ?`,
  ).run(c.level, c.exp, c.job, c.skills, c.nodes, c.gold, c.inv, c.zone, c.corruption, c.x, c.y, c.quests ?? "{}", c.karma ?? 0, c.account_id);
}
