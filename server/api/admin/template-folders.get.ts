import { useDrizzle } from "~~/server/utils/drizzle";
import { files } from "~~/server/database/schema";
import { and, eq, isNull } from "drizzle-orm";
import { ORG_BUCKET_NAME } from "~~/shared/constants/roles";

/**
 * Returns top-level (parentId = 'root') folders in the org bucket.
 * Used by the Template Folders admin page to detect which templates already exist.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);

  if ((user as any)?.role !== "admin") {
    throw createError({ status: 403, message: "Admin access required." });
  }

  const orgId = (user as any)?.organizationId || "org_default";

  const rootFolders = await useDrizzle()
    .select({
      id: files.id,
      name: files.name,
      path: files.path,
      count: files.count,
    })
    .from(files)
    .where(
      and(
        eq(files.bucketName, ORG_BUCKET_NAME),
        eq(files.organizationId, orgId),
        eq(files.parentId, "root"),
        eq(files.type, "folder"),
        isNull(files.deletedAt)
      )
    );

  return { folders: rootFolders };
});
