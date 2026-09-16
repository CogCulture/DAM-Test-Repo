import crypto from "node:crypto";
import exifr from "exifr";
import { cleanPath, getContentType } from "~~/shared/utils/helper";
import { getFolder, getGDriveRules, getNomenclatureForDept, getOrgDepartments, getOrgFeatures, insertUpdateFile } from "~~/server/utils/db";
import { getLocalDamStorageRoot, localBlob } from "~~/server/utils/localBlob";
import { getFileDepartmentId, requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";
import { readZipContents } from "~~/server/utils/zip";
import { evaluateUploadGovernance } from "~~/shared/utils/file-nomenclature";
import { files } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { and, eq, isNull } from "drizzle-orm";
import { planFileUpload } from "~~/shared/utils/file-collision";
import { isUploadRouteAllowed } from "~~/shared/utils/drive-storage";
import { requireValidFolderPath } from "~~/server/utils/folderNomenclature";
import { resolveLocalDepartmentUploadTarget } from "~~/shared/utils/department-upload";

const normalizeRelativePath = (value: string) => {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (
    parts.length === 0 ||
    parts.some((part) => part === "." || part === ".." || part.includes("\0")) ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw createError({ status: 400, message: "Invalid file path." });
  }
  return parts.join("/");
};

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canUpload");
  const query = getQuery(event);
  let parentId = String(query.parentId || "root");
  const requestedDepartmentId = String(query.departmentId || "").trim();
  let departmentId = (user as any).departmentId || null;

  if (requestedDepartmentId === "root") {
    departmentId = parentId === "root"
      ? null
      : await getFileDepartmentId(parentId, user.organizationId);
  } else if (requestedDepartmentId) {
    try {
      const target = resolveLocalDepartmentUploadTarget({
        actor: user as any,
        departments: await getOrgDepartments(user.organizationId),
        departmentId: requestedDepartmentId,
      });
      departmentId = target.departmentId;
      if (parentId === "root") {
        parentId = target.folderId;
      }
    } catch (error: any) {
      // Fallback gracefully
      departmentId = (user as any).departmentId || null;
    }
  } else if (parentId !== "root") {
    departmentId = await getFileDepartmentId(parentId, user.organizationId) || departmentId;
  } else if ((user as any).role !== "admin" && !departmentId) {
    const depts = await getOrgDepartments(user.organizationId);
    if (depts && depts.length > 0) {
      departmentId = depts[0].id;
      if (depts[0].folderId) parentId = depts[0].folderId;
    }
  }

  const relativePath = normalizeRelativePath(String(query.relativePath || ""));
  const fileName = relativePath.split("/").pop()!;
  const relativeParts = relativePath.split("/");
  relativeParts.pop();
  const relativeDirectory = relativeParts.join("/");

  await requireValidFolderPath({
    user,
    relativePath: relativeDirectory,
    departmentId,
  });

  const [features, rules, nomenclature] = await Promise.all([
    getOrgFeatures(user.organizationId),
    getGDriveRules(user.organizationId),
    getNomenclatureForDept(user.organizationId, departmentId),
  ]);
  const governanceEnabled = features.nomenclature !== false && rules.enforceNomenclature;
  const configuredSegments = Array.isArray(nomenclature?.segments) ? nomenclature.segments : [];
  const initialGovernance = evaluateUploadGovernance({
    enabled: governanceEnabled,
    filename: fileName,
    segments: configuredSegments as any[],
    allowedExtensions: nomenclature?.allowedExtensions,
  });
  if (!initialGovernance.valid) {
    throw createError({ status: 422, message: `${fileName}: ${initialGovernance.message}` });
  }

  let parentPath = bucket.name;
  if (parentId !== "root") {
    const parent = await getFolder(parentId, user.organizationId);
    if (parent && parent.type === "folder") {
      parentPath = parent.path;
    }
  }

  const body = await readRawBody(event, false);
  if (body === undefined || body === null) {
    throw createError({ status: 400, message: "The uploaded file content was not received." });
  }

  const fileBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const headerType = getHeader(event, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const detectedType = getContentType(fileName);
  const contentType = !headerType || headerType === "application/octet-stream"
    ? detectedType
    : headerType;
  const dimensions = getHeader(event, "x-dam-dimensions") || null;
  const md5 = crypto.createHash("md5").update(fileBuffer).digest("hex");

  const targetDirectory = cleanPath(`${parentPath}/${relativeDirectory}`);
  const candidates = await useDrizzle()
    .select({
      id: files.id,
      name: files.name,
      path: files.path,
      storagePath: files.storagePath,
      md5: files.md5,
    })
    .from(files)
    .where(and(
      eq(files.bucketName, bucket.name),
      eq(files.organizationId, user.organizationId),
      isNull(files.deletedAt),
    ));

  const siblings = candidates.filter((candidate) => {
    const parts = candidate.path.split("/");
    parts.pop();
    return cleanPath(parts.join("/")) === targetDirectory;
  });
  const duplicate = candidates.find((candidate) => candidate.md5 === md5) || null;
  const uploadPlan = planFileUpload({
    requestedName: fileName,
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

  const finalRelativePath = relativeDirectory
    ? `${relativeDirectory}/${uploadPlan.finalName}`
    : uploadPlan.finalName;
  const logicalPath = cleanPath(`${parentPath}/${finalRelativePath}`);
  const physicalPath = uploadPlan.duplicate ? uploadPlan.reuseStoragePath : logicalPath;

  const basicMetadata: Record<string, any> = {
    size: fileBuffer.length,
    contentType,
    extension: fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : null,
    storage: "local",
  };

  let assetMetadata = basicMetadata;
  if (contentType.startsWith("image/")) {
    try {
      const extracted = await exifr.parse(fileBuffer);
      if (extracted) assetMetadata = { ...basicMetadata, ...extracted };
    } catch (error) {
      console.warn(`Could not extract image metadata for ${fileName}:`, error);
    }
  }

  if (fileName.toLowerCase().endsWith(".zip")) {
    try {
      const zipContents = readZipContents(fileBuffer);
      assetMetadata = {
        ...assetMetadata,
        archiveEntries: zipContents.entries,
        archiveEntryCount: zipContents.totalEntries,
      };
    } catch (error) {
      throw createError({ status: 400, message: `The selected ZIP archive is invalid or corrupted: ${fileName}` });
    }
  }

  if (!uploadPlan.duplicate) {
    await localBlob().put(physicalPath, fileBuffer);
  }
  const storedFile = await localBlob().head(physicalPath);
  if (!storedFile || storedFile.size !== fileBuffer.length) {
    throw createError({ status: 500, message: "The server could not verify the file in local DAM storage." });
  }

  try {
    const record = await insertUpdateFile(bucket.name, parentId, {
      pathname: logicalPath,
      fullPath: logicalPath,
      blobPath: physicalPath,
      contentType,
      size: fileBuffer.length,
      userId: user.id,
      departmentId,
      processingStatus: "pending_processing",
      dimensions,
      md5,
      assetMetadata: uploadPlan.duplicate ? {
        ...assetMetadata,
        duplicate: true,
        duplicateOfId: uploadPlan.duplicateOfId,
        duplicateOfName: uploadPlan.duplicateOfName,
      } : assetMetadata,
      duplicateOfId: uploadPlan.duplicate ? uploadPlan.duplicateOfId : null,
    });

    return {
      success: true,
      file: Array.isArray(record) ? record[0] : record,
      storage: {
        type: "local",
        directoryName: getLocalDamStorageRoot().split(/[\\/]/).pop(),
        relativePath: logicalPath,
        physicalPath,
        renamed: uploadPlan.renamed,
        originalName: fileName,
        finalName: uploadPlan.finalName,
        duplicate: uploadPlan.duplicate,
        duplicateOfName: uploadPlan.duplicate ? uploadPlan.duplicateOfName : null,
        verifiedSize: storedFile.size,
      },
    };
  } catch (error) {
    console.error(`Failed to register local DAM upload ${logicalPath}:`, error);
    throw createError({ status: 500, message: "The file was stored locally but its DAM record could not be created." });
  }
});
