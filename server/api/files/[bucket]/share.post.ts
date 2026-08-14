import { shareFiles } from "~~/server/utils/db";
import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canShare");
  const { files, members } = await readBody(event);
  if (!Array.isArray(files)) throw createError({ status: 400, message: "Invalid file selection." });
  for (const file of files) await requireFileDepartmentAccess(user, file?.id);
  const response = await shareFiles(bucket.name, files, members);
  if (response.success) {
    return {
      status: "success",
    };
  }
});
