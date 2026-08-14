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
          q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents",
          fields: "files(id, name, createdTime)",
          orderBy: "name",
          pageSize: 100,
        },
      }
    );
    return response.files || [];
  } catch (err: any) {
    console.error("List folders failed:", err?.data || err);
    throw createError({ status: 502, message: "Failed to list folders from Google Drive." });
  }
});
