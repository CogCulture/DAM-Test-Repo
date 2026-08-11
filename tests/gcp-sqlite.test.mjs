import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('applies DAM migrations idempotently to a persistent SQLite database', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dam-gcp-sqlite-'));
  const databasePath = join(directory, 'database.sqlite');

  try {
    const { migrateSqliteDatabase, inspectSqliteTables } = await import('../scripts/migrate-sqlite.mjs');
    const migrationsDirectory = join(process.cwd(), 'server', 'database', 'migrations');

    await migrateSqliteDatabase({ databasePath, migrationsDirectory });
    await migrateSqliteDatabase({ databasePath, migrationsDirectory });

    const tables = await inspectSqliteTables(databasePath);
    assert.equal(tables.includes('files'), true);
    assert.equal(tables.includes('nomenclatures'), true);
    assert.equal(tables.includes('folder_requests'), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
