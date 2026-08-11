import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { users } from "~~/server/database/schema";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  const { userId } = getRouterParams(event);
  const db = useDrizzle();

  // Remove the user from the database entirely
  await db.delete(users).where(eq(users.id, userId));

  return { success: true };
});
