import { ensureFile, renameItem } from "~~/server/utils/db";
import { verifyBucket, getFileDepartmentId } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event);
  const body = await readBody<{ file: { id: string }; name: string }>(event);

  if (!body.file?.id || !body.name) {
    throw createError({ status: 400, message: "File ID and new name are required." });
  }

  // @ts-ignore
  const role = user.role;
  // @ts-ignore
  const userDept = user.departmentId;

  // 1. Fetch file details
  const file = await ensureFile(bucket.name, body.file.id);

  // 2. Enforce department-specific checks for non-admins
  if (role !== "admin") {
    if (!userDept) {
      throw createError({ status: 403, message: "You must belong to a department to rename items." });
    }

    const fileDept = getFileDepartmentId(file.path);
    if (fileDept !== userDept) {
      throw createError({ status: 403, message: "You can only rename items belonging to your own department." });
    }
  }

  // 3. Perform rename
  await renameItem(bucket.name, body.file.id, body.name);
  return { status: "success" };
});
