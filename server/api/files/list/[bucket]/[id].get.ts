import { getFiles, getFolder, getBreadcrumb } from "~~/server/utils/db";
import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";
import { getVisibility } from "~~/shared/utils/helper";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files } from "~~/server/database/schema";
import { eq, isNull, and } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const { user } = await verifyBucket(event, "canView");
  const { bucket, id } = getRouterParams(event);
  await requireFileDepartmentAccess(user, id);

  // Self-healing: Ensure root level files have parentId = "root"
  if (id === "root") {
    await useDrizzle()
      .update(files)
      .set({ parentId: "root" })
      .where(
        and(
          eq(files.organizationId, user.organizationId || "org_default"),
          isNull(files.deletedAt),
          isNull(files.parentId)
        )
      );
  }

  let breadcrumb: FolderBreadcrumb[] = [];
  if (id !== "root") {
    // @ts-ignore
    const folder = await getFolder(id, user.organizationId);
    if (folder && folder.path) {
      breadcrumb = await getBreadcrumb(bucket, folder.path);
    }
  }
  //@ts-ignore
  const fileResults = await getFiles(event, user.id);
  const data = (fileResults?.data || []).map((file) => ({
    ...file,
    visibility: getVisibility(breadcrumb, file.visibility),
  }));
  return { data, nextPage: fileResults?.nextPage ?? null };
});
