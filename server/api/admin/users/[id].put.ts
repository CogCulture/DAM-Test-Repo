import { useDrizzle } from "~~/server/utils/drizzle";
import { users } from "~~/server/database/schema";
import { eq } from "drizzle-orm";
import { canManageUser } from "~~/shared/utils/access-control";
import { getApprovedUser } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const actor = await getApprovedUser(event);

  const userId = event.context.params?.id;
  if (!userId) {
    throw createError({ status: 400, message: "User ID is required" });
  }

  const body = await readBody(event);
  const { role, departmentId } = body;

  const db = useDrizzle();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) {
    throw createError({ status: 404, message: "User not found." });
  }

  const requestedRole = role === undefined ? target.role : String(role);
  const requestedDepartmentId = departmentId === undefined
    ? target.departmentId
    : (departmentId || null);
  const decision = canManageUser(actor, target, requestedRole, requestedDepartmentId);
  if (!decision.allowed) {
    throw createError({ status: 403, message: decision.reason });
  }

  const updateData: { role?: string; departmentId?: string | null } = {};
  if (role !== undefined) updateData.role = role;
  if (departmentId !== undefined) updateData.departmentId = departmentId || null;

  if (!Object.keys(updateData).length) {
    return { success: true, user: target };
  }

  const [updated] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();

  return { success: true, user: updated };
});
