import { and, eq } from "drizzle-orm";
import { ulid } from "ulidx";
import {
  orgDepartments,
  permissionAuditLogs,
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

  const body = await readBody<{
    userId: string;
    permissions: Record<string, boolean | null>;
    allDepartmentAccess?: boolean;
    departmentIds?: string[];
  }>(event);
  if (!body?.userId || !body.permissions || typeof body.permissions !== "object") {
    throw createError({ status: 400, message: "Invalid access-control payload." });
  }

  const db = useDrizzle();
  const [target] = await db.select().from(users).where(and(
    eq(users.id, body.userId),
    eq(users.organizationId, actor.organizationId),
  ));
  if (!target) throw createError({ status: 404, message: "User not found in your organization." });
  if (target.role === "admin") {
    throw createError({ status: 400, message: "Administrator access cannot be restricted." });
  }

  const normalizedPermissions = Object.fromEntries(FILE_PERMISSION_KEYS.map((key) => {
    const value = body.permissions[key];
    if (value !== null && typeof value !== "boolean" && value !== undefined) {
      throw createError({ status: 400, message: `Invalid value for ${key}.` });
    }
    return [key, value ?? null];
  }));

  const departmentIds = [...new Set(body.departmentIds || [])].filter((id) => id !== target.departmentId);
  if (departmentIds.length) {
    const validDepartments = await db.select({ id: orgDepartments.id }).from(orgDepartments)
      .where(eq(orgDepartments.organizationId, actor.organizationId));
    const validIds = new Set(validDepartments.map((department) => department.id));
    if (departmentIds.some((id) => !validIds.has(id))) {
      throw createError({ status: 400, message: "One or more department grants are invalid." });
    }
  }

  await db.delete(userPermissionOverrides).where(eq(userPermissionOverrides.userId, target.id));
  await db.insert(userPermissionOverrides).values({
    id: ulid(),
    userId: target.id,
    organizationId: actor.organizationId,
    departmentId: target.departmentId || "unassigned",
    ...normalizedPermissions,
    allDepartmentAccess: !!body.allDepartmentAccess,
    updatedAt: new Date(),
  });

  await db.delete(userDepartmentAccess).where(eq(userDepartmentAccess.userId, target.id));
  if (!body.allDepartmentAccess) {
    for (const departmentId of departmentIds) {
      await db.insert(userDepartmentAccess).values({
        id: ulid(),
        userId: target.id,
        organizationId: actor.organizationId,
        departmentId,
        createdAt: new Date(),
      });
    }
  }

  await db.insert(permissionAuditLogs).values({
    id: ulid(),
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    targetUserId: target.id,
    departmentId: target.departmentId,
    changes: {
      permissions: normalizedPermissions,
      allDepartmentAccess: !!body.allDepartmentAccess,
      departmentIds,
    },
    createdAt: new Date(),
  });

  return { success: true };
});

