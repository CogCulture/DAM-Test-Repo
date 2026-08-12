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
