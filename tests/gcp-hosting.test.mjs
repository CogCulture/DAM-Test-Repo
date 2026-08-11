import test from 'node:test';
import assert from 'node:assert/strict';

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
