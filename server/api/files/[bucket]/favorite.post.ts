import { eq } from "drizzle-orm";
import { files } from "~~/server/database/schema";
import { ensureFile, setFavorite, unsetFavorite } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { verifyBucket } from "~~/server/utils/permission";

type FavoriteAssetInput = {
  id?: string;
  name?: string;
  contentType?: string;
  type?: string;
  size?: number;
  storageProvider?: string;
  bucketName?: string;
  createdAt?: string;
  updatedAt?: string;
};

const cleanName = (value: unknown) =>
  String(value || "Google Drive asset")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .slice(0, 255) || "Google Drive asset";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canView");
  const userId = user.id;
  const body = await readBody<{
    file?: string | FavoriteAssetInput;
    add?: boolean;
  }>(event);
  const fileInput = body.file;
  const fileId = typeof fileInput === "string" ? fileInput : fileInput?.id;

  if (!fileId || typeof fileId !== "string" || typeof body.add !== "boolean") {
    throw createError({
      status: 400,
      message: "File ID and favorite state are required.",
    });
  }
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(fileId)) {
    throw createError({ status: 400, message: "Invalid file ID." });
  }

  const isDriveAsset =
    typeof fileInput === "object" &&
    (fileInput.storageProvider === "gdrive" || fileInput.bucketName === "gdrive");

  if (isDriveAsset && body.add) {
    const db = useDrizzle();
    const [existing] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
    const now = new Date();
    const metadata = {
      source: "google-drive",
      googleDriveFileId: fileId,
      storageProvider: "gdrive",
    };
    const values = {
      id: fileId,
      name: cleanName(fileInput.name),
      contentType: String(fileInput.contentType || "application/octet-stream").slice(0, 255),
      type: String(fileInput.type || "other").slice(0, 64),
      size: Math.max(0, Number.isFinite(Number(fileInput.size)) ? Number(fileInput.size) : 0),
      path: `gdrive/${fileId}`,
      visibility: "private",
      assetMetadata: metadata,
      parentId: "root",
      bucketName: bucket.name,
      userId,
      organizationId: (user as any).organizationId || bucket.organizationId || "org_default",
      updatedAt: now,
    };

    if (!existing) {
      await db.insert(files).values({
        ...values,
        createdAt: fileInput.createdAt ? new Date(fileInput.createdAt) : now,
      });
    } else if ((existing.assetMetadata as any)?.source === "google-drive") {
      await db.update(files).set(values).where(eq(files.id, fileId));
    }
  }

  await ensureFile(bucket.name, fileId);
  if (body.add) await setFavorite(userId, fileId);
  else await unsetFavorite(userId, fileId);

  return { status: "success", file: fileId, isFavorite: body.add };
});