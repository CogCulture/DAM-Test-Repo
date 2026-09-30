import { verifyBucket } from "~~/server/utils/permission";
import { getFolder, getItemById, getBreadcrumb } from "~~/server/utils/db";
import {
  getGDriveAccessToken,
  getGDriveConnection,
  getGDriveItem,
} from "~~/server/utils/gdrive";
import { getFileType } from "~~/shared/utils/helper";
import { users } from "~~/server/database/schema";
import { eq, and } from "drizzle-orm";
import { useDrizzle } from "~~/server/utils/drizzle";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canView");
  const { id } = getRouterParams(event);
  const orgId = user?.organizationId || "org_default";

  if (!id) {
    throw createError({
      message: "Invalid request",
      status: 400,
    });
  }

  // 1. Try local SQLite files
  let file: any = (await getItemById(id, user.organizationId)) || (await getFolder(id, user.organizationId));

  if (file && (file.bucketName === bucket.name || file.bucketName === "org" || file.bucketName === "gdrive")) {
    let breadcrumb: any[] = [];
    if (file.path) {
      const fullCrumbs = await getBreadcrumb(file.bucketName || bucket.name, file.path);
      // Exclude the file itself from folder breadcrumb list if present
      breadcrumb = fullCrumbs.filter((item: any) => item.id !== file.id && item.name !== file.name);
    }

    // If breadcrumb is empty but parentId exists and is not root, traverse parentId
    if ((!breadcrumb || breadcrumb.length === 0) && file.parentId && file.parentId !== "root") {
      let currId: string | null = file.parentId;
      const chain: any[] = [];
      while (currId && currId !== "root" && chain.length < 15) {
        const parentFolder = await getFolder(currId, user.organizationId);
        if (!parentFolder) break;
        chain.unshift({
          id: parentFolder.id,
          name: parentFolder.name,
          visibility: parentFolder.visibility,
        });
        currId = parentFolder.parentId || null;
      }
      breadcrumb = chain;
    }

    return {
      ...file,
      breadcrumb,
    };
  }

  // 2. If not found in SQLite, check Google Drive
  let adminUserId = user.id;
  if (user.role !== "admin" && orgId) {
    const [orgAdmin] = await useDrizzle()
      .select()
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.role, "admin")));
    if (orgAdmin) adminUserId = orgAdmin.id;
  }

  const connection = await getGDriveConnection(adminUserId);
  if (connection && connection.status === "approved") {
    try {
      const token = await getGDriveAccessToken(adminUserId);
      const rootFolderId = connection.folderId;
      const driveItem = await getGDriveItem(token, id);

      if (driveItem && driveItem.name) {
        // Trace parents up to rootFolderId
        const parentChain: Array<{ id: string; name: string; visibility: string }> = [];
        let currParentId = driveItem.parents?.[0];
        const visited = new Set<string>();

        while (
          currParentId &&
          currParentId !== rootFolderId &&
          !visited.has(currParentId) &&
          parentChain.length < 15
        ) {
          visited.add(currParentId);
          try {
            const parentItem = await getGDriveItem(token, currParentId);
            if (!parentItem) break;
            parentChain.unshift({
              id: parentItem.id,
              name: parentItem.name,
              visibility: "inherit",
            });
            currParentId = parentItem.parents?.[0];
          } catch {
            break;
          }
        }

        const effectiveMimeType =
          driveItem.shortcutDetails?.targetMimeType || driveItem.mimeType;

        return {
          id: driveItem.id,
          name: driveItem.name,
          type: getFileType(effectiveMimeType),
          contentType: effectiveMimeType,
          size: driveItem.size ? parseInt(driveItem.size, 10) : 0,
          bucketName: "gdrive",
          storageProvider: "gdrive" as const,
          visibility: "private",
          path: driveItem.id,
          breadcrumb: parentChain,
          createdAt: driveItem.createdTime || new Date().toISOString(),
          updatedAt: driveItem.modifiedTime || new Date().toISOString(),
        };
      }
    } catch (gdriveErr) {
      console.warn("GDrive file lookup error for:", id, gdriveErr);
    }
  }

  throw createError({
    message: "File not found",
    status: 404,
  });
});
