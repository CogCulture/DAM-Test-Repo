import { getFiles, getFolder, getBreadcrumb } from "~~/server/utils/db";
import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";
import { getVisibility } from "~~/shared/utils/helper";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files } from "~~/server/database/schema";
import { eq, isNull, and, or, like, sql } from "drizzle-orm";
import { processFileDuplicates } from "~~/shared/utils/file-collision";
import { isRagArtifactName } from "~~/shared/utils/rag-artifact";

export default defineEventHandler(async (event) => {
  const { user } = await verifyBucket(event, "canView");
  const { bucket, id } = getRouterParams(event);
  await requireFileDepartmentAccess(user, id);

  // Self-healing: Ensure root level files have parentId = "root" and soft-delete legacy RAG markdown artifacts
  if (id === "root") {
    const db = useDrizzle();
    await db
      .update(files)
      .set({ parentId: "root" })
      .where(
        and(
          eq(files.organizationId, user.organizationId || "org_default"),
          isNull(files.deletedAt),
          isNull(files.parentId)
        )
      );

    await db
      .update(files)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(files.organizationId, user.organizationId || "org_default"),
          isNull(files.deletedAt),
          or(
            eq(sql`json_extract(${files.assetMetadata}, '$.source')`, "rag"),
            like(files.name, "%_parsed.md"),
            like(files.name, "%_anthropic_parsed.md"),
            like(files.name, "%_fast_parsed.md")
          )
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
  const data = (fileResults?.data || [])
    .filter((file) => file.assetMetadata?.source !== "rag" && !isRagArtifactName(file.name || ""))
    .map((file) => ({
      ...file,
      visibility: getVisibility(breadcrumb, file.visibility),
    }));
  const processedData = processFileDuplicates(data);
  return { data: processedData, nextPage: fileResults?.nextPage ?? null };
});
