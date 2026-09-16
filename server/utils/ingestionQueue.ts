import { eq, and } from "drizzle-orm";
import { files } from "~~/server/database/schema";
import { useDrizzle } from "./drizzle";
import { executeFileIngestion } from "./ingestionPipeline";

export interface IngestionJobPayload {
  fileId: string;
  organizationId: string;
  departmentId: string | null;
  blobPath: string;
  contentType: string;
  createdAt?: number;
  retryCount?: number;
  lastAttemptAt?: number;
  lastError?: string;
}

export interface IngestionResult {
  success: boolean;
  fileId: string;
  status: "processing" | "processed" | "failed" | "skipped";
  message?: string;
  cost?: number;
  parsedFileId?: string;
}

export interface DeadLetterJobRecord {
  job: IngestionJobPayload;
  failedReason: string;
  movedToDlqAt: string;
  totalAttempts: number;
}

const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1000;

// In-memory Dead Letter Queue storage for local development & runtime inspection
const deadLetterQueueStore: DeadLetterJobRecord[] = [];

/**
 * Returns all jobs currently in the Dead Letter Queue.
 */
export function getDeadLetterJobs(): DeadLetterJobRecord[] {
  return [...deadLetterQueueStore];
}

/**
 * Retries a job from the Dead Letter Queue by re-enqueueing it with reset attempt counts.
 */
export async function retryDeadLetterJob(fileId: string): Promise<boolean> {
  const index = deadLetterQueueStore.findIndex((record) => record.job.fileId === fileId);
  if (index === -1) {
    return false;
  }

  const [record] = deadLetterQueueStore.splice(index, 1);
  const resetJob: IngestionJobPayload = {
    ...record.job,
    retryCount: 0,
    lastError: undefined,
  };

  await enqueueIngestionJob(resetJob);
  return true;
}

/**
 * Consumer worker: processes incoming queue ingestion jobs.
 * Executes the ingestion pipeline with exponential backoff retries and DLQ routing.
 */
