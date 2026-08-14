import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "../database/schema";

let sqliteDatabase: Database.Database | undefined;
let sqliteDrizzle: ReturnType<typeof drizzle<typeof schema>> | undefined;
let activeDatabasePath: string | undefined;

export const useSqliteDrizzle = (databasePath: string) => {
  const resolvedPath = resolve(databasePath);
  if (sqliteDrizzle && activeDatabasePath === resolvedPath) return sqliteDrizzle;
  if (sqliteDatabase && activeDatabasePath !== resolvedPath) sqliteDatabase.close();

  mkdirSync(dirname(resolvedPath), { recursive: true });
  sqliteDatabase = new Database(resolvedPath);
  sqliteDatabase.pragma("journal_mode = WAL");
  sqliteDatabase.pragma("foreign_keys = ON");
  activeDatabasePath = resolvedPath;
  sqliteDrizzle = drizzle(sqliteDatabase, { schema });
  return sqliteDrizzle;
};
