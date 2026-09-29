import { ensureFile, moveItem, getFolder } from "~~/server/utils/db";
import { verifyBucket, requireFileDepartmentAccess } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canRename");
  const body = await readBody<{ file: { id: string }; parentId: string }>(event);

  if (!body.file?.id || !body.parentId) {
    throw createError({ status: 400, message: "File ID and destination folder ID are required." });
  }

  if (body.file.id === body.parentId) {
    throw createError({ status: 400, message: "Cannot move an item into itself." });
  }

  await ensureFile(bucket.name, body.file.id);
  await requireFileDepartmentAccess(user, body.file.id);
  if (body.parentId !== "root") {
    await requireFileDepartmentAccess(user, body.parentId);
  }
  // Perform the move
  return await moveItem(bucket.name, body.file.id, body.parentId);
});
