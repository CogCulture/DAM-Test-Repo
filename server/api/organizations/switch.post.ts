import { getUser } from "~~/server/utils/db";
import { organizations, userOrganizations, users } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { eq, and } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const body = await readBody<{ organizationId?: string }>(event);

  if (!body?.organizationId) {
    throw createError({ status: 400, message: "Target organization ID is required." });
  }

  const targetOrgId = body.organizationId;
  const db = useDrizzle();

  // Check target organization exists
  const [targetOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, targetOrgId));

  if (!targetOrg) {
    throw createError({ status: 404, message: "Organization not found." });
  }

  // Check membership unless platform admin/superadmin
  let targetRole = "team_member";
  if (user.role === "admin" || user.role === "superadmin") {
    targetRole = "admin";
  } else {
    const [membership] = await db
      .select({ role: userOrganizations.role })
      .from(userOrganizations)
      .where(and(
        eq(userOrganizations.userId, user.id),
        eq(userOrganizations.organizationId, targetOrgId)
      ));

    if (!membership) {
      throw createError({ status: 403, message: "You do not have access to this organization." });
    }
    targetRole = membership.role;
  }

  // Update user's active organizationId and role in database
  await db
    .update(users)
    .set({ organizationId: targetOrgId, role: targetRole, departmentId: null })
    .where(eq(users.id, user.id));

  // Refresh user session with new active organization
  const updatedUser = await getUser(user.id);
  if (updatedUser) {
    await setUserSession(event, { user: updatedUser });
  }

  return {
    success: true,
    organizationId: targetOrgId,
    organizationName: targetOrg.name,
    role: targetRole,
  };
});
