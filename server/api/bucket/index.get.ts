import { getBucket, createBucket } from "~~/server/utils/db";
import { getApprovedUser } from "~~/server/utils/permission";
import { ORG_BUCKET_NAME } from "~~/shared/constants/roles";

export default defineEventHandler(async (event) => {
  const user = await getApprovedUser(event);

  let bucket = await getBucket(ORG_BUCKET_NAME);
  if (!bucket) {
    bucket = await createBucket(ORG_BUCKET_NAME, user.id);
  }

  return bucket;
});
