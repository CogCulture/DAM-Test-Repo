import { ensureFile, setVisibility } from "~~/server/utils/db";
import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canShare");
  const file = await readBody<{ id?: string; visibility?: string }>(event);

  if (!file?.id || !["public", "private", "inherit"].includes(String(file.visibility))) {
    throw createError({
      status: 400,
      message: "A valid file and visibility are required.",
    });
  }

  await ensureFile(bucket.name, file.id);
  await requireFileDepartmentAccess(user, file.id);
  await setVisibility(bucket.name, file as IFile);
  return { status: "success", file: file.id, visibility: file.visibility };
});