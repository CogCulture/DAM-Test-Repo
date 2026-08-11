import { searchFilesWithFacets } from "~~/server/utils/db";
import { requireFilePermission } from "~~/server/utils/permission";

/**
 * Faceted search endpoint.
 * Query params:
 *   q           - free-text search on file name
 *   type        - file type (image, video, document, etc.)
 *   tags        - comma-separated list of tags
 *   meta[key]   - filter by customMetadata key (e.g. meta[campaign]=Summer26)
 *   page        - pagination page number
 */
export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canView");
  const orgId = (user as any).organizationId || "org_default";
  const { bucket } = getRouterParams(event);
  const query = getQuery(event) as Record<string, string>;

  const q = query.q || undefined;
  const type = query.type || undefined;
  const page = query.page ? parseInt(query.page as string, 10) : 1;

  // Parse comma-separated tags
  const tags = query.tags
    ? (query.tags as string).split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  // Parse meta[key]=value style params into an object
  const metaFilters: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(query)) {
    const match = k.match(/^meta\[(.+)\]$/);
    if (match && v) {
      const metaKey = match[1];
      // Support comma-separated values for multiselect
      const values = (v as string).split(",").map((s) => s.trim()).filter(Boolean);
      metaFilters[metaKey] = values.length === 1 ? values[0] : values;
    }
  }

  return await searchFilesWithFacets(orgId, bucket, {
    q,
    tags,
    metaFilters: Object.keys(metaFilters).length > 0 ? metaFilters : undefined,
    type,
    page,
  });
});
