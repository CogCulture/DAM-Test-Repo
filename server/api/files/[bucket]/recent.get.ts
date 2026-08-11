import { getRecent, transformList } from "~~/server/utils/db";
import { verifyBucket } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canView");
  //@ts-ignore
  const files = await getRecent(event, user.id);
  return await transformList(bucket.name, files);
});
