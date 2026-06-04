import { ensureFile, copyItem } from "~~/server/utils/db";
import { verifyBucket, getFileDepartmentId } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event);
  const body = await readBody<{ file: { id: string }; name: string }>(event);

  if (!body.file?.id || !body.name) {
    throw createError({ status: 400, message: "File ID and new filename are required." });
  }

  // @ts-ignore
  const role = user.role;
  // @ts-ignore
  const userDept = user.departmentId;

  // 1. Fetch original file details
  const file = await ensureFile(bucket.name, body.file.id);

  // 2. Enforce department-specific permission for non-admins
  if (role !== "admin") {
    if (!userDept) {
      throw createError({ status: 403, message: "You must belong to a department to copy files." });
    }

    const fileDept = getFileDepartmentId(file.path);
    if (fileDept !== userDept) {
      throw createError({ status: 403, message: "You can only copy files belonging to your own department." });
    }
  }

  // 3. Perform copy
  // @ts-ignore
  return await copyItem(bucket.name, body.file.id, body.name, user.id);
});
