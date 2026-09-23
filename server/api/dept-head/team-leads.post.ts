import { eq, and } from "drizzle-orm";
import { users } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { requireDeptHead } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await requireDeptHead(event);

  const body = await readBody(event);
  if (!body || !body.userId) {
    throw createError({ status: 400, message: "User ID is required." });
  }

  const db = useDrizzle();
  
  // Verify target user is in the same org
  const [targetUser] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.id, body.userId),
      eq(users.organizationId, user.organizationId)
    ));

  if (!targetUser) {
    throw createError({ status: 404, message: "User not found in your department." });
  }

  await db
    .update(users)
    .set({ role: "team_lead" })
    .where(eq(users.id, body.userId));

  return { success: true };
});
