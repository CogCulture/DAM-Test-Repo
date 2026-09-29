import { createOrganization, getUser } from "~~/server/utils/db";
import { organizations, users } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const body = await readBody<{ name?: string; orgType?: "s3" | "gdrive" }>(event);

  if (!body?.name?.trim()) {
    throw createError({ status: 400, message: "Organization name is required." });
  }

  const name = body.name.trim();
  const orgType = body.orgType || "s3";
  const db = useDrizzle();

  // Check unique name
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, name))
    .limit(1);

  if (existing.length > 0) {
    throw createError({ status: 409, message: "An organization with this name already exists." });
  }

  // Create new organization with clean slate and link user as admin in user_organizations
  const newOrgId = await createOrganization(name, orgType, user.id);

  // Update user's active organizationId in database
  await db
    .update(users)
    .set({ organizationId: newOrgId, role: "admin", departmentId: null })
    .where(eq(users.id, user.id));

  // Refresh user session with new organization
  const updatedUser = await getUser(user.id);
  if (updatedUser) {
    await setUserSession(event, { user: updatedUser });
  }

  return {
    success: true,
    organizationId: newOrgId,
    name,
    orgType,
  };
});
