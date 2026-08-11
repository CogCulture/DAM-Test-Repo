import { eq } from "drizzle-orm";
import { organizations } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  
  if (user.role !== "admin") {
    throw createError({ status: 403, message: "Forbidden: Admins only." });
  }

  const orgId = user.organizationId;
  if (!orgId) {
    throw createError({ status: 400, message: "User is not associated with an organization." });
  }

  const db = useDrizzle();
  await db
    .update(organizations)
    .set({
      setupComplete: true,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  return { success: true };
});
