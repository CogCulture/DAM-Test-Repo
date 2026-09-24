import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import { promises as fs, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, dirname } from "node:path";
import exifr from "exifr";
import { cleanPath, getContentType } from "~~/shared/utils/helper";
import { getFolder, getGDriveRules, getNomenclatureForDept, getOrgDepartments, getOrgFeatures, insertUpdateFile } from "~~/server/utils/db";
import { getLocalDamStorageRoot, getLocalDamStoragePath, localBlob } from "~~/server/utils/localBlob";
import { getFileDepartmentId, verifyBucket } from "~~/server/utils/permission";
import { readZipContentsFromFile } from "~~/server/utils/zip";
import { evaluateUploadGovernance } from "~~/shared/utils/file-nomenclature";
import { files } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { and, eq, isNull } from "drizzle-orm";
import { planFileUpload } from "~~/shared/utils/file-collision";
import { requireValidFolderPath } from "~~/server/utils/folderNomenclature";
import { resolveLocalDepartmentUploadTarget } from "~~/shared/utils/department-upload";
import { enqueueIngestionJob } from "~~/server/utils/ingestionQueue";
import { logPipelineEvent } from "~~/server/utils/auditLogger";

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

/**
 * Stream the incoming HTTP request body to a temp file on disk.
 * Simultaneously computes the MD5 hash without holding the file in memory.
 * Supports files of any size (up to disk space / OS limits).
 */
