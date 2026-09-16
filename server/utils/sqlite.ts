import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "../database/schema";

let sqliteDatabase: Database.Database | undefined;
let sqliteDrizzle: ReturnType<typeof drizzle<typeof schema>> | undefined;
let activeDatabasePath: string | undefined;

const ensureColumnsExist = (db: Database.Database) => {
  const schemaDefinitions: Record<string, Record<string, string>> = {
    files: {
      duplicate_of_id: "TEXT",
      storage_path: "TEXT",
      md5: "TEXT",
      asset_metadata: "TEXT",
      tags: "TEXT",
      custom_metadata: "TEXT",
      preview: "TEXT",
      dimensions: "TEXT",
      count: "INTEGER DEFAULT 0 NOT NULL",
      parent_id: "TEXT DEFAULT 'root' NOT NULL",
      organization_id: "TEXT DEFAULT 'org_default' NOT NULL",
      department_id: "TEXT",
      processing_status: "TEXT DEFAULT 'pending_processing' NOT NULL",
      shared_count: "INTEGER DEFAULT 0 NOT NULL",
    },
    users: {
      organization_id: "TEXT DEFAULT 'org_default' NOT NULL",
      department_id: "TEXT",
      approval_status: "TEXT DEFAULT 'active' NOT NULL",
      role: "TEXT DEFAULT 'team_member' NOT NULL",
    },
    organizations: {
      status: "TEXT DEFAULT 'active' NOT NULL",
      org_type: "TEXT DEFAULT 's3' NOT NULL",
      setup_complete: "INTEGER DEFAULT 0 NOT NULL",
      features: "TEXT",
    },
    org_departments: {
      parent_id: "TEXT",
      folder_id: "TEXT",
      gdrive_folder_id: "TEXT",
    },
    nomenclatures: {
      allowed_extensions: "TEXT",
      folder_template: "TEXT",
      folder_segments: "TEXT",
    },
    user_permission_overrides: {
      all_department_access: "INTEGER DEFAULT 0 NOT NULL",
    },
    org_permissions: {
      max_count: "INTEGER",
      can_view: "INTEGER DEFAULT 1 NOT NULL",
      can_upload: "INTEGER DEFAULT 1 NOT NULL",
      can_download: "INTEGER DEFAULT 1 NOT NULL",
      can_delete: "INTEGER DEFAULT 0 NOT NULL",
      can_create_folder: "INTEGER DEFAULT 0 NOT NULL",
      can_approve_users: "INTEGER DEFAULT 0 NOT NULL",
      can_edit_nomenclature: "INTEGER DEFAULT 0 NOT NULL",
      can_share: "INTEGER DEFAULT 0 NOT NULL",
      can_rename: "INTEGER DEFAULT 0 NOT NULL",
      can_edit_metadata: "INTEGER DEFAULT 0 NOT NULL",
      can_use_rag: "INTEGER DEFAULT 0 NOT NULL",
    },
  };

  for (const [tableName, columns] of Object.entries(schemaDefinitions)) {
    try {
      const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
      if (!tableInfo || tableInfo.length === 0) continue;
      const existingColumnNames = new Set(tableInfo.map((col) => col.name));
      for (const [colName, colType] of Object.entries(columns)) {
        if (!existingColumnNames.has(colName)) {
          console.log(`[SQLite AutoMigration] Adding column '${colName}' to table '${tableName}'`);
          try {
            db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colType}`).run();
          } catch (err: any) {
            console.error(`[SQLite AutoMigration] Failed to add column '${colName}' to '${tableName}':`, err?.message);
          }
        }
      }
    } catch (err) {
      // Ignore if table does not exist
    }
  }
};

export const useSqliteDrizzle = (databasePath: string) => {
  const resolvedPath = resolve(databasePath);
  if (sqliteDrizzle && activeDatabasePath === resolvedPath) return sqliteDrizzle;
  if (sqliteDatabase && activeDatabasePath !== resolvedPath) sqliteDatabase.close();

  mkdirSync(dirname(resolvedPath), { recursive: true });
  sqliteDatabase = new Database(resolvedPath);
  sqliteDatabase.pragma("journal_mode = WAL");
  sqliteDatabase.pragma("foreign_keys = ON");
  ensureColumnsExist(sqliteDatabase);
  activeDatabasePath = resolvedPath;
  sqliteDrizzle = drizzle(sqliteDatabase, { schema });
  return sqliteDrizzle;
};
