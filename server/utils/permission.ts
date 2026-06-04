import { getBucket } from "./db";
import { hasMinRole, ORG_BUCKET_NAME } from "~~/shared/constants/roles";
import type { UserRole } from "~~/shared/constants/roles";
import { DEPARTMENTS } from "~~/shared/constants/departments";

export const getFileDepartmentId = (filePath: string) => {
  const parts = filePath.split("/");
  if (parts[0] !== "org") return null;
  const secondSegment = parts[1];
  if (!secondSegment) return "founders";

  const deptExists = DEPARTMENTS.find((d) => d.id === secondSegment);
  if (deptExists) {
    return deptExists.id;
  }
  return "founders";
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
  const user = await getVerifiedUser(event);
  // @ts-ignore
  if (user.approvalStatus !== "active") {
    throw createError({
      status: 403,
      message: "Your account is pending approval.",
    });
  }
  return user;
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
export const verifyOrgBucket = async (event) => {
  const user = await getApprovedUser(event);
  const bucket = await getBucket(ORG_BUCKET_NAME);
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
export const verifyBucket = async (event) => {
  return verifyOrgBucket(event);
};
