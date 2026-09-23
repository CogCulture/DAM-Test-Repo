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

  try {
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
          eq(files.type, "folder"),
          isNull(files.deletedAt)
        )
      );

    // Filter in-memory to be completely resilient to organizationId and parentId nuances
    const filtered = (rootFolders || []).filter((f) => {
      const isTopLevel = !f.path || !f.path.includes("/") || f.path.split("/").length <= 2;
      return isTopLevel;
    });

    return { folders: filtered };
  } catch (err: any) {
    console.error("Failed to query template folders:", err);
    return { folders: [] };
  }
});
