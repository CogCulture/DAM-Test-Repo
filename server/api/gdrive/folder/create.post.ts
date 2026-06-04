import { getGDriveAccessToken, createGDriveFolder, getGDriveConnection } from "~~/server/utils/gdrive";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const { parentId, folderName } = await readBody<{ parentId: string; folderName: string }>(event);

  if (!folderName || !parentId) {
    throw createError({ status: 400, message: "Parent ID and Folder name are required." });
  }

  const connection = await getGDriveConnection(user.id);
  if (!connection || connection.status !== "approved") {
    throw createError({ status: 403, message: "Google Drive folder hosting is not approved." });
  }

  const token = await getGDriveAccessToken(user.id);
  const targetParentId = parentId === "root" ? connection.folderId : parentId;
  const newFolder = await createGDriveFolder(token, targetParentId!, folderName);

  return { success: true, folder: newFolder };
});
