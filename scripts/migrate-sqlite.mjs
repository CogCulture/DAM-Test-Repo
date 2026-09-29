import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function getDatabasePath() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DATABASE_PATH=')) {
        let val = trimmed.slice('DATABASE_PATH='.length).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        return val;
      }
    }
  }
  return 'data/sqlite.db';
}

export const migrateSqliteDatabase = async ({ databasePath, migrationsDirectory }) => {
  const targetDbPath = databasePath || getDatabasePath();
  if (!targetDbPath) throw new Error('DATABASE_PATH is required for SQLite migrations.');
  if (!migrationsDirectory) throw new Error('A migrations directory is required.');

  const resolvedDatabasePath = resolve(targetDbPath);
  await mkdir(dirname(resolvedDatabasePath), { recursive: true });
  const sqlite = new Database(resolvedDatabasePath);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    migrate(drizzle(sqlite), { migrationsFolder: resolve(migrationsDirectory) });
  } finally {
    sqlite.close();
  }
};

export const inspectSqliteTables = async (databasePath) => {
  const sqlite = new Database(resolve(databasePath), { readonly: true });
  try {
    return sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
  } finally {
    sqlite.close();
  }
};

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();

if (isDirectRun) {
  if (process.env.DATABASE_URL) {
    process.stdout.write('DATABASE_URL detected. Skipping SQLite migrations (managed by PostgreSQL / Supabase).\n');
    process.exit(0);
  }

  const databasePath = process.env.DATABASE_PATH || getDatabasePath();
  const migrationsDirectory = process.env.DATABASE_MIGRATIONS_DIR
    || resolve(process.cwd(), 'server', 'database', 'migrations');

  migrateSqliteDatabase({ databasePath, migrationsDirectory })
    .then(() => process.stdout.write(`SQLite migrations applied to ${resolve(databasePath)}\n`))
    .catch((error) => {
      process.stderr.write(`SQLite migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
