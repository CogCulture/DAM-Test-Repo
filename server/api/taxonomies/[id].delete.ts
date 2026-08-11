import { deleteTaxonomy } from "~~/server/utils/db";
import { requireMinRole } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await requireMinRole(event, "dept_head");
  const orgId = (user as any).organizationId || "org_default";
  const { id } = getRouterParams(event);

  await deleteTaxonomy(id, orgId);
  return { success: true };
});
