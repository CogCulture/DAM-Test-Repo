import { and, eq } from "drizzle-orm";
import {
  orgDepartments,
  orgPermissions,
  userDepartmentAccess,
  userPermissionOverrides,
  users,
} from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { requireMinRole } from "~~/server/utils/permission";
import { FILE_PERMISSION_KEYS } from "~~/shared/utils/access-control";

export default defineEventHandler(async (event) => {
  const actor = await requireMinRole(event, "admin");
  if (actor.role !== "admin") {
    throw createError({ status: 403, message: "Organization administrators only." });
  }

  const db = useDrizzle();
  const organizationId = actor.organizationId;
  const [organizationUsers, departments, rolePermissions, overrides, grants] = await Promise.all([
    db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatar: users.avatar,
      role: users.role,
      departmentId: users.departmentId,
      status: users.status,
      approvalStatus: users.approvalStatus,
    }).from(users).where(eq(users.organizationId, organizationId)),
    db.select().from(orgDepartments).where(eq(orgDepartments.organizationId, organizationId)),
    db.select().from(orgPermissions).where(eq(orgPermissions.organizationId, organizationId)),
    db.select().from(userPermissionOverrides).where(eq(userPermissionOverrides.organizationId, organizationId)),
    db.select().from(userDepartmentAccess).where(eq(userDepartmentAccess.organizationId, organizationId)),
  ]);

  return {
    users: organizationUsers,
    departments,
    rolePermissions,
    overrides,
    grants,
    permissionKeys: FILE_PERMISSION_KEYS,
  };
});

