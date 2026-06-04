import { ensureFile, moveItem, getFolder } from "~~/server/utils/db";
import { verifyBucket, getFileDepartmentId } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event);
  const body = await readBody<{ file: { id: string }; parentId: string }>(event);

  if (!body.file?.id || !body.parentId) {
    throw createError({ status: 400, message: "File ID and destination folder ID are required." });
  }

  // @ts-ignore
  const role = user.role;
  // @ts-ignore
  const userDept = user.departmentId;

  // 1. Fetch the item to move
  const file = await ensureFile(bucket.name, body.file.id);

  // 2. Enforce department scopes for non-admins
  if (role !== "admin") {
    if (!userDept) {
      throw createError({ status: 403, message: "You must be assigned to a department to move items." });
    }

    const deptPrefix = "org/" + userDept;

    // Verify the item belongs to the user's department
    const fileDept = getFileDepartmentId(file.path);
    if (fileDept !== userDept) {
      throw createError({ status: 403, message: "You can only move items belonging to your own department." });
    }

    // Verify the destination belongs to the user's department
    if (body.parentId === "root") {
      throw createError({ status: 403, message: "Only Admins can move files to the root level." });
    }

    if (body.parentId.startsWith("dept_")) {
      const targetDeptId = body.parentId.substring(5);
      if (targetDeptId !== userDept) {
        throw createError({ status: 403, message: "You can only move items inside your own department." });
      }
    } else {
      // It's a physical folder, fetch it and check its path starts with `org/<deptId>`
      // @ts-ignore
      const destFolder = await getFolder(body.parentId, user.organizationId);
      if (!destFolder || !destFolder.path.startsWith(deptPrefix)) {
        throw createError({ status: 403, message: "You can only move items inside your own department." });
      }
    }
  }

  // 3. Perform the move
  return await moveItem(bucket.name, body.file.id, body.parentId);
});
