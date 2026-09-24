import { eq, and, inArray, isNull } from "drizzle-orm";
import { files } from "~~/server/database/schema";
import { useDrizzle } from "./drizzle";
import { join, basename } from "node:path";
import { promises as fs } from "node:fs";
import { getLocalDamStoragePath } from "./localBlob";
import {
  buildRagArtifactMetadata,
  getRagArtifactName,
  getRagArtifactPath,
  resolveRagArtifactState,
} from "~~/shared/utils/rag-artifact";
import { resolveRuntimeStorageTarget } from "~~/shared/utils/drive-storage";
import { ulid } from "ulidx";
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
      } else {
        const hBlob = await hubBlob().get(file.storagePath || file.path);
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
          if (docResult.metadata?.ragCost) ragCost = docResult.metadata.ragCost;

          // Save extracted markdown artifact if available
          if (docResult.extractedText && docResult.outputPath) {
            const mdContent = docResult.extractedText;
            const generatedSuffix = (detected.ext === ".txt" || detected.ext === ".md" || detected.ext === ".markdown") ? "_parsed.md" : "_anthropic_parsed.md";
            const newName = getRagArtifactName(file.name, generatedSuffix);
            const targetPath = getRagArtifactPath(file.path, generatedSuffix);
            const sourceIdentity = {
              id: file.id,
              md5: file.md5,
              name: file.name,
              path: file.path,
            };

            const blobData = new Blob([mdContent], { type: "text/markdown" });
            if (storageTarget === "local") {
              await localBlob().put(targetPath, mdContent);
            } else {
              await hubBlob().put(targetPath, blobData);
            }

            const siblingFiles = await db.select().from(files).where(and(
              eq(files.organizationId, file.organizationId),
              eq(files.bucketName, file.bucketName),
              eq(files.parentId, file.parentId),
              eq(files.type, "file"),
              isNull(files.deletedAt),
            ));

            const artifactState = resolveRagArtifactState(sourceIdentity, siblingFiles);
            const now = new Date();
            const mdMetadata = {
              ...(artifactState.canonical?.assetMetadata || {}),
              ...buildRagArtifactMetadata(sourceIdentity),
              ragGeneratedSuffix: generatedSuffix,
            };

            parsedFileId = artifactState.canonical?.id || ulid();

            if (artifactState.canonical) {
              await db.update(files).set({
                name: newName,
                path: targetPath,
                storagePath: targetPath,
                contentType: "text/markdown",
                size: Buffer.byteLength(mdContent),
                visibility: file.visibility,
                departmentId: file.departmentId,
                processingStatus: "processed",
                assetMetadata: mdMetadata,
                updatedAt: now,
              }).where(eq(files.id, parsedFileId));
            } else {
              await db.insert(files).values({
                id: parsedFileId,
                name: newName,
                path: targetPath,
                storagePath: targetPath,
                type: "file",
                contentType: "text/markdown",
                size: Buffer.byteLength(mdContent),
                bucketName: file.bucketName,
                parentId: file.parentId,
                organizationId: file.organizationId,
                departmentId: file.departmentId,
                processingStatus: "processed",
                visibility: file.visibility,
                assetMetadata: mdMetadata,
                userId: file.userId,
                createdAt: now,
                updatedAt: now,
              });
            }

            if (artifactState.duplicateIds.length > 0) {
              await db.delete(files).where(inArray(files.id, artifactState.duplicateIds));
            }
          }
        } catch (docErr: any) {
          console.warn(`[IngestionPipeline] Document RAG error for ${file.name}:`, docErr?.message);
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
