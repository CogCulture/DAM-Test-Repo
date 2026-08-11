import { requireFilePermission } from "~~/server/utils/permission";
import { getGDriveAccessToken, deleteGDriveItem, getGDriveConnection } from "~~/server/utils/gdrive";
import { deletePineconeFileVectors } from "~~/server/utils/pinecone";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files, users } from "~~/server/database/schema";
import { and, eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canDelete");
  const { id } = getRouterParams(event);
  const organizationId = (user as any).organizationId || "org_default";
  const db = useDrizzle();

  let driveOwnerId = user.id;
  if (user.role !== "admin" && organizationId !== "org_default") {
    const [orgAdmin] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.role, "admin")));
    if (orgAdmin) driveOwnerId = orgAdmin.id;
  }

  const connection = await getGDriveConnection(driveOwnerId);
  if (!connection || connection.status !== "approved") {
    throw createError({ status: 403, message: "Google Drive folder hosting is not approved." });
  }

  const token = await getGDriveAccessToken(driveOwnerId);
  await deleteGDriveItem(token, id);

  await Promise.all([
    deletePineconeFileVectors(id, organizationId).catch((error) => {
      console.warn(`Failed to remove Pinecone vectors for ${id}:`, error);
      return 0;
    }),
    db.update(files)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(files.id, id), eq(files.organizationId, organizationId))),
  ]);

  return { success: true };
});
