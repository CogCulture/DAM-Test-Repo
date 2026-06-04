import { gdriveFolders } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const db = useDrizzle();
  const connections = await db
    .select()
    .from(gdriveFolders)
    .where(eq(gdriveFolders.userId, user.id));

  if (!connections || connections.length === 0) {
    return { status: "not_connected" };
  }

  return {
    status: connections[0].status,
    folderName: connections[0].folderName,
    folderId: connections[0].folderId,
  };
});
