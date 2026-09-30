import { getBucket, getFolder, getItemById, getOrgDepartments, isOrganizationSuspended, getUser } from "./db";
import { hasMinRole, ORG_BUCKET_NAME } from "~~/shared/constants/roles";
import type { UserRole } from "~~/shared/constants/roles";
import type { FilePermissionKey } from "~~/shared/utils/access-control";
// Removed static DEPARTMENTS
import { users, buckets } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";


export const getFileDepartmentId = async (fileId: string, orgId: string) => {
  if (!fileId || fileId === "root") return null;
  if (fileId.startsWith("dept_")) return fileId.substring(5);
  const departments = await getOrgDepartments(orgId);
  const byFolderId = new Map(
    departments.filter((department) => department.folderId).map((department) => [department.folderId, department.id]),
  );

  let currentId: string | null = fileId;
  const visited = new Set<string>();
  while (currentId && currentId !== "root" && !visited.has(currentId)) {
    visited.add(currentId);
    if (currentId.startsWith("dept_")) return currentId.substring(5);
    const departmentId = byFolderId.get(currentId);
    if (departmentId) return departmentId;
    const item = (await getItemById(currentId, orgId)) || (await getFolder(currentId, orgId));
    currentId = item?.parentId || null;
  }
  return null;
 };

// @ts-ignore
export const getVerifiedUser = async (event) => {
  const { user } = await requireUserSession(event);
  if (!user) {
    throw createError({
      status: 401,
      message: "Unauthorized Access",
    });
  }
  return user;
};

/**
 * Returns the verified user, and throws if their approval status is not 'active'.
 */
// @ts-ignore
export const getApprovedUser = async (event) => {
  const sessionUser = await getVerifiedUser(event);
  
  // Verify user still exists in the database and retrieve fresh record
  const dbUser = await getUser(sessionUser.id);
  if (!dbUser) {
    await clearUserSession(event);
    throw createError({
      status: 401,
      message: "Session expired or user deleted. Please sign in again.",
    });
  }

  if (dbUser.organizationId) {
    const suspended = await isOrganizationSuspended(dbUser.organizationId);
    if (suspended) {
      throw createError({
        status: 403,
        message: "Your organization has been suspended. Access denied.",
      });
    }
  }
  if (dbUser.approvalStatus !== "active") {
    throw createError({
      status: 403,
      message: "Your account is pending approval.",
    });
  }
  return dbUser;
};

/**
 * Enforces a granular file-service permission from the fresh database user.
 * Missing permissions fail closed; organization admins are resolved as allowed.
 */
// @ts-ignore
export const requireFilePermission = async (event, permission: FilePermissionKey) => {
  const user = await getApprovedUser(event);
  if (user.permissions?.[permission] !== true) {
    throw createError({
      status: 403,
      message: `You do not have permission to ${permission.replace(/^can/, "").replace(/([A-Z])/g, " $1").toLowerCase()}.`,
    });
  }
  return user;
};

export const requireDepartmentAccess = (user: any, departmentId?: string | null) => {
  if (!departmentId || user.role === "admin") return;
  if (!user.accessibleDepartmentIds?.includes(departmentId)) {
    throw createError({
      status: 403,
      message: "You do not have access to this department.",
    });
  }
};
export const requireFileDepartmentAccess = async (user: any, fileId?: string | null) => {
  if (!fileId || user.role === "admin") return;
  const departmentId = await getFileDepartmentId(fileId, user.organizationId);
  requireDepartmentAccess(user, departmentId);
};
/**
 * Require the user to have at least the specified role.
 * Also ensures the user's account is approved (active).
 */
// @ts-ignore
export const requireMinRole = async (event, minRole: UserRole) => {
  const user = await getApprovedUser(event);
  // @ts-ignore
  if (!hasMinRole(user.role as UserRole, minRole)) {
    throw createError({
      status: 403,
      message: "Insufficient permissions.",
    });
  }
  return user;
};

/**
 * Require the user to be the dept_head of a specific department (or founder).
 */
// @ts-ignore
export const requireDeptHead = async (event, departmentId?: string) => {
  const user = await getApprovedUser(event);
  // @ts-ignore
  const role = user.role as UserRole;
  if (role === "admin") return user;
  if (role !== "dept_head") {
    throw createError({
      status: 403,
      message: "Only Department Heads can perform this action.",
    });
  }
  if (departmentId && user.departmentId !== departmentId) {
    throw createError({
      status: 403,
      message: "You can only manage your own department.",
    });
  }
  return user;
};

/**
 * Verifies access to the shared org bucket.
 * Any approved user can access the org bucket.
 */
// @ts-ignore
export const verifyOrgBucket = async (event, permission?: FilePermissionKey) => {
  const user = await getApprovedUser(event);
  if (permission && user.permissions?.[permission] !== true) {
    throw createError({ status: 403, message: "Insufficient permissions." });
  }
  let bucket = await getBucket(ORG_BUCKET_NAME);
  if (!bucket) {
    try {
      await useDrizzle().insert(buckets).values({
        name: ORG_BUCKET_NAME,
        userId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      bucket = await getBucket(ORG_BUCKET_NAME);
    } catch {
      bucket = await getBucket(ORG_BUCKET_NAME);
    }
  }
  if (!bucket) {
    throw createError({
      status: 404,
      message: "Organization bucket not found. Please contact your admin.",
    });
  }
  return { bucket, user };
};

/**
 * Legacy verifyBucket: kept for backwards compatibility.
 * Now routes to verifyOrgBucket (shared bucket).
 */
// @ts-ignore
export const verifyBucket = async (event, permission?: FilePermissionKey) => {
  return verifyOrgBucket(event, permission);
};
