import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Automatically load .env before starting the server
const envPath = resolve(fileURLToPath(new URL('../.env', import.meta.url)));
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// Ensure database path is set for local node server
if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = './data/sqlite.db';
}

console.log('[Server] Loaded .env with Google OAuth & DB configuration');
await import('../.output/server/index.mjs');
