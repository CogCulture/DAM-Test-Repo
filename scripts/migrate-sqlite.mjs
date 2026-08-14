import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const migrateSqliteDatabase = async ({ databasePath, migrationsDirectory }) => {
  if (!databasePath) throw new Error('DATABASE_PATH is required for SQLite migrations.');
  if (!migrationsDirectory) throw new Error('A migrations directory is required.');

  const resolvedDatabasePath = resolve(databasePath);
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
  const databasePath = process.env.DATABASE_PATH;
  const migrationsDirectory = process.env.DATABASE_MIGRATIONS_DIR
    || resolve(process.cwd(), 'server', 'database', 'migrations');

  migrateSqliteDatabase({ databasePath, migrationsDirectory })
    .then(() => process.stdout.write(`SQLite migrations applied to ${resolve(databasePath)}\n`))
    .catch((error) => {
      process.stderr.write(`SQLite migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
