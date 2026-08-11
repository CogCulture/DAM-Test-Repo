import { deleteFiles } from "~~/server/utils/db";
import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canDelete");
  const files = await readBody(event);
  if (!Array.isArray(files)) throw createError({ status: 400, message: "Invalid file selection." });
  for (const fileId of files) await requireFileDepartmentAccess(user, String(fileId));
  const response = await deleteFiles(bucket.name, files);
  if (response.success) {
    return {
      status: "success",
    };
  }
});
