import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

test('local storage cutover backs up SQLite and preserves organization metadata', async () => {
  const { setOrganizationStorage } = await import('../scripts/set-organization-storage.mjs');
  const root = await mkdtemp(join(tmpdir(), 'dam-cutover-'));
  const databasePath = join(root, 'database.sqlite');
  const backupDirectory = join(root, 'backups');
  const sqlite = new Database(databasePath);

  try {
    sqlite.exec(`
      CREATE TABLE organizations (id TEXT PRIMARY KEY, org_type TEXT NOT NULL);
      CREATE TABLE org_departments (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL);
      CREATE TABLE files (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, path TEXT NOT NULL);
      INSERT INTO organizations VALUES ('org-drive', 'gdrive');
      INSERT INTO org_departments VALUES ('dept-one', 'org-drive', 'Creative');
      INSERT INTO files VALUES ('file-one', 'org-drive', 'gdrive/existing-file');
    `);
    sqlite.close();

    const result = await setOrganizationStorage({
      databasePath,
      organizationId: 'org-drive',
      target: 'local',
      backupDirectory,
    });

    const after = new Database(databasePath, { readonly: true });
    try {
      assert.equal(after.prepare('SELECT org_type FROM organizations WHERE id = ?').pluck().get('org-drive'), 's3');
      assert.equal(after.prepare('SELECT count(*) FROM org_departments').pluck().get(), 1);
      assert.equal(after.prepare('SELECT count(*) FROM files').pluck().get(), 1);
      assert.equal(after.prepare('SELECT path FROM files WHERE id = ?').pluck().get('file-one'), 'gdrive/existing-file');
    } finally {
      after.close();
    }

    assert.equal(result.organizationId, 'org-drive');
    assert.equal(result.previousType, 'gdrive');
    assert.equal(result.nextType, 's3');
    assert.ok((await stat(result.backupPath)).size > 0);
  } finally {
    if (sqlite.open) sqlite.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('storage cutover rejects unknown organizations without creating state', async () => {
  const { setOrganizationStorage } = await import('../scripts/set-organization-storage.mjs');
  const root = await mkdtemp(join(tmpdir(), 'dam-cutover-missing-'));
  const databasePath = join(root, 'database.sqlite');
  const sqlite = new Database(databasePath);
  sqlite.exec('CREATE TABLE organizations (id TEXT PRIMARY KEY, org_type TEXT NOT NULL);');
  sqlite.close();

  try {
    await assert.rejects(
      setOrganizationStorage({ databasePath, organizationId: 'missing', target: 'local' }),
      /Organization "missing" was not found/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
