import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { users, organizations } from "~~/server/database/schema";
import { eq, sql } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  const db = useDrizzle();

  // Get all users
  const allUsers = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    approvalStatus: users.approvalStatus,
    organizationId: users.organizationId,
    departmentId: users.departmentId,
    status: users.status,
    provider: users.provider,
    avatar: users.avatar,
    createdAt: users.createdAt,
  }).from(users);

  // Build org lookup
  const allOrgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
  const orgMap: Record<string, string> = {};
  for (const o of allOrgs) orgMap[o.id] = o.name;

  return allUsers.map((u) => ({
    ...u,
    organizationName: u.organizationId ? (orgMap[u.organizationId] ?? "Unknown Org") : null,
  }));
});
