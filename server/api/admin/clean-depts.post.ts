import { eq, and, isNull } from "drizzle-orm";
import { orgDepartments, organizations } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { requireMinRole } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await requireMinRole(event, "admin");
  
  const orgId = user.organizationId;
  if (!orgId) {
    throw createError({ status: 400, message: "User is not associated with an organization." });
  }

  const db = useDrizzle();

  // Delete all department rows for this organization where gdriveFolderId is null
  const deleted = await db
    .delete(orgDepartments)
    .where(and(
      eq(orgDepartments.organizationId, orgId),
      isNull(orgDepartments.gdriveFolderId)
    ))
    .returning();

  // Reset setupComplete to false so they can run the wizard cleanly
  await db
    .update(organizations)
    .set({
      setupComplete: false,
      updatedAt: new Date()
    })
    .where(eq(organizations.id, orgId));

  // Refresh session
  await setUserSession(event, { user: { ...user, setupComplete: false } });

  return {
    success: true,
    deletedCount: deleted.length,
    message: "Auto-populated default departments cleared and setup wizard reset."
  };
});
