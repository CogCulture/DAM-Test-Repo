import { getGDriveAccessToken, getGDriveConnection } from "~~/server/utils/gdrive";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const connection = await getGDriveConnection(user.id);
  if (!connection || connection.status !== "approved") {
    throw createError({ status: 403, message: "Google Drive folder hosting is not approved." });
  }

  const token = await getGDriveAccessToken(user.id);
  const query = getQuery(event);
  const rawParentId = (query.parentId as string) || "root";
  const parentId = rawParentId === "root" ? connection.folderId : rawParentId;

  const filesData = await readMultipartFormData(event);
  if (!filesData || filesData.length === 0) {
    throw createError({ status: 400, message: "No files uploaded." });
  }

  for (const part of filesData) {
    if (!part.filename) continue;

    const metadata = {
      name: part.filename,
      parents: [parentId],
    };

    const boundary = "-------314159265358979323846";
    const part1Header = `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n`;
    
    const part2Header = `--${boundary}\r\n` +
      `Content-Type: ${part.type || "application/octet-stream"}\r\n\r\n`;

    const closeDelimiter = `\r\n--${boundary}--`;

    const encoder = new TextEncoder();
    const bodyHeader = encoder.encode(part1Header + part2Header);
    const bodyFooter = encoder.encode(closeDelimiter);
    const fileData = new Uint8Array(part.data);

    const multipartBody = new Uint8Array(bodyHeader.byteLength + fileData.byteLength + bodyFooter.byteLength);
    multipartBody.set(bodyHeader, 0);
    multipartBody.set(fileData, bodyHeader.byteLength);
    multipartBody.set(bodyFooter, bodyHeader.byteLength + fileData.byteLength);

    try {
      await $fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      });
    } catch (err: any) {
      console.error("Google Drive API upload failed:", err?.data || err);
      throw createError({ status: 502, message: `Upload failed for ${part.filename}.` });
    }
  }

  return { success: true };
});
