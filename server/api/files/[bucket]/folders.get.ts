import { verifyBucket } from "~~/server/utils/permission";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files } from "~~/server/database/schema";
import { eq, and, isNull, asc } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const { user } = await verifyBucket(event, "canView");
  const orgId = user.organizationId || "org_default";

  const db = useDrizzle();
  const folderRows = await db
    .select({
      id: files.id,
      name: files.name,
      path: files.path,
      parentId: files.parentId,
      type: files.type,
      contentType: files.contentType,
    })
    .from(files)
    .where(
      and(
        eq(files.organizationId, orgId),
        eq(files.type, "folder"),
        isNull(files.deletedAt)
      )
    )
    .orderBy(asc(files.name));

  return folderRows;
});
