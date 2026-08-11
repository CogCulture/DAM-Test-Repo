import { requireFilePermission } from "~~/server/utils/permission";
import { getGDriveUploadAccess, requireAuthorizedGDriveUploadFolder } from "~~/server/utils/gdrive-access";
import { listGDriveFolder } from "~~/server/utils/gdrive";
import { sortDirectoryChildren } from "~~/shared/utils/folder-upload-target";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canUpload");
  const requestedParentId = String(getQuery(event).parentId || "root");

  if (requestedParentId === "root" && user.role !== "admin") {
    const access = await getGDriveUploadAccess(user);
    return sortDirectoryChildren(access.accessibleDepartments
      .filter(department => department.gdriveFolderId)
      .map(department => ({
        id: department.gdriveFolderId as string,
        name: department.name,
        parentId: null,
        path: department.name,
        type: "folder" as const,
        departmentId: department.id,
      })));
  }

  const access = await requireAuthorizedGDriveUploadFolder(user, requestedParentId);
  const children = await listGDriveFolder(access.token, access.folder.id);
  const inheritedDepartmentId = access.departments.find(
    department => department.gdriveFolderId === access.folder.authorizedRootId,
  )?.id || null;
  return sortDirectoryChildren(children
    .filter(item => item.mimeType === "application/vnd.google-apps.folder")
    .map(item => ({
      id: item.id,
      name: item.name,
      parentId: access.folder.id,
      path: `${access.folder.path} / ${item.name}`,
      type: "folder" as const,
      departmentId: access.departments.find(department => department.gdriveFolderId === item.id)?.id
        || inheritedDepartmentId,
    })));
});
