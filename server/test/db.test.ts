import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

test("a database from step 2 still opens, and keeps its characters", async () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "hv-db-")), "old.db");
  process.env.HV_DB = file;
  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass_hash BLOB NOT NULL, salt BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE characters (account_id INTEGER PRIMARY KEY, name TEXT NOT NULL, color INTEGER NOT NULL,
      level INTEGER NOT NULL DEFAULT 1, exp INTEGER NOT NULL DEFAULT 0, job TEXT NOT NULL DEFAULT 'wanderer',
      skills TEXT NOT NULL DEFAULT '{}', x REAL NOT NULL DEFAULT -1, y REAL NOT NULL DEFAULT -1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO accounts (id, name, pass_hash, salt) VALUES (1, 'Old', x'00', x'00');
    INSERT INTO characters (account_id, name, color, level) VALUES (1, 'Old', 5, 7);
  `);
  old.close();

  const { loadCharacter, saveCharacter } = await import("../src/db");
  const c = (await loadCharacter(1))!;
  assert.equal(c.level, 7);
  assert.equal(c.nodes, "[]");
  assert.equal(c.gold, 0);
  await saveCharacter({ ...c, nodes: '["c_str"]', gold: 42 });
  const again = (await loadCharacter(1))!;
  assert.equal(again.nodes, '["c_str"]');
  assert.equal(again.gold, 42);
  assert.equal(again.level, 7);
});
