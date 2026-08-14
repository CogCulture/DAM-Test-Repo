import { getFolderRequests } from "~~/server/utils/db";
import { getApprovedUser } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await getApprovedUser(event);
  const orgId = (user as any).organizationId;
  const role = user.role as string;

  if (role === "dept_head" || role === "admin") {
    return await getFolderRequests(orgId, role === "admin" ? undefined : (user.departmentId ?? undefined));
  }
  return await getFolderRequests(orgId, undefined, user.id);
});
