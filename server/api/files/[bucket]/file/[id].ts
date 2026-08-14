import { verifyBucket } from "~~/server/utils/permission";
import { getFolder } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canView");
  const { id } = getRouterParams(event);

  if (id) {
    // @ts-ignore
    const file = await getFolder(id, user.organizationId);
    if (file && file.bucketName === bucket.name) {
      return file;
    }
  } else {
    throw createError({
      message: "Invalid request",
      status: 400,
    });
  }
});
