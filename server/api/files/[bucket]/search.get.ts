import { searchFiles } from "~~/server/utils/db";
import { verifyBucket } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { bucket } = await verifyBucket(event, "canView");
  const { q }: { q: string } = getQuery(event);
  if (!q) {
    return [];
  }
  return await searchFiles(bucket.name, q);
});
