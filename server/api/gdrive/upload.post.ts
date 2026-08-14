import { requireFilePermission } from "~~/server/utils/permission";
import { ensureGDrivePath, getAuthorizedGDriveFolder, listGDriveFolder } from "~~/server/utils/gdrive";
import { getGDriveUploadAccess } from "~~/server/utils/gdrive-access";
import { getGDriveRules, getNomenclatureForDept, getOrgDepartments, getOrgFeatures } from "~~/server/utils/db";
import { evaluateUploadGovernance } from "~~/shared/utils/file-nomenclature";
import { planFileUpload } from "~~/shared/utils/file-collision";
import crypto from "node:crypto";
import { resolveDepartmentUploadTarget, resolveDriveUploadParent } from "~~/shared/utils/department-upload";
import { normalizeUploadRelativePath } from "~~/shared/utils/folder-upload-target";
import { requireValidFolderPath } from "~~/server/utils/folderNomenclature";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canUpload");
  const orgId = (user as any).organizationId;
  const driveAccess = await getGDriveUploadAccess(user);
  const { connection, token } = driveAccess;

  // Permissions validation
  if (user.role !== "admin") {
    const permissions = (user as any).permissions;
    if (permissions && !permissions.canUpload) {
      throw createError({ status: 403, message: "Forbidden: You do not have permission to upload files." });
    }
  }

  const query = getQuery(event);
  const rawParentId = (query.parentId as string) || "root";
  const explicitFolderId = String(query.folderId || "").trim();
  const requestedDepartmentId = String(query.departmentId || "").trim();
  let normalizedPath: ReturnType<typeof normalizeUploadRelativePath>;
  try {
    normalizedPath = normalizeUploadRelativePath(String(query.relativePath || ""));
  } catch {
    throw createError({ status: 400, message: "Invalid Google Drive upload path." });
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
      const dept = driveAccess.departments.find(department => department.id === userDeptId);
      if (dept && dept.gdriveFolderId) {
        parentId = dept.gdriveFolderId;
      } else {
        throw createError({ status: 409, message: "Your department does not have a Google Drive folder mapping." });
      }
    } else {
      parentId = connection.folderId;
    }
  }

  const selectedFolder = await getAuthorizedGDriveFolder(
    token,
    parentId,
    driveAccess.allowedRootIds,
  );
  const selectedDepartmentId = driveAccess.departments.find(
    department => department.gdriveFolderId === selectedFolder.authorizedRootId,
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

  const filesData = await readMultipartFormData(event);
  if (!filesData || filesData.length === 0) {
    throw createError({ status: 400, message: "No files uploaded." });
  }

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


  const existingItems = await listGDriveFolder(token, parentId);
  const outcomes: Array<Record<string, any>> = [];

  for (const part of filesData) {
    if (!part.filename) continue;

    const initialGovernance = evaluateUploadGovernance({
      enabled: enforceNomenclature,
      filename: part.filename,
      segments: configuredSegments as any[],
      allowedExtensions: nomenclature?.allowedExtensions,
    });
    if (!initialGovernance.valid) {
      throw createError({ status: 422, message: `${part.filename}: ${initialGovernance.message}` });
    }

    const md5 = crypto.createHash("md5").update(part.data).digest("hex");
    const contentMatch = existingItems.find((item) => item.md5Checksum === md5) || null;
    const uploadPlan = planFileUpload({
      requestedName: part.filename,
      existingNames: existingItems.map((item) => item.name),
      contentMatch: contentMatch ? {
        id: contentMatch.id,
        name: contentMatch.name,
        storagePath: contentMatch.id,
      } : null,
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


    if (uploadPlan.duplicate) {
      const shortcut = await $fetch<{ id: string; name: string; mimeType: string }>(
        "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,shortcutDetails",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: {
            name: uploadPlan.finalName,
            mimeType: "application/vnd.google-apps.shortcut",
            shortcutDetails: { targetId: uploadPlan.duplicateOfId },
            parents: [parentId],
            appProperties: { damDuplicateOf: uploadPlan.duplicateOfId },
          },
        },
      );
      existingItems.push({
        id: shortcut.id,
        name: shortcut.name,
        mimeType: shortcut.mimeType,
        shortcutDetails: { targetId: uploadPlan.duplicateOfId },
      });
      outcomes.push({
        id: shortcut.id,
        originalName: part.filename,
        finalName: uploadPlan.finalName,
        renamed: uploadPlan.renamed,
        duplicate: true,
        duplicateOfName: uploadPlan.duplicateOfName,
      });
      continue;
    }

    const metadata = {
      name: uploadPlan.finalName,
      parents: [parentId],
    };
    let uploadedFile: { id: string; name?: string; mimeType?: string; md5Checksum?: string } | null = null;

    // For files > 5MB (like zip files), use Google Drive Resumable Upload API
    if (part.data.length > 5 * 1024 * 1024) {
      try {
        let sessionUrl = "";
        await $fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": part.type || "application/octet-stream",
            "X-Upload-Content-Length": String(part.data.length),
          },
          body: JSON.stringify(metadata),
          onResponse({ response }) {
            sessionUrl = response.headers.get("location") || "";
          },
        });

        if (!sessionUrl) {
          throw new Error("Failed to get resumable upload session URL from Google Drive.");
        }

        uploadedFile = await $fetch<{ id: string; name?: string; mimeType?: string; md5Checksum?: string }>(sessionUrl, {
          method: "PUT",
          headers: {
            "Content-Length": String(part.data.length),
            "Content-Type": part.type || "application/octet-stream",
          },
          body: part.data,
        });
      } catch (err: any) {
        const detail = err?.data?.error?.message || err?.message || String(err);
        console.error("Google Drive Resumable Upload failed:", detail);
        throw createError({ status: 502, message: `Upload failed for ${part.filename}: ${detail}` });
      }
    } else {
      // Standard multipart upload for files <= 5MB
      const boundary = "-------314159265358979323846";
      const part1Header = `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) + `\r\n`;

      const part2Header = `--${boundary}\r\n` +
        `Content-Type: ${part.type || "application/octet-stream"}\r\n\r\n`;

      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartBody = Buffer.concat([
        Buffer.from(part1Header + part2Header, "utf-8"),
        part.data,
        Buffer.from(closeDelimiter, "utf-8"),
      ]);

      try {
        uploadedFile = await $fetch<{ id: string; name?: string; mimeType?: string; md5Checksum?: string }>("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,md5Checksum", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        });
      } catch (err: any) {
        const detail = err?.data?.error?.message || err?.message || String(err);
        console.error("Google Drive API upload failed:", detail);
        throw createError({ status: 502, message: `Upload failed for ${part.filename}: ${detail}` });
      }
    }

    if (uploadedFile) {
      existingItems.push({
        id: uploadedFile.id,
        name: uploadedFile.name || uploadPlan.finalName,
        mimeType: uploadedFile.mimeType || part.type || "application/octet-stream",
        md5Checksum: uploadedFile.md5Checksum || md5,
      });
    }
    outcomes.push({
      id: uploadedFile?.id,
      originalName: part.filename,
      finalName: uploadPlan.finalName,
      renamed: uploadPlan.renamed,
      duplicate: false,
    });
  }

  return {
    success: true,
    files: outcomes,
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
