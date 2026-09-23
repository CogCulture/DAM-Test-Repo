import { verifyBucket } from "~~/server/utils/permission";
import { formatTrashTimestamp } from "~~/shared/utils/helper";

export default defineEventHandler(async (event) => {
  await verifyBucket(event);
  const params = getRouterParams(event);
  const query = getQuery(event);
  if (!params.path) {
    throw createError({
      status: 404,
      message: "Page not found",
    });
  }
  let deletedAt: Date | undefined;
  if (query.trashed) {
    deletedAt = new Date(query.trashed as string);
    if (Number.isNaN(deletedAt.getTime())) {
      throw createError({
        status: 400,
        message: "Invalid trashed date parameter.",
      });
    }
  }
  const fullPath = params.bucket + "/" + decodeURIComponent(params.path);
  const file = await getFile(params.bucket, fullPath, deletedAt);
  if (!file) {
    throw createError({
      status: 404,
      message: "Page not found",
    });
  }
  if (file.type !== "folder") {
    let filePath = file.storagePath || fullPath;
    if (deletedAt) {
      const safeTime = formatTrashTimestamp(deletedAt);
      const safePath = `.trash/${params.bucket}/${safeTime}/${fullPath}`;
      filePath = (await localBlob().head(safePath))
        ? safePath
        : `.trash/${params.bucket}/${deletedAt.toISOString()}/${fullPath}`;
    }
    return await localBlob().serve(event, filePath);
  } else {
    throw createError({
      status: 404,
      message: "Not a File",
    });
  }
});
