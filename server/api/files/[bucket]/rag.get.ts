import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";
import { getFolder } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files } from "~~/server/database/schema";
import { and, eq, isNull } from "drizzle-orm";
import { enqueueIngestionJob } from "~~/server/utils/ingestionQueue";

export default defineEventHandler(async (event) => {
  // Setup Server-Sent Events early to stream progress to the client
  setHeader(event, "Content-Type", "text/event-stream");
  setHeader(event, "Cache-Control", "no-cache");
  setHeader(event, "Connection", "keep-alive");

  const sendEvent = (data: any) => {
    if (!event.node.res.writableEnded) {
      event.node.res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const { bucket, user } = await verifyBucket(event, "canUseRag");
    const query = getQuery(event);
    const fileId = query.fileId as string;

    if (!fileId) {
      throw new Error("Missing fileId query parameter.");
    }

    await requireFileDepartmentAccess(user, fileId);

    // Fetch file record
    // @ts-ignore
    const item = await getFolder(fileId, user.organizationId);
    if (!item || item.bucketName !== bucket.name) {
      throw new Error("File not found in the specified bucket.");
    }

    const db = useDrizzle();

    // Check if the file is already processed or has a parsed markdown artifact
    if (item.processingStatus === "processed") {
      const meta = (item.assetMetadata as Record<string, any>) || {};
      sendEvent({
        type: "complete",
        cost: meta.ragCost || 0,
        fileId: meta.parsedFileId || item.id,
        reused: true,
        message: "File processing completed.",
      });
      event.node.res.end();
      return;
    }

    // Check if already failed
    if (item.processingStatus === "failed") {
      const meta = (item.assetMetadata as Record<string, any>) || {};
      sendEvent({
        type: "fatal",
        message: meta.ingestionError || "File ingestion failed previously.",
        failedStage: meta.failedStage || "unknown",
      });
      event.node.res.end();
      return;
    }

    // If file is not yet queued or processing, trigger queue enqueue automatically
    if (!item.processingStatus) {
      sendEvent({ type: "start", message: `Enqueueing automated ingestion for ${item.name}...` });
      await enqueueIngestionJob(
        {
          fileId: item.id,
          organizationId: item.organizationId,
          departmentId: item.departmentId || null,
          blobPath: item.storagePath || item.path,
          contentType: item.contentType || "application/octet-stream",
        },
        event
      );
    } else {
      sendEvent({ type: "start", message: `Monitoring ingestion progress for ${item.name}...` });
    }

    // Poll DB for status updates while holding open the SSE stream
    const startedAt = Date.now();
    const timeoutMs = 12 * 60 * 1000; // 12 minutes max poll timeout

    return new Promise((resolve) => {
      const pollInterval = setInterval(async () => {
        try {
          if (event.node.res.writableEnded) {
            clearInterval(pollInterval);
            return resolve(true);
          }

          const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
          if (Date.now() - startedAt > timeoutMs) {
            clearInterval(pollInterval);
            sendEvent({
              type: "fatal",
              message: "Automated ingestion monitoring timed out after 12 minutes.",
            });
            event.node.res.end();
            return resolve(true);
          }

          // Fetch latest file record from DB
          const [currentFile] = await db
            .select()
            .from(files)
            .where(and(eq(files.id, item.id), isNull(files.deletedAt)))
            .limit(1);

          if (!currentFile) {
            clearInterval(pollInterval);
            sendEvent({ type: "fatal", message: "File record was deleted during processing." });
            event.node.res.end();
            return resolve(true);
          }

          const status = currentFile.processingStatus;
          const meta = (currentFile.assetMetadata as Record<string, any>) || {};

          if (status === "processed") {
            clearInterval(pollInterval);
            sendEvent({
              type: "complete",
              cost: meta.ragCost || 0,
              fileId: meta.parsedFileId || currentFile.id,
              reused: false,
              message: "Automated ingestion pipeline finished successfully.",
            });
            event.node.res.end();
            return resolve(true);
          }

          if (status === "failed") {
            clearInterval(pollInterval);
            sendEvent({
              type: "fatal",
              message: meta.ingestionError || "Automated ingestion failed.",
              failedStage: meta.failedStage || "pipeline_execution",
            });
            event.node.res.end();
            return resolve(true);
          }

          // Still pending_processing or processing
          sendEvent({
            type: "progress",
            text: `[${status || "queued"}] Automated ingestion in progress (${elapsedSeconds}s elapsed)...`,
          });
        } catch (err: any) {
          console.warn("[RAG-SSE] Error during polling:", err?.message);
        }
      }, 2000);

      event.node.res.on("close", () => {
        clearInterval(pollInterval);
        resolve(true);
      });
    });
  } catch (err: any) {
    sendEvent({ type: "fatal", message: err.message || "An unexpected error occurred." });
    event.node.res.end();
  }
});
