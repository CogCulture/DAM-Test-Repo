import { requireFilePermission } from "~~/server/utils/permission";
import { getGDriveAccessToken, createGDriveFolder, getGDriveConnection } from "~~/server/utils/gdrive";
import { getGDriveRules, getOrgDepartments } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { users, orgDepartments } from "~~/server/database/schema";
import { eq, and } from "drizzle-orm";
import { resolveFolderCreationMode } from "~~/shared/utils/folder-creation-policy";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canCreateFolder");
  if (resolveFolderCreationMode({ role: user.role, canCreateFolder: true }) !== "direct") {
    throw createError({
      status: 403,
      message: "Folder creation requires administrator or Department Head approval. Submit a folder request instead.",
    });
  }
  const { parentId, folderName } = await readBody<{ parentId: string; folderName: string }>(event);

  if (!folderName || !parentId) {
    throw createError({ status: 400, message: "Parent ID and Folder name are required." });
  }

  const orgId = (user as any).organizationId;
  const db = useDrizzle();

  // Find the admin of this organization to get their Google Drive connection credentials
  let adminUserId = user.id;
  if (user.role !== "admin" && orgId) {
    const [orgAdmin] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.role, "admin")));
    if (orgAdmin) {
      adminUserId = orgAdmin.id;
    }
  }

  const connection = await getGDriveConnection(adminUserId);
  if (!connection || connection.status !== "approved") {
    throw createError({ status: 403, message: "Google Drive folder hosting is not approved." });
  }

  // Permissions validation
  if (user.role !== "admin") {
    const permissions = (user as any).permissions;
    if (permissions && !permissions.canCreateFolder) {
      throw createError({ status: 403, message: "Forbidden: You do not have permission to create folders." });
    }
  }

  // Hierarchy enforcement: only allow folder creation at root (department-level) for non-admins
  if (orgId && orgId !== "org_default") {
    const rules = await getGDriveRules(orgId);
    if (rules.enforceHierarchy) {
      const userRole = (user as any).role;
      // Non-admins can only create sub-folders inside their own department's folder
      // Creating at root level is restricted to admins only
      if (parentId === "root" && userRole !== "admin") {
        throw createError({
          status: 403,
          message: "Hierarchy enforcement is active. Only organization admins can create top-level department folders. " +
            "Please create folders inside your department folder.",
        });
      }
    }
  }

  const token = await getGDriveAccessToken(adminUserId);
  
  let targetParentId = parentId;
  if (parentId === "root") {
    const userRole = (user as any).role;
    const userDeptId = (user as any).departmentId;
    if (userRole !== "admin" && userDeptId) {
      // Lookup department's GDrive folder
      const [dept] = await db
        .select()
        .from(orgDepartments)
        .where(eq(orgDepartments.id, userDeptId));
      if (dept && dept.gdriveFolderId) {
        targetParentId = dept.gdriveFolderId;
      } else {
        targetParentId = connection.folderId || "root";
      }
    } else {
      targetParentId = connection.folderId || "root";
    }
  }

  const newFolder = await createGDriveFolder(token, targetParentId!, folderName);

  return { success: true, folder: newFolder };
});
