import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { users, organizations } from "~~/server/database/schema";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  const { userId } = getRouterParams(event);
  const db = useDrizzle();

  const body = await readBody<{
    organizationId?: string | null;
    role?: string;
    approvalStatus?: string;
  }>(event);

  // Validate org if provided
  if (body.organizationId) {
    const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, body.organizationId));
    if (!org) throw createError({ status: 400, message: "Organization not found." });
  }

  const updates: Record<string, any> = {};
  if (body.organizationId !== undefined) updates.organizationId = body.organizationId;
  if (body.role) updates.role = body.role;
  if (body.approvalStatus) updates.approvalStatus = body.approvalStatus;

  if (Object.keys(updates).length === 0) {
    throw createError({ status: 400, message: "No updates provided." });
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  return { success: true };
});
