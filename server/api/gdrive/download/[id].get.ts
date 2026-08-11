import { requireFilePermission } from "~~/server/utils/permission";
import { and, eq } from "drizzle-orm";
import { users } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { getGDriveAccessToken, getGDriveConnection } from "~~/server/utils/gdrive";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canDownload");
  const { id } = getRouterParams(event);
  const query = getQuery(event);
  const orgId = (user as any).organizationId;

  let credentialUserId = user.id;
  if ((user as any).role !== "admin" && orgId) {
    const [orgAdmin] = await useDrizzle()
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.role, "admin")));
    if (orgAdmin) credentialUserId = orgAdmin.id;
  }

  const connection = await getGDriveConnection(credentialUserId);
  if (!connection || connection.status !== "approved") {
    throw createError({ status: 403, message: "Google Drive folder hosting is not approved." });
  }

  const token = await getGDriveAccessToken(credentialUserId);

  try {
    const requestedMetadata = await $fetch<{ name: string; mimeType: string; shortcutDetails?: { targetId: string } }>(
      `https://www.googleapis.com/drive/v3/files/${id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        query: { fields: "name,mimeType,shortcutDetails(targetId)" },
        timeout: 15000,
      }
    );

    let downloadFileId = id;
    let metadata: { name: string; mimeType: string } = requestedMetadata;
    if (requestedMetadata.shortcutDetails?.targetId) {
      downloadFileId = requestedMetadata.shortcutDetails.targetId;
      const targetMetadata = await $fetch<{ name: string; mimeType: string }>(
        `https://www.googleapis.com/drive/v3/files/${downloadFileId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          query: { fields: "name,mimeType" },
          timeout: 15000,
        },
      );
      metadata = { ...targetMetadata, name: requestedMetadata.name };
    }

    const driveHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    const range = getHeader(event, "range");
    if (range) driveHeaders.Range = range;

    const exportTypes: Record<string, { mime: string; extension: string }> = {
      "application/vnd.google-apps.document": {
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extension: ".docx",
      },
      "application/vnd.google-apps.spreadsheet": {
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: ".xlsx",
      },
      "application/vnd.google-apps.presentation": {
        mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        extension: ".pptx",
      },
      "application/vnd.google-apps.drawing": {
        mime: "image/png",
        extension: ".png",
      },
    };
    const exportType = exportTypes[metadata.mimeType];
    if (metadata.mimeType === "application/vnd.google-apps.folder") {
      throw createError({
        status: 400,
        message: "Folders cannot be downloaded as a single file.",
      });
    }
    const downloadUrl = exportType
      ? `https://www.googleapis.com/drive/v3/files/${downloadFileId}/export?mimeType=${encodeURIComponent(exportType.mime)}`
      : `https://www.googleapis.com/drive/v3/files/${downloadFileId}?alt=media`;

    const response = await fetch(
      downloadUrl,
      {
        headers: driveHeaders,
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      throw createError({ status: response.status, message: "Failed to fetch file from Google Drive." });
    }

    const disposition = query.inline === "true" ? "inline" : "attachment";
    setResponseStatus(event, response.status);
    const fileName = exportType && !metadata.name.toLowerCase().endsWith(exportType.extension)
      ? `${metadata.name}${exportType.extension}`
      : metadata.name;
    setHeader(event, "Content-Type", exportType?.mime || metadata.mimeType || "application/octet-stream");
    setHeader(event, "Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    setHeader(event, "Accept-Ranges", response.headers.get("accept-ranges") || "bytes");
    setHeader(event, "Cache-Control", "private, max-age=60");

    const contentRange = response.headers.get("content-range");
    const contentLength = response.headers.get("content-length");
    if (contentRange) setHeader(event, "Content-Range", contentRange);
    if (contentLength) setHeader(event, "Content-Length", Number(contentLength));

    if (!response.body) {
      throw createError({ status: 502, message: "Google Drive returned an empty file response." });
    }
    return sendStream(event, response.body as any);
  } catch (err: any) {
    console.error("Google Drive preview/download failed:", err?.message || err);
    throw createError({ status: err?.status || err?.statusCode || 502, message: "Preview/download from Google Drive failed." });
  }
});