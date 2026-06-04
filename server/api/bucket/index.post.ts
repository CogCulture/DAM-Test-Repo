import { getBucket, createBucket } from "~~/server/utils/db";
import { requireMinRole } from "~~/server/utils/permission";
import { ORG_BUCKET_NAME } from "~~/shared/constants/roles";

// Bootstrap endpoint: creates the shared org bucket.
// Only admins can trigger this. Called automatically on first login.
export default defineEventHandler(async (event) => {
  await requireMinRole(event, "admin");

  const existing = await getBucket(ORG_BUCKET_NAME);
  if (existing) {
    return existing;
  }
  // @ts-ignore
  const { user } = await requireUserSession(event);
  return await createBucket(ORG_BUCKET_NAME, user.id);
});
