import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

function loadEnv() {
  const envPath = resolve(projectRoot, '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

loadEnv();

const dbPath = resolve(projectRoot, process.env.DATABASE_PATH || 'data/sqlite.db');
const apiKey = process.env.PINECONE_API_KEY;
const configuredHost = process.env.PINECONE_INDEX_HOST;

console.log('[OrphanVectorCleanup] Starting Pinecone orphan vector backfill cleanup...');
console.log(`[OrphanVectorCleanup] SQLite database: ${dbPath}`);

if (!apiKey || !configuredHost) {
  console.error('[OrphanVectorCleanup] Error: PINECONE_API_KEY or PINECONE_INDEX_HOST is missing in environment.');
  process.exit(1);
}

const db = new Database(dbPath);
const activeFileRows = db.prepare("SELECT id, organization_id FROM files WHERE deleted_at IS NULL").all();
const activeFileIds = new Set(activeFileRows.map((row) => row.id));

console.log(`[OrphanVectorCleanup] Active file records in SQLite: ${activeFileIds.size}`);

const host = configuredHost.replace(/^https?:\/\//, "").replace(/\/+$/, "");

async function purgeOrphanVectors() {
  const orgs = db.prepare("SELECT id FROM organizations").all();
  const namespaces = ["global", "org_default", ...orgs.map((o) => o.id)];
  let totalPurged = 0;

  for (const ns of namespaces) {
    console.log(`[OrphanVectorCleanup] Scanning vector namespace: ${ns}...`);
    let paginationToken = undefined;
    const orphanVectorIds = [];

    do {
      const url = new URL(`https://${host}/vectors/list`);
      url.searchParams.set('namespace', ns);
      url.searchParams.set('limit', '100');
      if (paginationToken) url.searchParams.set('paginationToken', paginationToken);

      const res = await fetch(url.toString(), {
        headers: {
          'Api-Key': apiKey,
          'X-Pinecone-Api-Version': '2025-04',
        },
      });

      if (!res.ok) {
        console.warn(`[OrphanVectorCleanup] Could not list vectors for namespace ${ns}: ${res.statusText}`);
        break;
      }

      const data = await res.json();
      const vectors = data?.vectors || [];

      for (const vec of vectors) {
        // Vector ID format: ${fileId}_chunk-${chunkIndex}
        const fileId = vec.id.split('_chunk-')[0];
        if (!activeFileIds.has(fileId)) {
          orphanVectorIds.push(vec.id);
        }
      }

      paginationToken = data?.pagination?.next || undefined;
    } while (paginationToken);

    if (orphanVectorIds.length > 0) {
      console.log(`[OrphanVectorCleanup] Found ${orphanVectorIds.length} orphan vectors in namespace ${ns}. Deleting...`);
      for (let i = 0; i < orphanVectorIds.length; i += 1000) {
        const batch = orphanVectorIds.slice(i, i + 1000);
        const delRes = await fetch(`https://${host}/vectors/delete`, {
          method: 'POST',
          headers: {
            'Api-Key': apiKey,
            'Content-Type': 'application/json',
            'X-Pinecone-Api-Version': '2025-04',
          },
          body: JSON.stringify({ ids: batch, namespace: ns }),
        });
        if (delRes.ok) {
          totalPurged += batch.length;
        } else {
          console.warn(`[OrphanVectorCleanup] Batch delete failed for namespace ${ns}:`, await delRes.text());
        }
      }
    } else {
      console.log(`[OrphanVectorCleanup] No orphan vectors found in namespace ${ns}.`);
    }
  }

  console.log(`[OrphanVectorCleanup] Completed. Total orphan vectors purged: ${totalPurged}`);
  db.close();
}

purgeOrphanVectors().catch((err) => {
  console.error('[OrphanVectorCleanup] Unexpected failure:', err);
  process.exit(1);
});
