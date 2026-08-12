import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('health payload exposes liveness without configuration or user data', async () => {
  const { createHealthPayload } = await import('../server/utils/health.ts');
  const payload = createHealthPayload();

  assert.deepEqual(payload, { status: 'ok', service: 'dam-portal' });
  assert.equal(JSON.stringify(payload).includes('secret'), false);
});

test('GCP startup validation identifies every missing required setting', async () => {
  const { validateGcpEnvironment } = await import('../scripts/validate-gcp-env.mjs');
  const result = validateGcpEnvironment({});

  assert.deepEqual(result, [
    'DATABASE_PATH',
    'DAM_DATA_ROOT',
    'LOCAL_DAM_STORAGE_DIR',
    'NUXT_PUBLIC_SITE_URL',
    'NUXT_SESSION_PASSWORD',
    'NUXT_OAUTH_GOOGLE_CLIENT_ID',
    'NUXT_OAUTH_GOOGLE_CLIENT_SECRET',
    'NUXT_OAUTH_GOOGLE_REDIRECT_URL',
    'SUPERADMIN_EMAIL',
    'SUPERADMIN_PASSWORD',
    'SUPERADMIN_SESSION_PASSWORD',
  ]);
});

test('GCP startup validation accepts a complete production environment', async () => {
  const { validateGcpEnvironment } = await import('../scripts/validate-gcp-env.mjs');
  const complete = Object.fromEntries([
    'DATABASE_PATH',
    'DAM_DATA_ROOT',
    'LOCAL_DAM_STORAGE_DIR',
    'NUXT_PUBLIC_SITE_URL',
    'NUXT_SESSION_PASSWORD',
    'NUXT_OAUTH_GOOGLE_CLIENT_ID',
    'NUXT_OAUTH_GOOGLE_CLIENT_SECRET',
    'NUXT_OAUTH_GOOGLE_REDIRECT_URL',
    'SUPERADMIN_EMAIL',
    'SUPERADMIN_PASSWORD',
    'SUPERADMIN_SESSION_PASSWORD',
  ].map((key) => [key, `${key.toLowerCase()}-configured-value-1234567890`]));

  assert.deepEqual(validateGcpEnvironment(complete), []);
});

test('production persistence requires absolute separate database and asset paths', async () => {
  const { validatePersistentStoragePaths } = await import('../scripts/prepare-persistent-storage.mjs');

  assert.deepEqual(validatePersistentStoragePaths({
    dataRoot: '/var/lib/dam',
    databasePath: 'db.sqlite',
    storageDirectory: 'files',
  }), [
    'DATABASE_PATH must be absolute.',
    'LOCAL_DAM_STORAGE_DIR must be absolute.',
  ]);
  assert.deepEqual(validatePersistentStoragePaths({
    dataRoot: '/var/lib/dam',
    databasePath: '/var/lib/dam/database.sqlite',
    storageDirectory: '/var/lib/dam/database.sqlite',
  }), ['LOCAL_DAM_STORAGE_DIR must equal <DAM_DATA_ROOT>/files.']);
  assert.deepEqual(validatePersistentStoragePaths({
    dataRoot: '/var/lib/dam',
    databasePath: '/tmp/database.sqlite',
    storageDirectory: '/var/lib/dam/files',
  }), ['DATABASE_PATH must equal <DAM_DATA_ROOT>/database.sqlite.']);
  assert.deepEqual(validatePersistentStoragePaths({
    dataRoot: '/var/lib/dam',
    databasePath: '/var/lib/dam/database.sqlite',
    storageDirectory: '/var/lib/dam/files',
  }), []);
});

test('preparing persistent storage preserves an existing database', async () => {
  const { preparePersistentStorage } = await import('../scripts/prepare-persistent-storage.mjs');
  const root = await mkdtemp(join(tmpdir(), 'dam-persistence-'));
  const databasePath = join(root, 'database.sqlite');
  const storageDirectory = join(root, 'files');

  try {
    await writeFile(databasePath, 'existing-database-bytes');
    const result = await preparePersistentStorage({ dataRoot: root, databasePath, storageDirectory });

    assert.equal(await readFile(databasePath, 'utf8'), 'existing-database-bytes');
    assert.deepEqual(result, { databasePath, storageDirectory });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('GCP build selects the node-server preset before Nuxt configuration loads', async () => {
  const { createGcpBuildEnvironment } = await import('../scripts/build-gcp.mjs');

  assert.equal(createGcpBuildEnvironment({ NODE_ENV: 'test' }).NITRO_PRESET, 'node-server');
  assert.equal(createGcpBuildEnvironment({ NODE_ENV: 'test' }).NODE_ENV, 'test');
});
