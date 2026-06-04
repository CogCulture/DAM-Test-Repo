import { gdriveFolders } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { requireMinRole } from "~~/server/utils/permission";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireMinRole(event, "admin");

  const db = useDrizzle();
  const requests = await db
    .select()
    .from(gdriveFolders)
    .where(eq(gdriveFolders.status, "pending"));

  return requests;
});
