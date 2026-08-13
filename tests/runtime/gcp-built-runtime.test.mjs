import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const waitForHealthyRuntime = async (child, url, output) => {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      assert.fail(`GCP runtime exited before becoming healthy.\n${output.join('')}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  assert.fail(`GCP runtime did not become healthy before the timeout.\n${output.join('')}`);
};

test('built GCP runtime starts with the local SQLite adapter', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'dam-gcp-runtime-'));
  const port = 18_000 + Math.floor(Math.random() * 1_000);
  const output = [];
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: new URL('../..', import.meta.url),
    env: {
      ...process.env,
      DATABASE_PATH: join(dataRoot, 'database.sqlite'),
      LOCAL_DAM_STORAGE_DIR: join(dataRoot, 'files'),
      NITRO_PRESET: 'node-server',
      NUXT_SESSION_PASSWORD: 'runtime-smoke-test-session-password',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));

  try {
    await waitForHealthyRuntime(child, `http://127.0.0.1:${port}/api/health`, output);
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) {
      await new Promise((resolve) => child.once('exit', resolve));
    }
    await rm(dataRoot, { recursive: true, force: true });
  }
});
