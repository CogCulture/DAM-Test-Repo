import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { files } from "~~/server/database/schema";
import { cleanPath } from "~~/shared/utils/helper";
import { evaluateUploadGovernance } from "~~/shared/utils/file-nomenclature";
import { planFileUpload } from "~~/shared/utils/file-collision";
import {
  getFolder,
  getGDriveRules,
  getNomenclatureForDept,
  getOrgFeatures,
  insertUpdateFile,
} from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { localBlob } from "~~/server/utils/localBlob";
import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";
import { fetchRemoteFile } from "~~/server/utils/remoteFile";

import { buildGoogleDrivePublicUrl, parseGoogleDriveFileLink } from "~~/shared/utils/google-drive-link";

const MAX_REMOTE_FILE_BYTES = 100 * 1024 * 1024;

const normalizeFilenameOverride = (value?: string) => {
  if (!value?.trim()) return null;
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "-")
    .replace(/[. ]+$/gu, "")
    .slice(0, 180);
  if (!normalized || normalized === "." || normalized === "..") {
    throw createError({ status: 400, message: "Enter a valid filename." });
  }
  return normalized;
};

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canUpload");
  const body = await readBody<{ url?: string; parentId?: string; filename?: string }>(event);
  const sourceUrl = String(body?.url || "").trim();
  if (!sourceUrl) throw createError({ status: 400, message: "A public file URL is required." });

  const parentId = String(body?.parentId || "root");
  await requireFileDepartmentAccess(user, parentId);

  let parentPath = bucket.name;
  if (parentId !== "root") {
    const parent = await getFolder(parentId, user.organizationId);
    if (!parent || parent.type !== "folder" || parent.bucketName !== bucket.name) {
      throw createError({ status: 404, message: "Destination folder not found." });
    }
    parentPath = parent.path;
  }

  let targetUrl = sourceUrl;
  try {
    const driveLink = parseGoogleDriveFileLink(sourceUrl);
    targetUrl = buildGoogleDrivePublicUrl(driveLink);
  } catch {
    targetUrl = sourceUrl;
  }

  let remoteFile;
  try {
    remoteFile = await fetchRemoteFile({
      url: targetUrl,
      maxBytes: MAX_REMOTE_FILE_BYTES,
      timeoutMs: 60_000,
    });
  } catch (error: any) {
    throw createError({ status: 400, message: error?.message || "The remote file could not be downloaded." });
  }

  const requestedName = normalizeFilenameOverride(body?.filename) || remoteFile.filename;
  const [features, rules, nomenclature] = await Promise.all([
    getOrgFeatures(user.organizationId),
    getGDriveRules(user.organizationId),
    getNomenclatureForDept(user.organizationId, user.departmentId),
  ]);
  const governanceEnabled = features.nomenclature !== false && rules.enforceNomenclature;
  const configuredSegments = Array.isArray(nomenclature?.segments) ? nomenclature.segments : [];
  const initialGovernance = evaluateUploadGovernance({
    enabled: governanceEnabled,
    filename: requestedName,
    segments: configuredSegments as any[],
    allowedExtensions: nomenclature?.allowedExtensions,
  });
  if (!initialGovernance.valid) {
    throw createError({ status: 422, message: `${requestedName}: ${initialGovernance.message}` });
  }

  const md5 = crypto.createHash("md5").update(remoteFile.bytes).digest("hex");
  const candidates = await useDrizzle()
    .select({
      id: files.id,
      name: files.name,
      path: files.path,
      storagePath: files.storagePath,
      parentId: files.parentId,
      md5: files.md5,
    })
    .from(files)
    .where(and(
      eq(files.bucketName, bucket.name),
      eq(files.organizationId, user.organizationId),
      isNull(files.deletedAt),
    ));
  const siblings = candidates.filter((candidate) => candidate.parentId === parentId);
  const duplicate = candidates.find((candidate) => candidate.md5 === md5) || null;
  const uploadPlan = planFileUpload({
    requestedName,
    existingNames: siblings.map((candidate) => candidate.name),
    contentMatch: duplicate ? {
      id: duplicate.id,
      name: duplicate.name,
      storagePath: duplicate.storagePath || duplicate.path,
    } : null,
  });
  const finalGovernance = evaluateUploadGovernance({
    enabled: governanceEnabled,
    filename: uploadPlan.finalName,
    segments: configuredSegments as any[],
    allowedExtensions: nomenclature?.allowedExtensions,
  });
  if (!finalGovernance.valid) {
    throw createError({ status: 422, message: `${uploadPlan.finalName}: ${finalGovernance.message}` });
  }

  const logicalPath = cleanPath(`${parentPath}/${uploadPlan.finalName}`);
  const physicalPath = uploadPlan.duplicate ? uploadPlan.reuseStoragePath : logicalPath;
  let wroteBlob = false;
  try {
    if (!uploadPlan.duplicate) {
      await localBlob().put(physicalPath, remoteFile.bytes);
      wroteBlob = true;
    }
    const departmentId = parentId !== "root"
      ? (await getFileDepartmentId(parentId, user.organizationId) || (user as any).departmentId || null)
      : ((user as any).departmentId || null);

    const record = await insertUpdateFile(bucket.name, parentId, {
      pathname: logicalPath,
      fullPath: logicalPath,
      blobPath: physicalPath,
      contentType: remoteFile.contentType,
      size: remoteFile.bytes.length,
      userId: user.id,
      departmentId,
      processingStatus: "pending_processing",
      md5,
      duplicateOfId: uploadPlan.duplicate ? uploadPlan.duplicateOfId : null,
      assetMetadata: {
        source: "url-import",
        sourceUrl: remoteFile.finalUrl,
        duplicate: uploadPlan.duplicate,
        duplicateOfName: uploadPlan.duplicate ? uploadPlan.duplicateOfName : null,
      },
    });
    return {
      success: true,
      file: Array.isArray(record) ? record[0] : record,
      import: {
        sourceUrl: remoteFile.finalUrl,
        requestedName,
        finalName: uploadPlan.finalName,
        renamed: uploadPlan.renamed,
        duplicate: uploadPlan.duplicate,
        duplicateOfName: uploadPlan.duplicate ? uploadPlan.duplicateOfName : null,
      },
    };
  } catch (error) {
    if (wroteBlob) await localBlob().del(physicalPath).catch(() => undefined);
    throw error;
  }
});
