import { ensureFile, copyItem } from "~~/server/utils/db";
import { verifyBucket, requireFileDepartmentAccess } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canUpload");
  const body = await readBody<{ file: { id: string }; name: string }>(event);

  if (!body.file?.id || !body.name) {
    throw createError({ status: 400, message: "File ID and new filename are required." });
  }

  await ensureFile(bucket.name, body.file.id);
  await requireFileDepartmentAccess(user, body.file.id);
  // 3. Perform copy
  // @ts-ignore
  return await copyItem(bucket.name, body.file.id, body.name, user.id);
});
