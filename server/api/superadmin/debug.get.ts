import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { users, organizations } from "~~/server/database/schema";
import { sql } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  const db = useDrizzle();
  
  const allUsers = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    approvalStatus: users.approvalStatus,
    organizationId: users.organizationId,
    status: users.status,
    provider: users.provider,
  }).from(users);

  const allOrgs = await db.select({
    id: organizations.id,
    name: organizations.name,
  }).from(organizations);

  return { users: allUsers, orgs: allOrgs };
});
