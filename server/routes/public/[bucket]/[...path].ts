import { getFile, getFolder, getItemById, isParentPublic } from "~~/server/utils/db";
import { localBlob } from "~~/server/utils/localBlob";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files } from "~~/server/database/schema";
import { and, eq, isNull } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event);
  if (!params.path) {
    throw createError({
      status: 404,
      message: "Page not found",
    });
  }

  const rawPath = decodeURIComponent(params.path);
  const fullPath = params.bucket + "/" + rawPath;

  // Resolve file by ID first, then by full path (bucket/path), then by path, then by name
  let file = (await getItemById(rawPath)) || (await getFolder(rawPath));
  if (!file) {
    file = await getFile(params.bucket, fullPath);
  }
  if (!file) {
    file = await getFile(params.bucket, rawPath);
  }
  if (!file) {
    const db = useDrizzle();
    const matches = await db.select().from(files).where(and(
      eq(files.bucketName, params.bucket),
      eq(files.name, rawPath),
      isNull(files.deletedAt),
    )).limit(1);
    file = matches[0] || null;
  }

  if (!file) {
    throw createError({
      status: 404,
      message: "File not found",
    });
  }

  // Check if the file itself or any parent folder is public
  let isPublic = file.visibility === "public";
  if (!isPublic) {
    isPublic = await isParentPublic(params.bucket, rawPath);
  }

  if (!isPublic) {
    throw createError({
      status: 403,
      message: "This asset is private. Public access is not permitted.",
    });
  }

  if (file.type === "folder") {
    const indexFile = await getFile(params.bucket, `${rawPath}/index.html`);
    if (indexFile) {
      return await localBlob().serve(
        event,
        indexFile.storagePath || `${params.bucket}/${rawPath}/index.html`
      );
    }
    throw createError({
      status: 400,
      message: "Folder does not contain an index.html file to serve.",
    });
  }

  return await localBlob().serve(event, file.storagePath || file.path || `${params.bucket}/${rawPath}`);
});
