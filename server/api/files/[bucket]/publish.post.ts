import { ensureFile, setVisibility } from "~~/server/utils/db";
import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files } from "~~/server/database/schema";
import { eq, or } from "drizzle-orm";
import { getGDriveAccessToken, getGDriveItem } from "~~/server/utils/gdrive";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canShare");
  const body = await readBody<{ id?: string; visibility?: string; name?: string; type?: string }>(event);

  if (!body?.id || !["public", "private", "inherit"].includes(String(body.visibility))) {
    throw createError({
      status: 400,
      message: "A valid file ID and visibility are required.",
    });
  }

  const db = useDrizzle();
  const fileId = String(body.id).trim();
  const targetVisibility = String(body.visibility);

  // 1. Locate file in database by ID, path, or storagePath
  let [fileRecord] = await db
    .select()
    .from(files)
    .where(or(
      eq(files.id, fileId),
      eq(files.path, fileId),
      eq(files.storagePath, fileId),
    ))
    .limit(1);

  // 2. If not found in SQLite, check if it's a Google Drive asset
  if (!fileRecord) {
    try {
      const token = await getGDriveAccessToken(user.id);
      const gItem = await getGDriveItem(token, fileId);
      if (gItem && gItem.id) {
        const now = new Date();
        await db.insert(files).values({
          id: gItem.id,
          name: gItem.name || body.name || "GDrive File",
          contentType: gItem.mimeType || "application/octet-stream",
          type: gItem.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file",
          size: gItem.size ? parseInt(gItem.size, 10) : 0,
          path: gItem.id,
          storagePath: null,
          bucketName: "gdrive",
          userId: user.id,
          organizationId: user.organizationId || "org_default",
          visibility: targetVisibility,
          createdAt: now,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: files.id,
          set: {
            visibility: targetVisibility,
            updatedAt: now,
          },
        });

        return { status: "success", file: gItem.id, visibility: targetVisibility };
      }
    } catch {
      // Fallback: file may be an asset being referenced by ID
    }
  }

  if (!fileRecord) {
    throw createError({
      status: 404,
      message: "File not found",
    });
  }

  // 3. Check department access for non-admins
  if (user.role !== "admin") {
    await requireFileDepartmentAccess(user, fileRecord.id);
  }

  // 4. Update visibility in SQLite
  await db
    .update(files)
    .set({
      visibility: targetVisibility,
      deletedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(files.id, fileRecord.id));

  return { status: "success", file: fileRecord.id, visibility: targetVisibility };
});