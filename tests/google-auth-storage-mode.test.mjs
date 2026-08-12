import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Google Drive storage is disabled unless explicitly enabled', async () => {
  const { parsePublicBooleanFlag } = await import('../shared/utils/public-feature-flags.ts');

  assert.equal(parsePublicBooleanFlag(undefined), false);
  assert.equal(parsePublicBooleanFlag('false'), false);
  assert.equal(parsePublicBooleanFlag('TRUE'), true);
  assert.equal(parsePublicBooleanFlag('1'), true);
});

test('the explicit Drive hosting action follows the production feature flag', async () => {
  const card = await readFile(new URL('../app/components/auth/Card.vue', import.meta.url), 'utf8');

  assert.match(card, /enableGDriveStorage/);
  assert.match(card, /v-if="enableGDriveStorage"/);
  assert.match(card, /\/api\/auth\/google\?gdrive=true/);
});
