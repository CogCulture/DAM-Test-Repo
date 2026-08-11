import { and, eq } from "drizzle-orm";
import { users } from "~~/server/database/schema";
import { getOrgDepartments } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import {
  getAuthorizedGDriveFolder,
  getGDriveAccessToken,
  getGDriveConnection,
} from "~~/server/utils/gdrive";

export const getGDriveUploadAccess = async (user: any) => {
  const organizationId = user.organizationId;
  if (!organizationId) {
    throw createError({ status: 403, message: "An organization is required for Google Drive uploads." });
  }
  const db = useDrizzle();
  let adminUserId = user.id;

  if (user.role !== "admin" && organizationId) {
    const [admin] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.role, "admin")));
    if (admin) adminUserId = admin.id;
  }

  const connection = await getGDriveConnection(adminUserId);
  if (!connection || connection.status !== "approved" || !connection.folderId) {
    throw createError({ status: 403, message: "Google Drive folder hosting is not approved." });
  }

  const token = await getGDriveAccessToken(adminUserId);
  const departments = await getOrgDepartments(organizationId);
  const accessibleDepartmentIds = new Set<string>([
    ...(user.accessibleDepartmentIds || []),
    ...(user.departmentId ? [user.departmentId] : []),
  ]);
  const accessibleDepartments = user.role === "admin"
    ? departments
    : departments.filter(department => accessibleDepartmentIds.has(department.id));
  const allowedRootIds = user.role === "admin"
    ? new Set<string>([
        connection.folderId,
        ...(departments.map(department => department.gdriveFolderId).filter(Boolean) as string[]),
      ])
    : new Set<string>(accessibleDepartments.map(department => department.gdriveFolderId).filter(Boolean) as string[]);

  return {
    adminUserId,
    allowedRootIds,
    connection,
    departments,
    accessibleDepartments,
    token,
  };
};

export const requireAuthorizedGDriveUploadFolder = async (
  user: any,
  requestedFolderId: string,
) => {
  const access = await getGDriveUploadAccess(user);
  const concreteFolderId = requestedFolderId === "root"
    ? access.connection.folderId
    : requestedFolderId;
  const folder = await getAuthorizedGDriveFolder(
    access.token,
    concreteFolderId,
    access.allowedRootIds,
  );
  return { ...access, folder };
};
