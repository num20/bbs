import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dbPath = process.env.DB_PATH ?? fileURLToPath(new URL('../bbs.db', import.meta.url));
const migrationsDir = new URL('../migrations/', import.meta.url);

export const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// migrations/ の SQL を未適用のものだけ順に適用（Workers では wrangler d1 migrations apply が適用する）
sqlite.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
const applied = new Set(sqlite.prepare('SELECT name FROM migrations').pluck().all());
for (const name of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  if (applied.has(name)) continue;
  sqlite.transaction(() => {
    sqlite.exec(readFileSync(new URL(name, migrationsDir), 'utf8'));
    sqlite.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)').run(name, new Date().toISOString());
  })();
}

// better-sqlite3 を D1 と同じ API（prepare / bind / first / all / run / batch）で包む
const statement = (sql, args = []) => {
  const exec = () => {
    const stmt = sqlite.prepare(sql);
    if (stmt.reader) return { results: stmt.all(...args), meta: {} };
    const { changes, lastInsertRowid } = stmt.run(...args);
    return { results: [], meta: { changes, last_row_id: Number(lastInsertRowid) } };
  };
  return {
    exec,
    bind: (...values) => statement(sql, values),
    first: async () => exec().results[0] ?? null,
    all: async () => exec(),
    run: async () => exec(),
  };
};

export const db = {
  prepare: (sql) => statement(sql),
  batch: async (statements) => sqlite.transaction(() => statements.map((s) => s.exec()))(),
};
