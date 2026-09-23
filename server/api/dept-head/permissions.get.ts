import { eq, and } from "drizzle-orm";
import { orgPermissions, userPermissionOverrides, users } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { requireDeptHead } from "~~/server/utils/permission";
import { getOrgDepartments } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const user = await requireDeptHead(event);
  const query = getQuery(event);

  const db = useDrizzle();

  // Resolve target department ID (admin can pass query param departmentId)
  let targetDepartmentId = user.departmentId;
  if (user.role === "admin" && query.departmentId) {
    targetDepartmentId = String(query.departmentId);
  }

  if (!targetDepartmentId) {
    // If admin has no assigned department and didn't pass query param, pick the first department in org
    const depts = await getOrgDepartments(user.organizationId);
    if (depts.length > 0) {
      targetDepartmentId = depts[0].id;
    }
  }

  if (!targetDepartmentId) {
    return {
      success: true,
      rolePermissions: [],
      userOverrides: [],
      users: [],
      departments: await getOrgDepartments(user.organizationId),
      targetDepartmentId: null,
    };
  }

  // Fetch role-level permissions for this department
  const rolePermissions = await db
    .select()
    .from(orgPermissions)
    .where(and(
      eq(orgPermissions.organizationId, user.organizationId),
      eq(orgPermissions.departmentId, targetDepartmentId)
    ));

  // Fetch user-level permission overrides for this department
  const userOverrides = await db
    .select()
    .from(userPermissionOverrides)
    .where(and(
      eq(userPermissionOverrides.organizationId, user.organizationId),
      eq(userPermissionOverrides.departmentId, targetDepartmentId)
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
      eq(users.departmentId, targetDepartmentId)
    ));

  const allDepts = await getOrgDepartments(user.organizationId);

  return {
    success: true,
    targetDepartmentId,
    departments: allDepts,
    rolePermissions,
    userOverrides,
    users: deptUsers,
  };
});
