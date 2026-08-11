import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { orgDepartments, users } from "~~/server/database/schema";
import { parseGoogleDriveFileLink } from "~~/shared/utils/google-drive-link";
import { evaluateUploadGovernance } from "~~/shared/utils/file-nomenclature";
import { planFileUpload } from "~~/shared/utils/file-collision";
import { getGDriveRules, getNomenclatureForDept, getOrgFeatures } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import {
  getGDriveAccessToken,
  getGDriveConnection,
  listGDriveFolder,
} from "~~/server/utils/gdrive";
import { requireFilePermission } from "~~/server/utils/permission";
import { fetchRemoteFile } from "~~/server/utils/remoteFile";

const MAX_REMOTE_FILE_BYTES = 100 * 1024 * 1024;

const uploadBufferToDrive = async (input: {
  token: string;
  parentId: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}) => {
  const boundary = `dam-import-${crypto.randomUUID()}`;
  const metadata = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({
      name: input.filename,
      parents: [input.parentId],
    })}\r\n--${boundary}\r\nContent-Type: ${input.contentType}\r\n\r\n`,
    "utf8",
  );
  const closing = Buffer.from(`\r\n--${boundary}--`, "utf8");
  return await $fetch<{ id: string; name: string; mimeType: string; md5Checksum?: string }>(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,md5Checksum",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: Buffer.concat([metadata, input.bytes, closing]),
    },
  );
};

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canUpload");
  const body = await readBody<{ url?: string; parentId?: string; filename?: string }>(event);
  const sourceUrl = String(body?.url || "").trim();
  if (!sourceUrl) throw createError({ status: 400, message: "A public file URL is required." });

  const orgId = user.organizationId || "org_default";
  const db = useDrizzle();
  const [orgAdmin] = user.role === "admin"
    ? [user]
    : await db.select().from(users).where(and(eq(users.organizationId, orgId), eq(users.role, "admin"))).limit(1);
  if (!orgAdmin) throw createError({ status: 500, message: "Organization administrator not found." });

  const connection = await getGDriveConnection(orgAdmin.id);
  if (!connection || connection.status !== "approved") {
    throw createError({ status: 403, message: "Google Drive folder hosting is not approved." });
  }
  const token = await getGDriveAccessToken(orgAdmin.id);
  let parentId = String(body?.parentId || "root");
  if (parentId === "root") {
    if (user.role !== "admin" && user.departmentId) {
      const [department] = await db
        .select()
        .from(orgDepartments)
        .where(eq(orgDepartments.id, user.departmentId))
        .limit(1);
      parentId = department?.gdriveFolderId || connection.folderId || "root";
    } else {
      parentId = connection.folderId || "root";
    }
  }

  const [features, rules, nomenclature, existingItems] = await Promise.all([
    getOrgFeatures(orgId),
    getGDriveRules(orgId),
    getNomenclatureForDept(orgId, user.departmentId),
    listGDriveFolder(token, parentId),
  ]);
  const governanceEnabled = features.nomenclature !== false && rules.enforceNomenclature;
  const configuredSegments = Array.isArray(nomenclature?.segments) ? nomenclature.segments : [];

  let driveSource: ReturnType<typeof parseGoogleDriveFileLink> | null = null;
  try {
    driveSource = parseGoogleDriveFileLink(sourceUrl);
  } catch {
    driveSource = null;
  }

  let requestedName: string;
  let contentType: string;
  let contentHash: string | null;
  let remoteBytes: Buffer | null = null;
  let sourceDriveId: string | null = null;

  if (driveSource) {
    const metadata = await $fetch<{ id: string; name: string; mimeType: string; md5Checksum?: string }>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveSource.id)}?fields=id,name,mimeType,md5Checksum`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    sourceDriveId = metadata.id;
    requestedName = body?.filename?.trim() || metadata.name;
    contentType = metadata.mimeType || "application/octet-stream";
    contentHash = metadata.md5Checksum || null;
  } else {
    let remoteFile;
    try {
      remoteFile = await fetchRemoteFile({ url: sourceUrl, maxBytes: MAX_REMOTE_FILE_BYTES, timeoutMs: 60_000 });
    } catch (error: any) {
      throw createError({ status: 400, message: error?.message || "The remote file could not be downloaded." });
    }
    remoteBytes = remoteFile.bytes;
    requestedName = body?.filename?.trim() || remoteFile.filename;
    contentType = remoteFile.contentType;
    contentHash = crypto.createHash("md5").update(remoteFile.bytes).digest("hex");
  }

  const initialGovernance = evaluateUploadGovernance({
    enabled: governanceEnabled,
    filename: requestedName,
    segments: configuredSegments as any[],
    allowedExtensions: nomenclature?.allowedExtensions,
  });
  if (!initialGovernance.valid) {
    throw createError({ status: 422, message: `${requestedName}: ${initialGovernance.message}` });
  }

  const contentMatch = contentHash
    ? existingItems.find((item) => item.md5Checksum === contentHash) || null
    : null;
  const uploadPlan = planFileUpload({
    requestedName,
    existingNames: existingItems.map((item) => item.name),
    contentMatch: contentMatch ? {
      id: contentMatch.id,
      name: contentMatch.name,
      storagePath: contentMatch.id,
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

  let imported: { id: string; name: string; mimeType: string; md5Checksum?: string };
  if (sourceDriveId) {
    imported = await $fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sourceDriveId)}/copy?fields=id,name,mimeType,md5Checksum`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: { name: uploadPlan.finalName, parents: [parentId] },
      },
    );
  } else {
    imported = await uploadBufferToDrive({
      token,
      parentId,
      filename: uploadPlan.finalName,
      contentType,
      bytes: remoteBytes!,
    });
  }

  return {
    success: true,
    file: imported,
    import: {
      sourceUrl,
      requestedName,
      finalName: imported.name || uploadPlan.finalName,
      renamed: uploadPlan.renamed,
      duplicate: uploadPlan.duplicate,
      copiedIntoDrive: true,
    },
  };
});
