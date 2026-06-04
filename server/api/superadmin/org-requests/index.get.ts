import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { organizationRequests, users } from "~~/server/database/schema";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);

  const db = useDrizzle();

  const requests = await db
    .select({
      id: organizationRequests.id,
      userId: organizationRequests.userId,
      orgName: organizationRequests.orgName,
      orgType: organizationRequests.orgType,
      status: organizationRequests.status,
      reviewNote: organizationRequests.reviewNote,
      createdAt: organizationRequests.createdAt,
      userName: users.name,
      userEmail: users.email,
      userAvatar: users.avatar,
    })
    .from(organizationRequests)
    .leftJoin(users, eq(organizationRequests.userId, users.id))
    .where(eq(organizationRequests.status, "pending"))
    .orderBy(organizationRequests.createdAt);

  return requests;
});
