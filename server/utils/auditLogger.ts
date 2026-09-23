import { ulid } from "ulidx";
import { pipelineAuditLogs } from "~~/server/database/schema";
import { useDrizzle } from "./drizzle";

export interface PipelineAuditEvent {
  organizationId: string;
  departmentId?: string | null;
  fileId: string;
  eventType:
    | "upload_received"
    | "ingestion_enqueued"
    | "processing_started"
    | "metadata_extracted"
    | "vector_indexed"
    | "ingestion_completed"
    | "ingestion_failed"
    | "dlq_moved"
    | "file_deleted";
  stage: "stage_0" | "stage_1" | "stage_2" | "stage_3" | "stage_4" | "stage_5";
  status: "info" | "success" | "warning" | "error";
  details?: Record<string, any>;
}

/**
 * Persists structured pipeline audit log records into SQLite.
 */
export async function logPipelineEvent(event: PipelineAuditEvent): Promise<string> {
  const id = ulid();
  try {
    const db = useDrizzle();
    await db.insert(pipelineAuditLogs).values({
      id,
      organizationId: event.organizationId || "org_default",
      departmentId: event.departmentId || null,
      fileId: event.fileId,
      eventType: event.eventType,
      stage: event.stage,
      status: event.status,
      details: event.details || {},
      createdAt: new Date(),
    });
  } catch (err: any) {
    console.error(`[AuditLogger] Error logging pipeline event for file ${event.fileId}:`, err?.message || err);
  }
  return id;
}
