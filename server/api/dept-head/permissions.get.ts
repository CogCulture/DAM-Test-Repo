import { eq, and } from "drizzle-orm";
import { orgPermissions, userPermissionOverrides, users } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { requireDeptHead } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await requireDeptHead(event);
  
  if (user.role !== "dept_head") {
    throw createError({ status: 403, message: "Forbidden: Department heads only." });
  }

  const db = useDrizzle();

  // Fetch role-level permissions for this department
  const rolePermissions = await db
    .select()
    .from(orgPermissions)
    .where(and(
      eq(orgPermissions.organizationId, user.organizationId),
      eq(orgPermissions.departmentId, user.departmentId)
    ));

  // Fetch user-level permission overrides for this department
  const userOverrides = await db
    .select()
    .from(userPermissionOverrides)
    .where(and(
      eq(userPermissionOverrides.organizationId, user.organizationId),
      eq(userPermissionOverrides.departmentId, user.departmentId)
    ));

  // Fetch all users in this department
  const deptUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatar: users.avatar,
    })
    .from(users)
    .where(and(
      eq(users.organizationId, user.organizationId),
      eq(users.departmentId, user.departmentId)
    ));

  return {
    success: true,
    rolePermissions,
    userOverrides,
    users: deptUsers,
  };
});
