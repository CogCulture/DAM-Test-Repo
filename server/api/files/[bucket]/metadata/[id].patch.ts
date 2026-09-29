import { updateFileMetadata } from "~~/server/utils/db";
import { requireFileDepartmentAccess, requireFilePermission } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canEditMetadata");
  const orgId = (user as any).organizationId || "org_default";
  const { id } = getRouterParams(event);
  await requireFileDepartmentAccess(user, id);

  const body = await readBody<{
    tags?: string[];
    customMetadata?: Record<string, any>;
  }>(event);

  const updated = await updateFileMetadata(id, orgId, {
    tags: body.tags,
    customMetadata: body.customMetadata,
  });

  if (!updated) {
    throw createError({ status: 404, message: "File not found." });
  }

  return updated;
});
