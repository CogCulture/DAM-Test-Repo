import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('GCP Compose binds the persistent disk and keeps the SQLite deployment single-instance', async () => {
  const compose = await readFile(new URL('../docker-compose.gcp.yml', import.meta.url), 'utf8');

  assert.match(compose, /- \/var\/lib\/dam:\/var\/lib\/dam/);
  assert.match(compose, /replicas:\s*1/);
  assert.match(compose, /init:\s*true/);
  assert.match(compose, /stop_grace_period:\s*30s/);
  assert.match(compose, /mem_limit:\s*6g/);
  assert.match(compose, /127\.0\.0\.1:8080:8080/);
  assert.doesNotMatch(compose, /dam_data:/);
});

test('production environment example places SQLite and assets on the persistent mount', async () => {
  const environment = await readFile(new URL('../.env.gcp.example', import.meta.url), 'utf8');

  assert.match(environment, /^DATABASE_PATH=\/var\/lib\/dam\/database\.sqlite$/m);
  assert.match(environment, /^LOCAL_DAM_STORAGE_DIR=\/var\/lib\/dam\/files$/m);
});

test('Docker image excludes local databases, uploads, backups, and production secrets', async () => {
  const dockerignore = await readFile(new URL('../.dockerignore', import.meta.url), 'utf8');

  for (const pattern of ['.env.*', '*.sqlite', 'uploads', 'backups']) {
    assert.match(dockerignore, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
});

test('runtime container uses a stable non-root identity for persistent disk ownership', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');

  assert.match(dockerfile, /groupadd --system --gid 10001 dam/);
  assert.match(dockerfile, /useradd --system --uid 10001 --gid dam/);
  assert.match(dockerfile, /^USER dam$/m);
});
