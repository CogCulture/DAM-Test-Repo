import { eq, and } from "drizzle-orm";
import { orgPermissions, permissionAuditLogs, userPermissionOverrides, users } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { requireDeptHead } from "~~/server/utils/permission";
import { ulid } from "ulidx";

export default defineEventHandler(async (event) => {
  const user = await requireDeptHead(event);
  
  if (user.role !== "dept_head") {
    throw createError({ status: 403, message: "Forbidden: Department heads only." });
  }

  const body = await readBody<{
    rolePermissions?: any[];
    userOverrides?: any[];
  }>(event);

  if (!body) {
    throw createError({ status: 400, message: "Invalid payload." });
  }

  const db = useDrizzle();

  if (body.userOverrides && Array.isArray(body.userOverrides)) {
    const managedUsers = await db.select({ id: users.id }).from(users).where(and(
      eq(users.organizationId, user.organizationId),
      eq(users.departmentId, user.departmentId),
    ));
    const managedIds = new Set(managedUsers.map((managedUser) => managedUser.id));
    if (body.userOverrides.some((override) => !managedIds.has(override.userId))) {
      throw createError({ status: 403, message: "You can only manage users in your department." });
    }
  }

  // 1. Save rolePermissions
  if (body.rolePermissions && Array.isArray(body.rolePermissions)) {
    // Delete existing
    await db
      .delete(orgPermissions)
      .where(and(
        eq(orgPermissions.organizationId, user.organizationId),
        eq(orgPermissions.departmentId, user.departmentId)
      ));

    // Insert new
    for (const rp of body.rolePermissions) {
      await db.insert(orgPermissions).values({
        id: ulid(),
        organizationId: user.organizationId,
        departmentId: user.departmentId,
        role: rp.role,
        maxCount: rp.maxCount !== undefined ? rp.maxCount : null,
        canView: !!rp.canView,
        canUpload: !!rp.canUpload,
        canDownload: !!rp.canDownload,
        canDelete: !!rp.canDelete,
        canCreateFolder: !!rp.canCreateFolder,
        canApproveUsers: !!rp.canApproveUsers,
        canEditNomenclature: !!rp.canEditNomenclature,
        canShare: !!rp.canShare,
        canRename: !!rp.canRename,
        canEditMetadata: !!rp.canEditMetadata,
        canUseRag: !!rp.canUseRag,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // 2. Save userOverrides
  if (body.userOverrides && Array.isArray(body.userOverrides)) {
    // Delete existing
    await db
      .delete(userPermissionOverrides)
      .where(and(
        eq(userPermissionOverrides.organizationId, user.organizationId),
        eq(userPermissionOverrides.departmentId, user.departmentId)
      ));

    // Insert new
    for (const uo of body.userOverrides) {
      await db.insert(userPermissionOverrides).values({
        id: ulid(),
        userId: uo.userId,
        organizationId: user.organizationId,
        departmentId: user.departmentId,
        canView: uo.canView,
        canUpload: uo.canUpload,
        canDownload: uo.canDownload,
        canDelete: uo.canDelete,
        canCreateFolder: uo.canCreateFolder,
        canShare: uo.canShare,
        canRename: uo.canRename,
        canEditMetadata: uo.canEditMetadata,
        canUseRag: uo.canUseRag,
        allDepartmentAccess: false,
        updatedAt: new Date(),
      });
    }
  }

  await db.insert(permissionAuditLogs).values({
    id: ulid(),
    organizationId: user.organizationId,
    actorUserId: user.id,
    targetRole: "department_permissions",
    departmentId: user.departmentId,
    changes: {
      rolePermissions: body.rolePermissions || [],
      userOverrides: body.userOverrides || [],
    },
    createdAt: new Date(),
  });

  return { success: true };
});
