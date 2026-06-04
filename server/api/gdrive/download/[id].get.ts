import { getGDriveAccessToken } from "~~/server/utils/gdrive";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const { id } = getRouterParams(event);
  const token = await getGDriveAccessToken(user.id);

  try {
    const metadata = await $fetch<{ name: string; mimeType: string }>(
      `https://www.googleapis.com/drive/v3/files/${id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      throw createError({ status: response.status, message: "Failed to fetch file from Google Drive." });
    }

    setHeader(event, "Content-Type", metadata.mimeType);
    setHeader(event, "Content-Disposition", `attachment; filename="${encodeURIComponent(metadata.name)}"`);

    return response.body;
  } catch (err: any) {
    console.error("Download failed:", err);
    throw createError({ status: 502, message: "Download from Google Drive failed." });
  }
});
