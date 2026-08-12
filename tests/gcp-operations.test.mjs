import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

test('GCE deployment plan creates a persistent disk without exposing port 8080', async () => {
  const { buildGceDeploymentCommands } = await import('../scripts/gce-deployment-plan.mjs');
  const commands = buildGceDeploymentCommands({ projectId: 'example-project' }).join('\n');

  assert.match(commands, /gcloud compute disks create dam-portal-data/);
  assert.match(commands, /--type=pd-balanced/);
  assert.match(commands, /--disk=name=dam-portal-data/);
  assert.doesNotMatch(commands, /drive\.googleapis\.com/);
  assert.doesNotMatch(commands, /tcp:8080/);
});

test('backup and restore round-trip SQLite metadata and nested asset bytes', async () => {
  const { backupLocalStorage } = await import('../scripts/backup-local-storage.mjs');
  const { restoreLocalStorage } = await import('../scripts/restore-local-storage.mjs');
  const root = await mkdtemp(join(tmpdir(), 'dam-operations-'));
  const source = join(root, 'source');
  const destination = join(root, 'external-backups');
  const restored = join(root, 'restored');
  await mkdir(join(source, 'files', 'department', 'campaign'), { recursive: true });
  await writeFile(join(source, 'files', 'department', 'campaign', 'asset.txt'), 'asset-bytes');
  const sqlite = new Database(join(source, 'database.sqlite'));
  sqlite.exec("CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT); INSERT INTO folders VALUES ('one', 'Campaign');");
  sqlite.close();

  try {
    const backup = await backupLocalStorage({ dataRoot: source, destinationRoot: destination });
    await restoreLocalStorage({
      backupDirectory: backup.backupDirectory,
      dataRoot: restored,
      confirmation: 'RESTORE_STOPPED_DAM',
    });

    assert.equal(await readFile(join(restored, 'files', 'department', 'campaign', 'asset.txt'), 'utf8'), 'asset-bytes');
    const restoredDatabase = new Database(join(restored, 'database.sqlite'), { readonly: true });
    try {
      assert.equal(restoredDatabase.prepare('SELECT name FROM folders WHERE id = ?').pluck().get('one'), 'Campaign');
    } finally {
      restoredDatabase.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('backup destination cannot be inside the live data root', async () => {
  const { backupLocalStorage } = await import('../scripts/backup-local-storage.mjs');
  const root = await mkdtemp(join(tmpdir(), 'dam-unsafe-backup-'));
  await mkdir(join(root, 'files'), { recursive: true });
  const sqlite = new Database(join(root, 'database.sqlite'));
  sqlite.exec('CREATE TABLE marker (id INTEGER);');
  sqlite.close();

  try {
    await assert.rejects(
      backupLocalStorage({ dataRoot: root, destinationRoot: join(root, 'backups') }),
      /outside the live data root/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restore replaces existing live data only after staging a valid backup', async () => {
  const { backupLocalStorage } = await import('../scripts/backup-local-storage.mjs');
  const { restoreLocalStorage } = await import('../scripts/restore-local-storage.mjs');
  const root = await mkdtemp(join(tmpdir(), 'dam-restore-existing-'));
  const source = join(root, 'source');
  const live = join(root, 'live');
  const backups = join(root, 'backups');
  await mkdir(join(source, 'files'), { recursive: true });
  await mkdir(join(live, 'files'), { recursive: true });
  await writeFile(join(source, 'files', 'asset.txt'), 'restored-asset');
  await writeFile(join(live, 'files', 'asset.txt'), 'old-asset');
  for (const [directory, value] of [[source, 'restored'], [live, 'old']]) {
    const sqlite = new Database(join(directory, 'database.sqlite'));
    sqlite.exec(`CREATE TABLE marker (value TEXT); INSERT INTO marker VALUES ('${value}');`);
    sqlite.close();
  }

  try {
    const backup = await backupLocalStorage({ dataRoot: source, destinationRoot: backups });
    await restoreLocalStorage({
      backupDirectory: backup.backupDirectory,
      dataRoot: live,
      confirmation: 'RESTORE_STOPPED_DAM',
    });
    assert.equal(await readFile(join(live, 'files', 'asset.txt'), 'utf8'), 'restored-asset');
    const restored = new Database(join(live, 'database.sqlite'), { readonly: true });
    assert.equal(restored.prepare('SELECT value FROM marker').pluck().get(), 'restored');
    restored.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restore rejects overlapping and corrupt backups before changing live data', async () => {
  const { restoreLocalStorage } = await import('../scripts/restore-local-storage.mjs');
  const root = await mkdtemp(join(tmpdir(), 'dam-restore-reject-'));
  const live = join(root, 'live');
  const corrupt = join(root, 'corrupt');
  await mkdir(join(live, 'files', 'nested-backup', 'files'), { recursive: true });
  await mkdir(join(corrupt, 'files'), { recursive: true });
  await writeFile(join(live, 'files', 'asset.txt'), 'live-asset');
  await writeFile(join(live, 'files', 'nested-backup', 'database.sqlite'), 'not-sqlite');
  await writeFile(join(corrupt, 'database.sqlite'), 'not-sqlite');
  const sqlite = new Database(join(live, 'database.sqlite'));
  sqlite.exec("CREATE TABLE marker (value TEXT); INSERT INTO marker VALUES ('live');");
  sqlite.close();

  try {
    await assert.rejects(restoreLocalStorage({
      backupDirectory: join(live, 'files', 'nested-backup'),
      dataRoot: live,
      confirmation: 'RESTORE_STOPPED_DAM',
    }), /must not overlap/);
    await assert.rejects(restoreLocalStorage({
      backupDirectory: corrupt,
      dataRoot: live,
      confirmation: 'RESTORE_STOPPED_DAM',
    }), /integrity check|not a database/i);
    assert.equal(await readFile(join(live, 'files', 'asset.txt'), 'utf8'), 'live-asset');
    const unchanged = new Database(join(live, 'database.sqlite'), { readonly: true });
    assert.equal(unchanged.prepare('SELECT value FROM marker').pluck().get(), 'live');
    unchanged.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
