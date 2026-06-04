import { getGDriveAccessToken, listGDriveFolder, getGDriveConnection } from "~~/server/utils/gdrive";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const { id } = getRouterParams(event);

  const connection = await getGDriveConnection(user.id);
  if (!connection || connection.status !== "approved") {
    throw createError({ status: 403, message: "Google Drive folder hosting is not approved." });
  }

  const token = await getGDriveAccessToken(user.id);
  const targetId = id === "root" ? connection.folderId : id;

  const rawFiles = await listGDriveFolder(token, targetId!);

  const data = rawFiles.map((file) => {
    const isFolder = file.mimeType === "application/vnd.google-apps.folder";
    return {
      id: file.id,
      name: file.name,
      type: isFolder ? "folder" : "file",
      contentType: file.mimeType,
      size: file.size ? parseInt(file.size, 10) : 0,
      path: file.id,
      visibility: "private",
      sharedCount: 0,
      count: 0,
      dimensions: null,
      preview: null,
      createdAt: file.createdTime ? new Date(file.createdTime) : new Date(),
      updatedAt: file.modifiedTime ? new Date(file.modifiedTime) : new Date(),
    };
  });

  return { data, nextPage: null };
});
