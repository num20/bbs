import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const dbPath = process.env.DB_PATH ?? fileURLToPath(new URL('../bbs.db', import.meta.url));

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS threads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    created_at TEXT    NOT NULL,
    bumped_at  TEXT    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id  INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    num        INTEGER NOT NULL,
    name       TEXT    NOT NULL,
    trip       TEXT,
    email      TEXT    NOT NULL DEFAULT '',
    body       TEXT    NOT NULL,
    poster_id  TEXT    NOT NULL,
    password   TEXT,
    deleted    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL,
    UNIQUE (thread_id, num)
  );
  CREATE TABLE IF NOT EXISTS counter (
    id    INTEGER PRIMARY KEY CHECK (id = 1),
    count INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO counter (id, count) VALUES (1, 0);
`);
