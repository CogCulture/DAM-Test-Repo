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
  if (body.parentId === "root" && user.role !== "admin") {
    throw createError({ status: 403, message: "Only administrators can move files to the organization root." });
  }
  await requireFileDepartmentAccess(user, body.parentId);
  // 3. Perform the move
  return await moveItem(bucket.name, body.file.id, body.parentId);
});
