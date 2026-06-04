import { gdriveFolders } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const { folderId, folderName } = await readBody<{
    folderId: string;
    folderName: string;
  }>(event);

  if (!folderId || !folderName) {
    throw createError({ status: 400, message: "Folder selection is required." });
  }

  const db = useDrizzle();
  await db
    .update(gdriveFolders)
    .set({
      folderId,
      folderName,
      status: "pending",
      updatedAt: new Date(),
    })
    .where(eq(gdriveFolders.userId, user.id));

  return { success: true };
});