export async function processIngestionJob(job: IngestionJobPayload): Promise<IngestionResult> {
  console.log(`[IngestionConsumer] Processing job for file ${job?.fileId} (attempt ${(job?.retryCount || 0) + 1}/${MAX_RETRY_ATTEMPTS})`);

  if (!job || !job.fileId || !job.organizationId || !job.blobPath) {
    const errorMsg = "Invalid ingestion job payload: missing required fields (fileId, organizationId, blobPath).";
    console.error(`[IngestionConsumer] Error: ${errorMsg}`, job);
    throw new Error(errorMsg);
  }

  const currentAttempt = job.retryCount || 0;

  try {
    const db = useDrizzle();
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, job.fileId), eq(files.organizationId, job.organizationId)))
      .limit(1);

    if (!file) {
      const errorMsg = `File record ${job.fileId} not found in organization ${job.organizationId}.`;
      console.warn(`[IngestionConsumer] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    if (file.deletedAt) {
      console.log(`[IngestionConsumer] File ${job.fileId} is deleted. Skipping ingestion.`);
      return { success: true, fileId: job.fileId, status: "skipped", message: "File is deleted." };
    }

    if (file.processingStatus === "processed") {
      console.log(`[IngestionConsumer] File ${job.fileId} is already processed. Skipping.`);
      return { success: true, fileId: job.fileId, status: "processed", message: "Already processed." };
    }

    // Execute the ingestion pipeline
    const pipelineResult = await executeFileIngestion(job);
    return {
      success: true,
      fileId: job.fileId,
      status: pipelineResult.status,
      cost: pipelineResult.cost,
      parsedFileId: pipelineResult.parsedFileId,
      message: pipelineResult.message || "Ingestion completed successfully.",
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    console.error(`[IngestionConsumer] Processing attempt ${currentAttempt + 1} failed for file ${job.fileId}:`, errorMessage);

    const nextAttempt = currentAttempt + 1;
    if (nextAttempt < MAX_RETRY_ATTEMPTS) {
      // Exponential backoff calculation: delay = base * 2^attempt
      const backoffDelayMs = BASE_RETRY_DELAY_MS * Math.pow(2, currentAttempt);
      console.log(`[IngestionConsumer] Scheduling retry ${nextAttempt + 1}/${MAX_RETRY_ATTEMPTS} for file ${job.fileId} in ${backoffDelayMs}ms`);

      const updatedJob: IngestionJobPayload = {
        ...job,
        retryCount: nextAttempt,
        lastAttemptAt: Date.now(),
        lastError: errorMessage,
      };

      // Schedule retry after backoff delay
      setTimeout(() => {
        localDevQueueRunner.push(updatedJob);
      }, backoffDelayMs);

      // Re-throw so caller knows this attempt failed
      throw error;
    } else {
      // Retry attempts exhausted -> Move job to Dead Letter Queue (DLQ)
      console.error(`[IngestionConsumer] All ${MAX_RETRY_ATTEMPTS} attempts exhausted for file ${job.fileId}. Moving job to DLQ.`);
      
      const dlqRecord: DeadLetterJobRecord = {
        job: {
          ...job,
          retryCount: nextAttempt,
          lastAttemptAt: Date.now(),
          lastError: errorMessage,
        },
        failedReason: errorMessage,
        movedToDlqAt: new Date().toISOString(),
        totalAttempts: nextAttempt,
      };

      deadLetterQueueStore.push(dlqRecord);

      // Update file record with DLQ status in database
      try {
        const db = useDrizzle();
        const [fileRecord] = await db.select().from(files).where(eq(files.id, job.fileId)).limit(1);
        const meta = (fileRecord?.assetMetadata as Record<string, any>) || {};

        await db
          .update(files)
          .set({
            processingStatus: "failed",
            updatedAt: new Date(),
            assetMetadata: {
              ...meta,
              failedStage: meta.failedStage || "dlq_exhausted",
              ingestionError: `Job moved to DLQ after ${nextAttempt} attempts. Final error: ${errorMessage}`,
              movedToDLQ: true,
              dlqTimestamp: dlqRecord.movedToDlqAt,
              totalRetryAttempts: nextAttempt,
            },
          })
          .where(eq(files.id, job.fileId));
      } catch (dbErr) {
        console.error(`[IngestionConsumer] Could not update DLQ state in DB for file ${job.fileId}:`, dbErr);
      }

      return {
        success: false,
        fileId: job.fileId,
        status: "failed",
        message: `Job moved to DLQ after ${nextAttempt} failed attempts: ${errorMessage}`,
      };
    }
  }
}

/**
 * Dev Queue Worker: In-memory async queue processor for local development & non-Cloudflare environments.
 */
class LocalDevQueueRunner {
  private queue: IngestionJobPayload[] = [];
  private isProcessing = false;

  public push(job: IngestionJobPayload) {
    this.queue.push(job);
    this.processNext();
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const job = this.queue.shift()!;
    try {
      await processIngestionJob(job);
    } catch (error) {
      console.warn(`[LocalDevQueueRunner] Job ${job.fileId} attempt failed:`, error);
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        setTimeout(() => this.processNext(), 50);
      }
    }
  }
}

const localDevQueueRunner = new LocalDevQueueRunner();

/**
 * Producer: Creates an ingestion job and pushes it to Cloudflare Queue or dev queue runner.
 */
export async function enqueueIngestionJob(
  payload: Omit<IngestionJobPayload, "createdAt">,
  event?: any
): Promise<{ enqueued: boolean; queueType: "cloudflare" | "local_dev" }> {
  const job: IngestionJobPayload = {
    ...payload,
    createdAt: Date.now(),
    retryCount: payload.retryCount ?? 0,
  };

  // 1. Try Cloudflare Queue binding from event context or global process env
  const cfQueue = event?.context?.cloudflare?.env?.INGESTION_QUEUE ||
    (process.env as any)?.INGESTION_QUEUE ||
    (globalThis as any)?.__env__?.INGESTION_QUEUE;

  if (cfQueue && typeof cfQueue.send === "function") {
    try {
      await cfQueue.send(job);
      console.log(`[IngestionProducer] Enqueued job to Cloudflare Queue for file ${job.fileId}`);
      return { enqueued: true, queueType: "cloudflare" };
    } catch (err) {
      console.error(`[IngestionProducer] Failed to send job to Cloudflare Queue, falling back to dev runner:`, err);
    }
  }

  // 2. Fallback to Local Dev Async Queue Runner
  console.log(`[IngestionProducer] Enqueued job to Local Dev Queue Runner for file ${job.fileId}`);
  localDevQueueRunner.push(job);
  return { enqueued: true, queueType: "local_dev" };
}
