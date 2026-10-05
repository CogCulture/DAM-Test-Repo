import { eq, and } from "drizzle-orm";
import { files } from "~~/server/database/schema";
import { useDrizzle } from "./drizzle";
import { join, basename } from "node:path";
import { promises as fs } from "node:fs";
import { getLocalDamStoragePath, localBlob } from "./localBlob";
import { resolveRuntimeStorageTarget } from "~~/shared/utils/drive-storage";
import type { IngestionJobPayload } from "./ingestionQueue";
import { detectFileType } from "./fileTypeDetector";
import { processImageFile } from "./mediaProcessors/imageProcessor";
import { processVideoFile } from "./mediaProcessors/videoProcessor";
import { processAudioFile } from "./mediaProcessors/audioProcessor";
import { processDocumentFile } from "./mediaProcessors/documentProcessor";
import { processDesignFile } from "./mediaProcessors/designProcessor";
import { logPipelineEvent } from "./auditLogger";
import { generateAiAutoTags } from "./aiTagging";

export interface PipelineExecutionResult {
  success: boolean;
  fileId: string;
  status: "processed" | "failed" | "skipped";
  message?: string;
  cost?: number;
  parsedFileId?: string;
}

/**
 * Executes the full Stage 2 multi-format ingestion pipeline.
 * Sniffs binary magic bytes, dispatches category-specific media/design/document processors,
 * updates DB processingStatus, and saves enriched metadata & renditions.
 */
