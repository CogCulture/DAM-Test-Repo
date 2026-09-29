import { getGDriveAccessToken } from "~~/server/utils/gdrive";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const token = await getGDriveAccessToken(user.id);

  try {
    const response = await $fetch<{ files: any[] }>(
      "https://www.googleapis.com/drive/v3/files",
      {
        headers: { Authorization: `Bearer ${token}` },
        query: {
          q: "trashed = false and 'root' in parents",
          fields: "files(id, name, mimeType, size, createdTime)",
          orderBy: "folder,name",
          pageSize: 200,
        },
      }
    );

    const items = (response.files || []).map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size ? Number(file.size) : null,
      type: file.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file",
      mimeType: file.mimeType,
      createdTime: file.createdTime,
    }));

    return items;
  } catch (err: any) {
    console.error("List drive items failed:", err?.data || err);
    throw createError({ status: 502, message: "Failed to list items from Google Drive." });
  }
});
