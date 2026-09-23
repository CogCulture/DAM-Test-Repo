import { getAllUsers } from "~~/server/utils/db";
import { requireMinRole } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await requireMinRole(event, "dept_head");
  const orgId = (user as any).organizationId || "org_default";
  const role = user.role as string;
  if (role === "admin") {
    return await getAllUsers(orgId);
  }
  return await getAllUsers(orgId, user.departmentId ?? undefined);
});
