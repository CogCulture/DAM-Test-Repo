import { updateTaxonomy } from "~~/server/utils/db";
import { requireMinRole } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await requireMinRole(event, "dept_head");
  const orgId = (user as any).organizationId || "org_default";
  const { id } = getRouterParams(event);

  const body = await readBody<{
    name?: string;
    type?: "text" | "select" | "multiselect";
    options?: string[];
    isRequired?: boolean;
  }>(event);

  const [updated] = await updateTaxonomy(id, orgId, body);
  if (!updated) {
    throw createError({ status: 404, message: "Taxonomy field not found." });
  }
  return updated;
});
