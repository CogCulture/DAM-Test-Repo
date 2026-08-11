import { verifyBucket } from "~~/server/utils/permission";

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
  let deletedAt;
  if (query.trashed) {
    deletedAt = new Date(query.trashed as string);
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
    const filePath = deletedAt
      ? `.trash/${params.bucket}/${deletedAt.toISOString()}/${fullPath}`
      : (file.storagePath || fullPath);
    return await localBlob().serve(event, filePath);
  } else {
    throw createError({
      status: 404,
      message: "Not a File",
    });
  }
});
