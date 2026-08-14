import { getTaxonomies } from "~~/server/utils/db";
import { getApprovedUser } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await getApprovedUser(event);
  const orgId = (user as any).organizationId || "org_default";
  const departmentId = (user as any).departmentId;

  // Return org-wide + department-specific taxonomies for this user
  return await getTaxonomies(orgId, departmentId);
});
