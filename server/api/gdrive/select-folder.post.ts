import { gdriveFolders } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { eq } from "drizzle-orm";

export interface SelectedDriveItem {
  id: string;
  name: string;
  type?: string;
}

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const body = await readBody<{
    items?: SelectedDriveItem[];
    folderId?: string;
    folderName?: string;
  }>(event);

  let folderId = body.folderId;
  let folderName = body.folderName;

  if (Array.isArray(body.items) && body.items.length > 0) {
    folderId = JSON.stringify(body.items);
    if (body.items.length === 1) {
      folderName = body.items[0].name;
    } else {
      const names = body.items.slice(0, 3).map((i) => i.name).join(", ");
      const extra = body.items.length > 3 ? ` +${body.items.length - 3} more` : "";
      folderName = `${body.items.length} items (${names}${extra})`;
    }
  }

  if (!folderId || !folderName) {
    throw createError({ status: 400, message: "Please select at least one file or folder to proceed." });
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