export async function executeFileIngestion(job: IngestionJobPayload): Promise<PipelineExecutionResult> {
  const db = useDrizzle();

  // 1. Fetch file record
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, job.fileId), eq(files.organizationId, job.organizationId)))
    .limit(1);

  if (!file) {
    throw new Error(`File record ${job.fileId} not found in org ${job.organizationId}`);
  }

  if (file.deletedAt) {
    return { success: true, fileId: job.fileId, status: "skipped", message: "File is deleted" };
  }

  // 2. Idempotency check: if already processed, skip
  if (file.processingStatus === "processed") {
    console.log(`[IngestionPipeline] File ${job.fileId} is already marked processed. Skipping.`);
    return { success: true, fileId: job.fileId, status: "processed", message: "Already processed" };
  }

  // 3. Update status to 'processing'
  const currentMeta = (file.assetMetadata as Record<string, any>) || {};
  delete currentMeta.ingestionError;
  delete currentMeta.failedStage;
  delete currentMeta.failedAt;

  await db
    .update(files)
    .set({
      processingStatus: "processing",
      updatedAt: new Date(),
      assetMetadata: {
        ...currentMeta,
        ingestionStartedAt: new Date().toISOString(),
      },
    })
    .where(eq(files.id, job.fileId));

  // 4. Resolve local file binary & path
  const storageTarget = resolveRuntimeStorageTarget(process.env);
  let localFilePath = "";
  let tempDir = "";
  let fileBuffer: Buffer | null = null;

  try {
    if (storageTarget === "local") {
      localFilePath = getLocalDamStoragePath(file.storagePath || file.path);
      try {
        fileBuffer = await fs.readFile(localFilePath);
      } catch {}
    } else {
      tempDir = join(process.cwd(), "uploads", "rag_temp");
      await fs.mkdir(tempDir, { recursive: true });
      localFilePath = join(tempDir, `${file.id}_${basename(file.name)}`);

      let blob = await localBlob().get(file.storagePath || file.path);
      if (blob) {
        fileBuffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob as any);
      } else if (typeof (globalThis as any).hubBlob === "function") {
        const hBlob = await (globalThis as any).hubBlob().get(file.storagePath || file.path);
        if (hBlob) {
          fileBuffer = Buffer.from(await hBlob.arrayBuffer());
        }
      }

      if (fileBuffer) {
        await fs.writeFile(localFilePath, fileBuffer);
      }
    }
  } catch (err: any) {
    console.warn(`[IngestionPipeline] Could not load local binary buffer for ${file.name}:`, err?.message);
  }

  // Fallback buffer if missing
  if (!fileBuffer) {
    fileBuffer = Buffer.from("");
  }

  // 5. Magic Byte Detection & Category Dispatch
  const detected = detectFileType(fileBuffer, file.name);
  console.log(`[IngestionPipeline] Magic-byte format detected for ${file.name}: ${detected.description} (${detected.category})`);

  let categoryMetadata: Record<string, any> = {};
  let renditions: Record<string, string> = {};
  let ragCost = 0;
  let parsedFileId = "";

  try {
    switch (detected.category) {
      case "image": {
        const imgResult = await processImageFile(localFilePath, fileBuffer);
        categoryMetadata = imgResult.metadata;
        if (imgResult.renditions) renditions = imgResult.renditions;
        break;
      }

      case "video": {
        const vidResult = await processVideoFile(localFilePath, fileBuffer);
        categoryMetadata = vidResult.metadata;
        if (vidResult.renditions) renditions = vidResult.renditions;
        break;
      }

      case "audio": {
        const audResult = await processAudioFile(localFilePath, fileBuffer);
        categoryMetadata = audResult.metadata;
        break;
      }

      case "design": {
        const desResult = await processDesignFile(localFilePath, fileBuffer);
        categoryMetadata = desResult.metadata;
        if (desResult.renditions) renditions = desResult.renditions;
        break;
      }

      case "document": {
        try {
          const docResult = await processDocumentFile(
            localFilePath,
            file.id,
            file.name,
            detected.ext,
            file.organizationId,
            file.userId || "system",
            file.departmentId || "global"
          );
          categoryMetadata = docResult.metadata;
        } catch (docErr: any) {
          console.warn(`[IngestionPipeline] Document metadata error for ${file.name}:`, docErr?.message);
          categoryMetadata = {
            documentWarning: docErr?.message || String(docErr),
          };
        }
        break;
      }

      default: {
        categoryMetadata = {
          unhandledFormat: detected.description,
          magicBytesDetected: true,
        };
        break;
      }
    }
  } catch (procErr: any) {
    console.error(`[IngestionPipeline] Processor failed for ${file.id}:`, procErr);
  } finally {
    cleanupTempFile(tempDir, localFilePath);
  }

  // 6. AI Auto-Tagging
  const autoTags = await generateAiAutoTags({
    fileName: file.name,
    contentType: file.contentType,
    category: detected.category,
    ext: detected.ext,
    metadata: categoryMetadata,
  });

  // Combine existing manual tags with AI auto-generated tags
  const existingTags = (file.tags as string[]) || [];
  const mergedTags = Array.from(new Set([...existingTags, ...autoTags]));

  // 7. Update Target File with Enriched Metadata, AI Tags & Processed Status
  const finalMetadata = {
    ...currentMeta,
    ...categoryMetadata,
    detectedFileType: detected,
    renditions: Object.keys(renditions).length > 0 ? renditions : currentMeta.renditions,
    ingestionCompletedAt: new Date().toISOString(),
    ragCost: ragCost || currentMeta.ragCost || undefined,
    parsedFileId: parsedFileId || currentMeta.parsedFileId || undefined,
  };

  await db
    .update(files)
    .set({
      processingStatus: "processed",
      tags: mergedTags,
      updatedAt: new Date(),
      assetMetadata: finalMetadata,
    })
    .where(eq(files.id, file.id));

  await logPipelineEvent({
    organizationId: file.organizationId,
    departmentId: file.departmentId,
    fileId: file.id,
    eventType: "metadata_extracted",
    stage: "stage_2",
    status: "success",
    details: { category: detected.category, ext: detected.ext, categoryMetadata },
  });

  if (parsedFileId) {
    await logPipelineEvent({
      organizationId: file.organizationId,
      departmentId: file.departmentId,
      fileId: file.id,
      eventType: "vector_indexed",
      stage: "stage_3",
      status: "success",
      details: { parsedFileId, ragCost },
    });
  }

  await logPipelineEvent({
    organizationId: file.organizationId,
    departmentId: file.departmentId,
    fileId: file.id,
    eventType: "ingestion_completed",
    stage: "stage_4",
    status: "success",
    details: { ragCost, parsedFileId },
  });

  console.log(`[IngestionPipeline] Stage 2 Ingestion successfully completed for file ${file.id} (${file.name})`);

  return {
    success: true,
    fileId: file.id,
    status: "processed",
    cost: ragCost,
    parsedFileId,
  };
}

async function cleanupTempFile(tempDir: string, filePath: string) {
  if (tempDir && filePath) {
    try {
      await fs.rm(filePath, { force: true });
    } catch {}
  }
}
