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
    databasePath: 'db.sqlite',
    storageDirectory: 'files',
  }), [
    'DATABASE_PATH must be absolute.',
    'LOCAL_DAM_STORAGE_DIR must be absolute.',
  ]);
  assert.deepEqual(validatePersistentStoragePaths({
    databasePath: '/var/lib/dam/database.sqlite',
    storageDirectory: '/var/lib/dam/database.sqlite',
  }), ['DATABASE_PATH and LOCAL_DAM_STORAGE_DIR must be different paths.']);
  assert.deepEqual(validatePersistentStoragePaths({
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
    const result = await preparePersistentStorage({ databasePath, storageDirectory });

    assert.equal(await readFile(databasePath, 'utf8'), 'existing-database-bytes');
    assert.deepEqual(result, { databasePath, storageDirectory });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
