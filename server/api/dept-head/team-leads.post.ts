import { eq, and } from "drizzle-orm";
import { users } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { requireDeptHead } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await requireDeptHead(event);
  
  if (user.role !== "dept_head") {
    throw createError({ status: 403, message: "Forbidden: Department heads only." });
  }

  const body = await readBody(event);
  if (!body || !body.userId) {
    throw createError({ status: 400, message: "User ID is required." });
  }

  const db = useDrizzle();
  
  // Verify target user is in the same org and department
  const [targetUser] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.id, body.userId),
      eq(users.organizationId, user.organizationId),
      eq(users.departmentId, user.departmentId)
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
