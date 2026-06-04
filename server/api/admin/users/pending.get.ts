import { getPendingUsers } from "~~/server/utils/db";
import { getApprovedUser } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await getApprovedUser(event);
  const orgId = (user as any).organizationId;
  const role = user.role as string;
  // Admin sees all pending users; dept_head sees only their department
  if (role === "admin") {
    return await getPendingUsers(orgId);
  }
  if (role === "dept_head") {
    return await getPendingUsers(orgId, user.departmentId ?? undefined);
  }
  throw createError({ status: 403, message: "Insufficient permissions." });
});
