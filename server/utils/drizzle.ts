import { drizzle } from "drizzle-orm/d1";
// @ts-ignore
import { hubDatabase } from "~~/node_modules/@nuxthub/core/dist/runtime/database/server/utils/database.js";
import * as schema from "../database/schema";
import { useSqliteDrizzle } from "./sqlite";

export { sql, eq, and, or } from "drizzle-orm";
export const tables = schema;

export function useDrizzle() {
  if (process.env.DATABASE_PATH) {
    return useSqliteDrizzle(process.env.DATABASE_PATH) as any;
  }
  return drizzle(hubDatabase(), { schema });
}

export type User = typeof schema.users.$inferSelect;

