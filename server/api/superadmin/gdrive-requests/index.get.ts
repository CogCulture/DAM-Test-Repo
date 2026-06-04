import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { gdriveFolders, users } from "~~/server/database/schema";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);

  const db = useDrizzle();

  // Get all pending GDrive requests with user info
  const requests = await db
    .select({
      id: gdriveFolders.id,
      userId: gdriveFolders.userId,
      organizationId: gdriveFolders.organizationId,
      folderId: gdriveFolders.folderId,
      folderName: gdriveFolders.folderName,
      status: gdriveFolders.status,
      createdAt: gdriveFolders.createdAt,
      userName: users.name,
      userEmail: users.email,
      userAvatar: users.avatar,
    })
    .from(gdriveFolders)
    .leftJoin(users, eq(gdriveFolders.userId, users.id))
    .where(eq(gdriveFolders.status, "pending"));

  return requests;
});
