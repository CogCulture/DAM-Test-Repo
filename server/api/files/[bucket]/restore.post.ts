import { restoreFiles } from "~~/server/utils/db";
import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canDelete");
  const ids = await readBody<string[]>(event);
  if (Array.isArray(ids)) for (const id of ids) await requireFileDepartmentAccess(user, id);

  if (!Array.isArray(ids) || ids.length === 0) {
    throw createError({ status: 400, message: "Select at least one item to restore." });
  }

  return await restoreFiles(bucket.name, ids);
});
