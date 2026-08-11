import { updateFileMetadata, getTaxonomies } from "~~/server/utils/db";
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

  // Validate customMetadata against taxonomy controlled vocabularies
  if (body.customMetadata) {
    const taxonomyDefs = await getTaxonomies(orgId, (user as any).departmentId);
    for (const taxonomy of taxonomyDefs) {
      const value = body.customMetadata[taxonomy.key];
      // Check required fields
      if (taxonomy.isRequired && (value === undefined || value === null || value === "")) {
        throw createError({
          status: 400,
          message: `Field "${taxonomy.name}" is required.`,
        });
      }
      // Check controlled vocabulary (select / multiselect with options defined)
      if (value !== undefined && value !== null && taxonomy.options && taxonomy.options.length > 0) {
        const values = Array.isArray(value) ? value : [value];
        for (const v of values) {
          if (!taxonomy.options.includes(v)) {
            throw createError({
              status: 400,
              message: `"${v}" is not an allowed value for "${taxonomy.name}". Allowed: ${taxonomy.options.join(", ")}`,
            });
          }
        }
      }
    }
  }

  const updated = await updateFileMetadata(id, orgId, {
    tags: body.tags,
    customMetadata: body.customMetadata,
  });

  if (!updated) {
    throw createError({ status: 404, message: "File not found." });
  }

  return updated;
});
