import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Helper: Load .env variables
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
const sqlitePath = process.env.DATABASE_PATH || 'data/sqlite.db';

if (!databaseUrl) {
  console.error('\n❌ ERROR: DATABASE_URL is not set.');
  console.error('Please add your Supabase connection string to .env, e.g.:');
  console.error('DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres\n');
  process.exit(1);
}

const resolvedSqlitePath = resolve(sqlitePath);
if (!existsSync(resolvedSqlitePath)) {
  console.error(`\n❌ ERROR: SQLite file not found at ${resolvedSqlitePath}\n`);
  process.exit(1);
}

// Dynamically import postgres client
let postgres;
try {
  postgres = (await import('postgres')).default;
} catch {
  console.error('\n❌ The "postgres" driver package is required for migration.');
  console.error('Run: npm install postgres\n');
  process.exit(1);
}

const sqlite = new Database(resolvedSqlitePath, { readonly: true });
const sql = postgres(databaseUrl, {
  ssl: 'require',
  max: 5,
  prepare: false, // Required for Supabase transaction poolers
});

// Helper formatters
function toTimestamp(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    // If seconds vs ms
    const ms = val < 1e11 ? val * 1000 : val;
    return new Date(ms).toISOString();
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function toJson(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function toBool(val) {
  if (val === null || val === undefined) return null;
  return Boolean(val === 1 || val === true || val === '1' || val === 'true');
}

// ---------------------------------------------------------------------------
// Table Migration Definitions in Dependency Order
// ---------------------------------------------------------------------------
const tables = [
  {
    name: 'organizations',
    transform: (row) => ({
      id: row.id,
      name: row.name,
      status: row.status || 'active',
      org_type: row.org_type || 's3',
      setup_complete: toBool(row.setup_complete) ?? false,
      features: toJson(row.features),
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'org_departments',
    transform: (row) => ({
      id: row.id,
      organization_id: row.organization_id,
      name: row.name,
      parent_id: row.parent_id || null,
      folder_id: row.folder_id || null,
      gdrive_folder_id: row.gdrive_folder_id || null,
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'users',
    transform: (row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      avatar: row.avatar || null,
      country: row.country || null,
      status: row.status || 'active',
      provider: row.provider || null,
      role: row.role || 'team_member',
      department_id: row.department_id || null,
      organization_id: row.organization_id || null,
      approval_status: row.approval_status || 'pending',
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'user_organizations',
    transform: (row) => ({
      id: row.id,
      user_id: row.user_id,
      organization_id: row.organization_id,
      role: row.role || 'team_member',
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'user_department_access',
    transform: (row) => ({
      id: row.id,
      user_id: row.user_id,
      organization_id: row.organization_id,
      department_id: row.department_id,
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'dept_invites',
    transform: (row) => ({
      id: row.id,
      organization_id: row.organization_id,
      department_id: row.department_id,
      email: row.email,
      token: row.token,
      status: row.status || 'pending',
      expires_at: toTimestamp(row.expires_at),
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'org_permissions',
    transform: (row) => ({
      id: row.id,
      organization_id: row.organization_id,
      department_id: row.department_id || 'global',
      role: row.role,
      max_count: row.max_count || null,
      can_view: toBool(row.can_view) ?? true,
      can_upload: toBool(row.can_upload) ?? true,
      can_download: toBool(row.can_download) ?? true,
      can_delete: toBool(row.can_delete) ?? false,
      can_create_folder: toBool(row.can_create_folder) ?? false,
      can_approve_users: toBool(row.can_approve_users) ?? false,
      can_edit_nomenclature: toBool(row.can_edit_nomenclature) ?? false,
      can_share: toBool(row.can_share) ?? false,
      can_rename: toBool(row.can_rename) ?? false,
      can_edit_metadata: toBool(row.can_edit_metadata) ?? false,
      can_use_rag: toBool(row.can_use_rag) ?? false,
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'user_permission_overrides',
    transform: (row) => ({
      id: row.id,
      user_id: row.user_id,
      organization_id: row.organization_id,
      department_id: row.department_id,
      can_view: toBool(row.can_view),
      can_upload: toBool(row.can_upload),
      can_download: toBool(row.can_download),
      can_delete: toBool(row.can_delete),
      can_create_folder: toBool(row.can_create_folder),
      can_share: toBool(row.can_share),
      can_rename: toBool(row.can_rename),
      can_edit_metadata: toBool(row.can_edit_metadata),
      can_use_rag: toBool(row.can_use_rag),
      all_department_access: toBool(row.all_department_access) ?? false,
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'buckets',
    transform: (row) => ({
      id: row.id,
      name: row.name,
      user_id: row.user_id,
      organization_id: row.organization_id || 'org_default',
      size: row.size || 0,
      count: row.count || 0,
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'files',
    transform: (row) => ({
      id: row.id,
      name: row.name,
      content_type: row.content_type || 'application/octet-stream',
      type: row.type || 'file',
      size: row.size || 0,
      path: row.path,
      storage_path: row.storage_path || null,
      duplicate_of_id: row.duplicate_of_id || null,
      visibility: row.visibility || 'inherit',
      metadata: toJson(row.metadata),
      md5: row.md5 || null,
      asset_metadata: toJson(row.asset_metadata),
      tags: toJson(row.tags),
      custom_metadata: toJson(row.custom_metadata),
      preview: row.preview || null,
      dimensions: row.dimensions || null,
      count: row.count || 0,
      parent_id: row.parent_id || 'root',
      bucket_name: row.bucket_name,
      user_id: row.user_id,
      organization_id: row.organization_id || 'org_default',
      department_id: row.department_id || null,
      processing_status: row.processing_status || 'pending_processing',
      shared_count: row.shared_count || 0,
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
      deleted_at: toTimestamp(row.deleted_at),
    }),
    conflictKey: 'id',
  },
  {
    name: 'favorites',
    transform: (row) => ({
      file_id: row.file_id,
      user_id: row.user_id,
      organization_id: row.organization_id || 'org_default',
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
    }),
    conflictKey: 'file_id, user_id',
  },
  {
    name: 'shared',
    transform: (row) => ({
      file_id: row.file_id,
      user_id: row.user_id,
      role: row.role || 'viewer',
      organization_id: row.organization_id || 'org_default',
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
    }),
    conflictKey: 'file_id, user_id',
  },
  {
    name: 'website',
    transform: (row) => ({
      file_id: row.file_id,
      domain: row.domain,
      bucket_name: row.bucket_name,
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
    }),
    conflictKey: 'domain',
  },
  {
    name: 'nomenclatures',
    transform: (row) => ({
      department_id: row.department_id,
      organization_id: row.organization_id || 'org_default',
      template: row.template,
      segments: toJson(row.segments),
      allowed_extensions: toJson(row.allowed_extensions),
      folder_template: row.folder_template || null,
      folder_segments: toJson(row.folder_segments),
      updated_by: row.updated_by,
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
    }),
    conflictKey: 'department_id',
  },
  {
    name: 'folder_requests',
    transform: (row) => ({
      id: row.id,
      requested_by: row.requested_by,
      department_id: row.department_id,
      organization_id: row.organization_id || 'org_default',
      folder_name: row.folder_name,
      parent_id: row.parent_id || 'root',
      bucket_name: row.bucket_name,
      status: row.status || 'pending',
      reviewed_by: row.reviewed_by || null,
      reviewed_at: toTimestamp(row.reviewed_at),
      final_folder_name: row.final_folder_name || null,
      review_note: row.review_note || null,
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'gdrive_folders',
    transform: (row) => ({
      id: row.id,
      user_id: row.user_id,
      organization_id: row.organization_id || 'org_default',
      folder_id: row.folder_id || null,
      folder_name: row.folder_name || null,
      access_token: row.access_token,
      refresh_token: row.refresh_token || null,
      expires_at: row.expires_at || 0,
      status: row.status || 'pending',
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'byos_storage_configs',
    transform: (row) => ({
      id: row.id,
      user_id: row.user_id,
      organization_id: row.organization_id || null,
      provider: row.provider,
      access_key_id: row.access_key_id || null,
      secret_access_key: row.secret_access_key || null,
      bucket_name: row.bucket_name,
      region: row.region || null,
      endpoint: row.endpoint || null,
      project_id: row.project_id || null,
      client_email: row.client_email || null,
      private_key: row.private_key || null,
      gcs_connection_mode: row.gcs_connection_mode || null,
      gcs_access_token: row.gcs_access_token || null,
      gcs_refresh_token: row.gcs_refresh_token || null,
      gcs_token_expires_at: row.gcs_token_expires_at || null,
      status: row.status || 'pending',
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'organization_requests',
    transform: (row) => ({
      id: row.id,
      user_id: row.user_id,
      org_name: row.org_name,
      org_type: row.org_type || 's3',
      byos_config_id: row.byos_config_id || null,
      status: row.status || 'pending',
      review_note: row.review_note || null,
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'org_gdrive_rules',
    transform: (row) => ({
      id: row.id,
      organization_id: row.organization_id,
      enforce_nomenclature: toBool(row.enforce_nomenclature) ?? false,
      enforce_hierarchy: toBool(row.enforce_hierarchy) ?? false,
      allow_inter_dept_visibility: toBool(row.allow_inter_dept_visibility) ?? true,
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
      updated_at: toTimestamp(row.updated_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'permission_audit_logs',
    transform: (row) => ({
      id: row.id,
      organization_id: row.organization_id,
      actor_user_id: row.actor_user_id,
      target_user_id: row.target_user_id || null,
      target_role: row.target_role || null,
      department_id: row.department_id || null,
      changes: toJson(row.changes) || {},
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
  {
    name: 'pipeline_audit_logs',
    transform: (row) => ({
      id: row.id,
      organization_id: row.organization_id,
      department_id: row.department_id || null,
      file_id: row.file_id,
      event_type: row.event_type,
      stage: row.stage,
      status: row.status,
      details: toJson(row.details),
      created_at: toTimestamp(row.created_at) || new Date().toISOString(),
    }),
    conflictKey: 'id',
  },
];

// ---------------------------------------------------------------------------
// Main Migration Runner
// ---------------------------------------------------------------------------
async function runMigration() {
  console.log('🚀 Starting SQLite to Supabase PostgreSQL Migration...\n');
  console.log(`Source SQLite:   ${resolvedSqlitePath}`);
  console.log(`Target Supabase: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}\n`);

  const existingSqliteTables = new Set(
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name)
  );

  let totalMigrated = 0;

  for (const table of tables) {
    if (!existingSqliteTables.has(table.name)) {
      console.log(`⏩ Table "${table.name}" does not exist in SQLite, skipping.`);
      continue;
    }

    const rows = sqlite.prepare(`SELECT * FROM ${table.name}`).all();
    if (!rows || rows.length === 0) {
      console.log(`ℹ️  Table "${table.name}": 0 rows found in SQLite.`);
      continue;
    }

    process.stdout.write(`⏳ Migrating "${table.name}" (${rows.length} rows)... `);

    try {
      const transformed = rows.map(table.transform);

      // Insert in chunks of 50 to avoid oversized SQL queries
      const chunkSize = 50;
      let insertedCount = 0;

      for (let i = 0; i < transformed.length; i += chunkSize) {
        const chunk = transformed.slice(i, i + chunkSize);
        await sql`
          INSERT INTO ${sql(table.name)} ${sql(chunk)}
          ON CONFLICT (${sql(table.conflictKey.split(',').map((k) => k.trim()))})
          DO NOTHING
        `;
        insertedCount += chunk.length;
      }

      console.log(`✅ ${insertedCount} rows migrated.`);
      totalMigrated += insertedCount;
    } catch (err) {
      console.log(`❌ Failed: ${err.message}`);
    }
  }

  console.log(`\n🎉 Migration Complete! Total rows processed: ${totalMigrated}\n`);
  sqlite.close();
  await sql.end();
}

runMigration().catch((err) => {
  console.error('\n💥 Migration encountered a fatal error:\n', err);
  process.exit(1);
});
