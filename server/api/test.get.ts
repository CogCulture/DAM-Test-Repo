import { sql } from "drizzle-orm";
import { useDrizzle } from "~~/server/utils/drizzle";

export default defineEventHandler(async (event) => {
  const result = await useDrizzle().all(sql`SELECT id, name, type, parent_id, path, created_at, deleted_at FROM files ORDER BY created_at DESC LIMIT 20`);
  return result;
});
