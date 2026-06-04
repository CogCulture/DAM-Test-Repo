import { getBucket } from "~~/server/utils/db";
import { getApprovedUser } from "~~/server/utils/permission";
import { ORG_BUCKET_NAME } from "~~/shared/constants/roles";
import { getGDriveConnection } from "~~/server/utils/gdrive";

export default defineEventHandler(async (event) => {
  const user = await getApprovedUser(event);

  const conn = await getGDriveConnection(user.id);
  if (conn && conn.status === "approved") {
    return {
      id: conn.id,
      name: `gdrive_${conn.folderId}`,
      userId: conn.userId,
      size: 0,
    };
  }

  return await getBucket(ORG_BUCKET_NAME);
});
