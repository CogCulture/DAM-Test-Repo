import { cleanPath } from "~~/shared/utils/helper";
import { isUploadRouteAllowed } from "~~/shared/utils/drive-storage";
import { resolveDepartmentUploadTarget, resolveLocalDepartmentUploadTarget } from "~~/shared/utils/department-upload";
import { normalizeDirectoryManifest } from "~~/shared/utils/folder-upload-target";
import { ensurePath, getFolder, getOrgDepartments } from "~~/server/utils/db";
import { requireValidFolderPaths } from "~~/server/utils/folderNomenclature";
import { getAuthorizedGDriveFolder, ensureGDrivePath } from "~~/server/utils/gdrive";
import { getGDriveUploadAccess } from "~~/server/utils/gdrive-access";
import { getFileDepartmentId, requireFileDepartmentAccess, requireFilePermission } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canUpload");
  const body = await readBody<{
    paths?: string[];
    departmentId?: string | null;
    destinationFolderId?: string | null;
    storageTarget?: "local" | "gdrive";
    bucket?: string;
    isEmptyFolder?: boolean;
  }>(event);

  if (!Array.isArray(body.paths) || body.paths.length > 5000 || body.paths.some(path => typeof path !== "string")) {
    throw createError({ status: 400, message: "Folder paths are invalid." });
  }

  let paths: string[];
  try {
    paths = normalizeDirectoryManifest(body.paths);
  } catch {
    throw createError({ status: 400, message: "One or more folder paths are invalid." });
  }
  if (!paths.length) return { created: [] };

  const organizationId = (user as any).organizationId || "org_default";
  const requestedDepartmentId = String(body.departmentId || "").trim();
  let destinationFolderId = String(body.destinationFolderId || "root").trim() || "root";
  let departmentId = (user as any).departmentId || null;

  if (body.storageTarget === "gdrive") {
    const driveAccess = await getGDriveUploadAccess(user);
    let rootFolderId = destinationFolderId === "root"
      ? driveAccess.connection.folderId
      : destinationFolderId;

    if (requestedDepartmentId === "root") {
      if ((user as any).role !== "admin") {
        throw createError({ status: 403, message: "Only organization administrators can upload to the organization root." });
      }
      departmentId = null;
    } else if (requestedDepartmentId) {
      try {
        const target = resolveDepartmentUploadTarget({
          actor: user as any,
          departments: driveAccess.departments,
          departmentId: requestedDepartmentId,
        });
        departmentId = target.departmentId;
        if (destinationFolderId === "root" && target.gdriveFolderId) rootFolderId = target.gdriveFolderId;
      } catch (error: any) {
        const message = error?.message || "Invalid upload department.";
        throw createError({ status: /access/i.test(message) ? 403 : 404, message });
      }
    }

    const selectedFolder = await getAuthorizedGDriveFolder(
      driveAccess.token,
      rootFolderId,
      driveAccess.allowedRootIds,
    );
    departmentId ||= driveAccess.departments.find(
      department => department.gdriveFolderId === selectedFolder.authorizedRootId,
    )?.id || null;

    await requireValidFolderPaths({ user, paths, departmentId });
    for (const path of paths) {
      await ensureGDrivePath(driveAccess.token, rootFolderId, path);
    }
    return { created: paths };
  }

  const storageTarget = body.storageTarget || "local";
  if (!isUploadRouteAllowed({ orgType: (user as any).orgType, requestedTarget: storageTarget })) {
    throw createError({ status: 409, message: `This organization stores assets in ${storageTarget === "gdrive" ? "Google Drive" : "DAM Storage"}.` });
  }
  if (requestedDepartmentId === "root") {
    if ((user as any).role !== "admin") {
      throw createError({ status: 403, message: "Only organization administrators can upload to the organization root." });
    }
    departmentId = destinationFolderId === "root"
      ? null
      : await getFileDepartmentId(destinationFolderId, organizationId);
  } else if (requestedDepartmentId) {
    try {
      const target = resolveLocalDepartmentUploadTarget({
        actor: user as any,
        departments: await getOrgDepartments(organizationId),
        departmentId: requestedDepartmentId,
      });
      departmentId = target.departmentId;
      if (destinationFolderId === "root") {
        destinationFolderId = target.folderId;
      } else if (await getFileDepartmentId(destinationFolderId, organizationId) !== target.departmentId) {
        throw new Error("The selected folder is outside the upload department.");
      }
    } catch (error: any) {
      const message = error?.message || "Invalid upload department.";
      throw createError({ status: /access|outside/i.test(message) ? 403 : 404, message });
    }
  } else if (destinationFolderId !== "root") {
    departmentId = await getFileDepartmentId(destinationFolderId, organizationId) || departmentId;
  } else if ((user as any).role !== "admin") {
    if (!departmentId) {
      throw createError({ status: 403, message: "Choose an authorized upload department." });
    }
    try {
      destinationFolderId = resolveLocalDepartmentUploadTarget({
        actor: user as any,
        departments: await getOrgDepartments(organizationId),
        departmentId,
      }).folderId;
    } catch (error: any) {
      throw createError({ status: 403, message: error?.message || "Choose an authorized upload department." });
    }
  }
  const bucket = String(body.bucket || "org");
  await requireFileDepartmentAccess(user, destinationFolderId);
  let parentPath = bucket;
  if (destinationFolderId !== "root") {
    const parent = await getFolder(destinationFolderId, organizationId);
    if (!parent || parent.type !== "folder" || parent.bucketName !== bucket) {
      throw createError({ status: 404, message: "Destination folder not found." });
    }
    parentPath = parent.path;
  }

  await requireValidFolderPaths({ user, paths, departmentId });
  const isFreshEmptyFolder = !!body.isEmptyFolder;
  for (const path of paths) {
    await ensurePath(bucket, cleanPath(`${parentPath}/${path}`), user.id, false, isFreshEmptyFolder);
  }
  return { created: paths };
});
