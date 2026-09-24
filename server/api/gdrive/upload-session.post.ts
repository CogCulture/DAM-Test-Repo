/**
 * POST /api/gdrive/upload-session
 *
 * Creates a Google Drive Resumable Upload Session URL and returns it to the client.
 * The client then uploads the file DIRECTLY to Google Drive without proxying through the server,
 * which removes all server-side memory limits and supports files up to 5 TB.
 *
 * Body: { fileName, fileSize, contentType, parentId?, folderId?, departmentId?, relativePath? }
 * Returns: { sessionUrl, folderId, finalName, parentId }
 */
import { requireFilePermission } from "~~/server/utils/permission";
import { ensureGDrivePath, getAuthorizedGDriveFolder, listGDriveFolder } from "~~/server/utils/gdrive";
import { getGDriveUploadAccess } from "~~/server/utils/gdrive-access";
import { getGDriveRules, getNomenclatureForDept, getOrgDepartments, getOrgFeatures } from "~~/server/utils/db";
import { evaluateUploadGovernance } from "~~/shared/utils/file-nomenclature";
import { planFileUpload } from "~~/shared/utils/file-collision";
import { resolveDepartmentUploadTarget, resolveDriveUploadParent } from "~~/shared/utils/department-upload";
import { normalizeUploadRelativePath } from "~~/shared/utils/folder-upload-target";
import { requireValidFolderPath } from "~~/server/utils/folderNomenclature";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canUpload");
  const orgId = (user as any).organizationId;
  const driveAccess = await getGDriveUploadAccess(user);
  const { connection, token } = driveAccess;

  if (user.role !== "admin") {
    const permissions = (user as any).permissions;
    if (permissions && !permissions.canUpload) {
      throw createError({ status: 403, message: "Forbidden: You do not have permission to upload files." });
    }
  }

  const body = await readBody<{
    fileName: string;
    fileSize: number;
    contentType?: string;
    parentId?: string;
    folderId?: string;
    departmentId?: string;
    relativePath?: string;
  }>(event);

  if (!body?.fileName || !body.fileSize) {
    throw createError({ status: 400, message: "fileName and fileSize are required." });
  }

  const rawParentId = (body.parentId as string) || "root";
  const explicitFolderId = String(body.folderId || "").trim();
  const requestedDepartmentId = String(body.departmentId || "").trim();
  const rawRelativePath = String(body.relativePath || body.fileName);

  let normalizedPath: ReturnType<typeof normalizeUploadRelativePath>;
  try {
    normalizedPath = normalizeUploadRelativePath(rawRelativePath);
  } catch {
    throw createError({ status: 400, message: "Invalid upload path." });
  }

  if (requestedDepartmentId === "root" && user.role !== "admin") {
    throw createError({ status: 403, message: "Only organization administrators can upload to the organization root." });
  }

  let departmentTarget: ReturnType<typeof resolveDepartmentUploadTarget> | null = null;
  if (requestedDepartmentId && requestedDepartmentId !== "root") {
    const departments = await getOrgDepartments(orgId);
    try {
      departmentTarget = resolveDepartmentUploadTarget({
        actor: user as any,
        departments,
        departmentId: requestedDepartmentId,
      });
    } catch (error: any) {
      const message = error?.message || "Invalid upload department.";
      const status = /access/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 409;
      throw createError({ status, message });
    }
  }

  let parentId = explicitFolderId || resolveDriveUploadParent({ rawParentId, departmentTarget });
  if (parentId === "root") {
    parentId = connection.folderId;
  }
  if (!explicitFolderId && !departmentTarget && rawParentId === "root") {
    const userRole = (user as any).role;
    const userDeptId = (user as any).departmentId;
    if (userRole !== "admin" && userDeptId) {
      const dept = driveAccess.departments.find(d => d.id === userDeptId);
      if (dept && dept.gdriveFolderId) {
        parentId = dept.gdriveFolderId;
      } else {
        throw createError({ status: 409, message: "Your department does not have a Google Drive folder mapping." });
      }
    } else {
      parentId = connection.folderId;
    }
  }

  const selectedFolder = await getAuthorizedGDriveFolder(token, parentId, driveAccess.allowedRootIds);
  const selectedDepartmentId = driveAccess.departments.find(
    d => d.gdriveFolderId === selectedFolder.authorizedRootId,
  )?.id;

  const folderPath = normalizedPath.directories.join("/");
  await requireValidFolderPath({
    user,
    relativePath: folderPath,
    departmentId: departmentTarget?.departmentId || selectedDepartmentId || (user as any).departmentId,
  });
  if (folderPath) {
    parentId = await ensureGDrivePath(token, parentId, folderPath);
  }

  // Governance check
  const [features, rules, nomenclature] = await Promise.all([
    getOrgFeatures(orgId || "org_default"),
    getGDriveRules(orgId || "org_default"),
    getNomenclatureForDept(
      orgId || "org_default",
      departmentTarget?.departmentId || selectedDepartmentId || (user as any).departmentId,
    ),
  ]);
  const enforceNomenclature = features.nomenclature !== false && !!rules.enforceNomenclature;
  const configuredSegments = Array.isArray(nomenclature?.segments) ? nomenclature.segments : [];

  const initialGovernance = evaluateUploadGovernance({
    enabled: enforceNomenclature,
    filename: body.fileName,
    segments: configuredSegments as any[],
    allowedExtensions: nomenclature?.allowedExtensions,
  });
  if (!initialGovernance.valid) {
    throw createError({ status: 422, message: `${body.fileName}: ${initialGovernance.message}` });
  }

  // Determine final name (deduplication)
  const existingItems = await listGDriveFolder(token, parentId);
  const uploadPlan = planFileUpload({
    requestedName: body.fileName,
    existingNames: existingItems.map(item => item.name),
    contentMatch: null, // We don't have MD5 yet — checked on completion
  });

  const finalGovernance = evaluateUploadGovernance({
    enabled: enforceNomenclature,
    filename: uploadPlan.finalName,
    segments: configuredSegments as any[],
    allowedExtensions: nomenclature?.allowedExtensions,
  });
  if (!finalGovernance.valid) {
    throw createError({ status: 422, message: `${uploadPlan.finalName}: ${finalGovernance.message}` });
  }

  // Create Google Drive Resumable Upload Session
  const contentType = body.contentType || "application/octet-stream";
  const metadata = {
    name: uploadPlan.finalName,
    parents: [parentId],
  };

  let sessionUrl = "";
  await $fetch<void>("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,md5Checksum,size", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": contentType,
      "X-Upload-Content-Length": String(body.fileSize),
    },
    body: JSON.stringify(metadata),
    onResponse({ response }) {
      sessionUrl = response.headers.get("location") || "";
    },
  });

  if (!sessionUrl) {
    throw createError({ status: 502, message: "Could not create a Google Drive upload session. Please try again." });
  }

  return {
    sessionUrl,
    folderId: parentId,
    finalName: uploadPlan.finalName,
    renamed: uploadPlan.renamed,
    originalName: body.fileName,
    destination: {
      id: selectedFolder.id,
      name: selectedFolder.name,
      path: selectedFolder.path,
      route: selectedFolder.id === connection.folderId
        ? "/org"
        : `/org/${encodeURIComponent(selectedFolder.id)}`,
    },
  };
});