async function streamBodyToFile(
  req: import("node:http").IncomingMessage,
  destPath: string,
): Promise<{ md5: string; size: number }> {
  await fs.mkdir(dirname(destPath), { recursive: true });
  const hash = crypto.createHash("md5");
  let size = 0;

  const writeStream = createWriteStream(destPath);

  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      hash.update(chunk);
      if (!writeStream.write(chunk)) {
        req.pause();
        writeStream.once("drain", () => req.resume());
      }
    });
    req.on("end", () => {
      writeStream.end();
    });
    req.on("error", reject);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  return { md5: hash.digest("hex"), size };
}

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canUpload");
  const orgId = (user as any).organizationId || "org_default";
  const query = getQuery(event);
  let parentId = String(query.parentId || "root");
  const requestedDepartmentId = String(query.departmentId || "").trim();
  let departmentId = (user as any).departmentId || null;

  if (requestedDepartmentId === "root") {
    departmentId = parentId === "root"
      ? null
      : await getFileDepartmentId(parentId, orgId);
  } else if (requestedDepartmentId) {
    try {
      const target = resolveLocalDepartmentUploadTarget({
        actor: user as any,
        departments: await getOrgDepartments(orgId),
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
    departmentId = await getFileDepartmentId(parentId, orgId) || departmentId;
  } else if ((user as any).role !== "admin" && !departmentId) {
    const depts = await getOrgDepartments(orgId);
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
    getOrgFeatures(orgId),
    getGDriveRules(orgId),
    getNomenclatureForDept(orgId, departmentId),
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
    const parent = await getFolder(parentId, orgId);
    if (parent && parent.type === "folder") {
      parentPath = parent.path;
    }
  }

  const headerType = getHeader(event, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const detectedType = getContentType(fileName);
  const contentType = !headerType || headerType === "application/octet-stream"
    ? detectedType
    : headerType;
  const dimensions = getHeader(event, "x-dam-dimensions") || null;

  // ── Stream to a temp file ─────────────────────────────────────────────────
  const storageRoot = getLocalDamStorageRoot();
  const tempDir = join(storageRoot, ".tmp_uploads");
  await fs.mkdir(tempDir, { recursive: true });
  const tempFile = join(tempDir, `upload_${Date.now()}_${Math.random().toString(36).slice(2)}_${fileName}`);

  let md5 = "";
  let fileSize = 0;

  try {
    const streamed = await streamBodyToFile(event.node.req, tempFile);
    md5 = streamed.md5;
    fileSize = streamed.size;
  } catch (err: any) {
    await fs.unlink(tempFile).catch(() => undefined);
    throw createError({ status: 400, message: `Upload stream failed: ${err?.message || "unknown error"}` });
  }

  if (!fileSize) {
    await fs.unlink(tempFile).catch(() => undefined);
    throw createError({ status: 400, message: "The uploaded file content was not received." });
  }

  // ── Plan deduplication & naming ──────────────────────────────────────────
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
    await fs.unlink(tempFile).catch(() => undefined);
    throw createError({ status: 422, message: `${uploadPlan.finalName}: ${finalGovernance.message}` });
  }

  const finalRelativePath = relativeDirectory
    ? `${relativeDirectory}/${uploadPlan.finalName}`
    : uploadPlan.finalName;
  const logicalPath = cleanPath(`${parentPath}/${finalRelativePath}`);
  const physicalPath = uploadPlan.duplicate ? uploadPlan.reuseStoragePath : logicalPath;

  // ── Move temp file to final storage location ──────────────────────────────
  if (!uploadPlan.duplicate) {
    const finalStoragePath = getLocalDamStoragePath(physicalPath);
    await fs.mkdir(dirname(finalStoragePath), { recursive: true });
    try {
      // Try atomic rename first (same filesystem — instant)
      await fs.rename(tempFile, finalStoragePath);
    } catch (renameErr: any) {
      if (renameErr.code === "EXDEV") {
        // Cross-device: copy then delete
        await pipeline(createReadStream(tempFile), createWriteStream(finalStoragePath));
        await fs.unlink(tempFile).catch(() => undefined);
      } else {
        await fs.unlink(tempFile).catch(() => undefined);
        throw renameErr;
      }
    }
  } else {
    // Duplicate content — discard the temp file, reuse existing storage
    await fs.unlink(tempFile).catch(() => undefined);
  }

  const storedFile = await localBlob().head(physicalPath);
  if (!storedFile || storedFile.size !== fileSize) {
    throw createError({ status: 500, message: "The server could not verify the file in local DAM storage." });
  }

  // ── Build asset metadata ──────────────────────────────────────────────────
  const basicMetadata: Record<string, any> = {
    size: fileSize,
    contentType,
    extension: fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : null,
    storage: "local",
  };

  let assetMetadata = basicMetadata;

  // EXIF for images — read from the file on disk (not a huge in-memory buffer)
  if (contentType.startsWith("image/") && !uploadPlan.duplicate) {
    try {
      const finalStoragePath = getLocalDamStoragePath(physicalPath);
      const imgBuffer = await fs.readFile(finalStoragePath);
      const extracted = await exifr.parse(imgBuffer);
      if (extracted) assetMetadata = { ...basicMetadata, ...extracted };
    } catch (error) {
      console.warn(`Could not extract image metadata for ${fileName}:`, error);
    }
  }

  // ZIP central-directory inspection — low-memory, reads only the tail of the file
  if (fileName.toLowerCase().endsWith(".zip") && !uploadPlan.duplicate) {
    try {
      const finalStoragePath = getLocalDamStoragePath(physicalPath);
      const zipContents = await readZipContentsFromFile(finalStoragePath, fileSize);
      assetMetadata = {
        ...assetMetadata,
        archiveEntries: zipContents.entries,
        archiveEntryCount: zipContents.totalEntries,
      };
    } catch (error) {
      // Non-fatal — ZIP inspection failure doesn't block the upload
      console.warn(`Could not inspect ZIP contents for ${fileName}:`, error);
    }
  }

  try {
    const record = await insertUpdateFile(bucket.name, parentId, {
      pathname: logicalPath,
      fullPath: logicalPath,
      blobPath: physicalPath,
      contentType,
      size: fileSize,
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

    const insertedFile = Array.isArray(record) ? record[0] : record;

    // Log Stage 0 upload audit event
    await logPipelineEvent({
      organizationId: user.organizationId,
      departmentId,
      fileId: insertedFile.id,
      eventType: "upload_received",
      stage: "stage_0",
      status: "success",
      details: {
        fileName,
        contentType,
        size: fileSize,
        physicalPath,
        duplicate: uploadPlan.duplicate,
      },
    });

    // Enqueue Stage 1 background ingestion job
    const queueRes = await enqueueIngestionJob(
      {
        fileId: insertedFile.id,
        organizationId: user.organizationId,
        departmentId,
        blobPath: physicalPath,
        contentType,
      },
      event
    );

    // Log Stage 1 queue enqueue audit event
    await logPipelineEvent({
      organizationId: user.organizationId,
      departmentId,
      fileId: insertedFile.id,
      eventType: "ingestion_enqueued",
      stage: "stage_1",
      status: "info",
      details: {
        queueType: queueRes.queueType,
      },
    });

    return {
      success: true,
      file: insertedFile,
      storage: {
        type: "local",
        directoryName: getLocalDamStorageRoot().split(/[\/\\]/).pop(),
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
