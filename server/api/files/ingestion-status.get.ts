import { eq, inArray } from "drizzle-orm";
import { files, pipelineAuditLogs } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const fileIdsRaw = String(query.fileIds || "").trim();

  if (!fileIdsRaw) {
    throw createError({ status: 400, message: "fileIds parameter is required." });
  }

  const ids = fileIdsRaw.split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    return { success: true, statuses: [] };
  }

  const db = useDrizzle();
  const fileRecords = await db
    .select({
      id: files.id,
      name: files.name,
      processingStatus: files.processingStatus,
      updatedAt: files.updatedAt,
      assetMetadata: files.assetMetadata,
    })
    .from(files)
    .where(inArray(files.id, ids));

  const auditEvents = await db
    .select()
    .from(pipelineAuditLogs)
    .where(inArray(pipelineAuditLogs.fileId, ids));

  const auditMap = new Map<string, typeof auditEvents>();
  for (const ev of auditEvents) {
    const list = auditMap.get(ev.fileId) || [];
    list.push(ev);
    auditMap.set(ev.fileId, list);
  }

  const statuses = fileRecords.map((file) => ({
    fileId: file.id,
    fileName: file.name,
    processingStatus: file.processingStatus,
    updatedAt: file.updatedAt,
    metadata: file.assetMetadata,
    timeline: auditMap.get(file.id) || [],
  }));

  return {
    success: true,
    statuses,
  };
});
