/**
 * POST /api/gdrive/move
 *
 * Moves a Google Drive file or folder to a different parent folder.
 *
 * Body: { fileId: string, targetFolderId: string, currentParentId?: string }
 */
import { requireFilePermission } from "~~/server/utils/permission";
import { getGDriveUploadAccess } from "~~/server/utils/gdrive-access";
import { useDrizzle } from "~~/server/utils/drizzle";
import { users } from "~~/server/database/schema";
import { eq, and } from "drizzle-orm";
import { getGDriveAccessToken, getGDriveConnection } from "~~/server/utils/gdrive";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canRename");
  const body = await readBody<{
    fileId: string;
    targetFolderId: string;
    currentParentId?: string;
  }>(event);

  if (!body?.fileId || !body?.targetFolderId) {
    throw createError({ status: 400, message: "fileId and targetFolderId are required." });
  }

  if (body.fileId === body.targetFolderId) {
    throw createError({ status: 400, message: "Cannot move an item into itself." });
  }

  const orgId = (user as any).organizationId;
  const db = useDrizzle();

  // Find admin credentials for Google Drive
  let adminUserId = user.id;
  if (user.role !== "admin" && orgId) {
    const [admin] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.role, "admin")));
    if (admin) adminUserId = admin.id;
  }

  const connection = await getGDriveConnection(adminUserId);
  if (!connection || connection.status !== "approved" || !connection.folderId) {
    throw createError({ status: 403, message: "Google Drive is not connected or approved." });
  }

  const token = await getGDriveAccessToken(adminUserId);

  let targetId = body.targetFolderId;
  if (targetId === "root") {
    targetId = connection.folderId;
  }

  // 1. Get current parents if not provided
  let removeParents = body.currentParentId ? [body.currentParentId] : [];
  let itemName = "item";

  try {
    const fileMeta = await $fetch<{ id: string; name: string; parents?: string[] }>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(body.fileId)}?fields=id,name,parents`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    itemName = fileMeta.name || "item";
    if (!removeParents.length && fileMeta.parents?.length) {
      removeParents = fileMeta.parents;
    }
  } catch (err: any) {
    console.error("[GDrive Move] Failed to fetch file metadata:", err);
    throw createError({
      status: 404,
      message: `File or folder not found on Google Drive: ${err?.data?.error?.message || err?.message}`,
    });
  }

  if (removeParents.includes(targetId)) {
    return { success: true, message: `"${itemName}" is already in this folder.` };
  }

  // 2. Perform the move in Google Drive by updating parents
  const removeParentsParam = removeParents.filter(Boolean).join(",");
  const queryParams = new URLSearchParams({
    addParents: targetId,
    fields: "id,name,parents",
    enforceSingleParent: "true",
  });
  if (removeParentsParam) {
    queryParams.set("removeParents", removeParentsParam);
  }

  try {
    const updated = await $fetch<any>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(body.fileId)}?${queryParams.toString()}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );

    return {
      success: true,
      file: {
        id: updated.id,
        name: updated.name,
        parents: updated.parents,
      },
    };
  } catch (err: any) {
    const msg = err?.data?.error?.message || err?.message || "Failed to move file in Google Drive.";
    console.error("[GDrive Move] PATCH failed:", msg);
    throw createError({ status: 502, message: `Google Drive move failed: ${msg}` });
  }
});
