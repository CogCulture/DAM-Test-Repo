import crypto from "node:crypto";
import { createWriteStream, createReadStream, promises as fs } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, dirname } from "node:path";
import { readRawBody } from "h3";
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
 * Append incoming request chunk body to a target file on disk.
 */
async function appendChunkToFile(
  req: import("node:http").IncomingMessage,
  destPath: string
): Promise<number> {
  await fs.mkdir(dirname(destPath), { recursive: true });
  let bytesWritten = 0;
  const writeStream = createWriteStream(destPath, { flags: "a" });

  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk: Buffer) => {
      bytesWritten += chunk.length;
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

  return bytesWritten;
}

/**
 * Calculate MD5 hash and verified total size of a file on disk.
 */
async function computeFileMetadata(filePath: string): Promise<{ md5: string; size: number }> {
  const hash = crypto.createHash("md5");
  let size = 0;
  const readStream = createReadStream(filePath);

  await new Promise<void>((resolve, reject) => {
    readStream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      hash.update(chunk);
    });
    readStream.on("end", resolve);
    readStream.on("error", reject);
  });

  return { md5: hash.digest("hex"), size };
}

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canUpload");
  const orgId = (user as any).organizationId || "org_default";

  const query = getQuery(event);
  const headers = getHeaders(event);

  const sessionKey = String(query.sessionKey || headers["x-upload-session-key"] || "").trim();
  const rangeStart = Number(query.rangeStart ?? headers["x-range-start"] ?? 0);
  const rangeEnd = Number(query.rangeEnd ?? headers["x-range-end"] ?? 0);
  const totalSize = Number(query.totalSize ?? headers["x-total-size"] ?? 0);
  const isFinalChunk = (query.isFinalChunk || headers["x-is-final-chunk"]) === "1" || rangeEnd === totalSize - 1;

  if (!sessionKey || !/^[a-zA-Z0-9_-]+$/.test(sessionKey)) {
    throw createError({ status: 400, message: "Invalid upload session key." });
  }

  let parentId = String(query.parentId || headers["x-parent-id"] || "root");
  const requestedDepartmentId = String(query.departmentId || headers["x-department-id"] || "").trim();
  let departmentId = (user as any).departmentId || null;

  if (requestedDepartmentId === "root") {
    departmentId = parentId === "root" ? null : await getFileDepartmentId(parentId, orgId);
  } else if (requestedDepartmentId) {
    try {
      const target = resolveLocalDepartmentUploadTarget({
        actor: user as any,
        departments: await getOrgDepartments(orgId),
        departmentId: requestedDepartmentId,
      });
      departmentId = target.departmentId;
    } catch {
      departmentId = (user as any).departmentId || null;
    }
  } else if (parentId !== "root") {
    departmentId = (await getFileDepartmentId(parentId, orgId)) || departmentId;
  }

  const relativePathRaw = String(query.relativePath || headers["x-relative-path"] || "");
  const relativePath = normalizeRelativePath(relativePathRaw);
  const fileName = relativePath.split("/").pop()!;

  const storageRoot = getLocalDamStorageRoot();
  const tempDir = join(storageRoot, ".tmp_uploads");
  const tempFile = join(tempDir, `chunk_${sessionKey}_${fileName}`);

  try {
    let rawBuf: Buffer | null = null;
    try {
      const raw = await readRawBody(event, false);
      if (raw) {
        if (Buffer.isBuffer(raw)) rawBuf = raw;
        else if (raw instanceof Uint8Array) rawBuf = Buffer.from(raw);
        else if (typeof raw === "string") rawBuf = Buffer.from(raw);
      }
    } catch {}

    if (rawBuf && rawBuf.length > 0) {
      await fs.mkdir(dirname(tempFile), { recursive: true });
      await fs.appendFile(tempFile, rawBuf);
    } else {
      await appendChunkToFile(event.node.req, tempFile);
    }
  } catch (err: any) {
    throw createError({ status: 400, message: `Chunk transfer failed: ${err?.message || "unknown error"}` });
  }

  if (!isFinalChunk) {
    return { success: true, done: false, sessionKey };
  }

  // ── Final Chunk Processing ────────────────────────────────────────────────
  let md5 = "";
  let fileSize = 0;
  try {
    const meta = await computeFileMetadata(tempFile);
    md5 = meta.md5;
    fileSize = meta.size;
  } catch (err: any) {
    await fs.unlink(tempFile).catch(() => undefined);
    throw createError({ status: 500, message: `Failed to compute uploaded file checksum: ${err?.message}` });
  }

  if (totalSize > 0 && fileSize !== totalSize) {
    await fs.unlink(tempFile).catch(() => undefined);
    throw createError({ status: 400, message: `File size mismatch: expected ${totalSize} bytes, got ${fileSize}.` });
  }

  let parentPath = bucket.name;
  if (parentId !== "root") {
    const parent = await getFolder(parentId, orgId);
    if (parent && parent.type === "folder") {
      parentPath = parent.path;
    }
  }

  const relativeParts = relativePath.split("/");
  relativeParts.pop();
  const relativeDirectory = relativeParts.join("/");

  const headerType = getHeader(event, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const detectedType = getContentType(fileName);
  const contentType = !headerType || headerType === "application/octet-stream" ? detectedType : headerType;
  const dimensions = getHeader(event, "x-dam-dimensions") || null;

  // Plan deduplication & naming
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
    .where(and(eq(files.bucketName, bucket.name), eq(files.organizationId, user.organizationId), isNull(files.deletedAt)));

  const siblings = candidates.filter((candidate) => {
    const parts = candidate.path.split("/");
    parts.pop();
    return cleanPath(parts.join("/")) === targetDirectory;
  });
  const duplicate = candidates.find((candidate) => candidate.md5 === md5) || null;
  const uploadPlan = planFileUpload({
    requestedName: fileName,
    existingNames: siblings.map((candidate) => candidate.name),
    contentMatch: duplicate
      ? {
          id: duplicate.id,
          name: duplicate.name,
          storagePath: duplicate.storagePath || duplicate.path,
        }
      : null,
  });

  const finalRelativePath = relativeDirectory ? `${relativeDirectory}/${uploadPlan.finalName}` : uploadPlan.finalName;
  const logicalPath = cleanPath(`${parentPath}/${finalRelativePath}`);
  const physicalPath = uploadPlan.duplicate ? uploadPlan.reuseStoragePath : logicalPath;

  if (!uploadPlan.duplicate) {
    const finalStoragePath = getLocalDamStoragePath(physicalPath);
    await fs.mkdir(dirname(finalStoragePath), { recursive: true });
    try {
      await fs.rename(tempFile, finalStoragePath);
    } catch (renameErr: any) {
      if (renameErr.code === "EXDEV") {
        await pipeline(createReadStream(tempFile), createWriteStream(finalStoragePath));
        await fs.unlink(tempFile).catch(() => undefined);
      } else {
        await fs.unlink(tempFile).catch(() => undefined);
        throw renameErr;
      }
    }
  } else {
    await fs.unlink(tempFile).catch(() => undefined);
  }

  const storedFile = await localBlob().head(physicalPath);
  if (!storedFile || storedFile.size !== fileSize) {
    throw createError({ status: 500, message: "The server could not verify the file in local DAM storage." });
  }

  const basicMetadata: Record<string, any> = {
    size: fileSize,
    contentType,
    extension: fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : null,
    storage: "local",
  };
  let assetMetadata = basicMetadata;

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
      assetMetadata: uploadPlan.duplicate
        ? {
            ...assetMetadata,
            duplicate: true,
            duplicateOfId: uploadPlan.duplicateOfId,
            duplicateOfName: uploadPlan.duplicateOfName,
          }
        : assetMetadata,
      duplicateOfId: uploadPlan.duplicate ? uploadPlan.duplicateOfId : null,
    });

    const insertedFile = Array.isArray(record) ? record[0] : record;

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

    return {
      success: true,
      done: true,
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
