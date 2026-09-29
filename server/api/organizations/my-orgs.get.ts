import { eq, inArray } from "drizzle-orm";
import { organizations, userOrganizations } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const db = useDrizzle();

  // Find all organizations user is linked to in userOrganizations table
  const memberships = await db
    .select({
      organizationId: userOrganizations.organizationId,
      role: userOrganizations.role,
    })
    .from(userOrganizations)
    .where(eq(userOrganizations.userId, user.id));

  const memberOrgIds = new Set(memberships.map((m) => m.organizationId));
  if (user.organizationId) {
    memberOrgIds.add(user.organizationId);
  }

  // If superadmin or admin, also load all organizations so platform admins can switch easily
  let orgList: any[] = [];
  if (user.role === "superadmin" || user.role === "admin") {
    orgList = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        orgType: organizations.orgType,
        status: organizations.status,
      })
      .from(organizations);
  } else if (memberOrgIds.size > 0) {
    orgList = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        orgType: organizations.orgType,
        status: organizations.status,
      })
      .from(organizations)
      .where(inArray(organizations.id, Array.from(memberOrgIds)));
  }

  const roleMap = new Map(memberships.map((m) => [m.organizationId, m.role]));

  const result = orgList.map((org) => ({
    id: org.id,
    name: org.name,
    orgType: org.orgType,
    status: org.status,
    role: roleMap.get(org.id) || (user.role === "admin" ? "admin" : "team_member"),
    isCurrent: org.id === user.organizationId,
  }));

  return {
    currentOrganizationId: user.organizationId,
    organizations: result,
  };
});
