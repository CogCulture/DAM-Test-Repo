import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";
import { getFolder } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files } from "~~/server/database/schema";
import { and, eq, isNull } from "drizzle-orm";
import { spawn } from "node:child_process";
import { join, basename } from "node:path";
import { promises as fs } from "node:fs";
import { getLocalDamStoragePath } from "~~/server/utils/localBlob";
import { resolveRuntimeStorageTarget } from "~~/shared/utils/drive-storage";

const RAGPUSH_DIR = join(process.cwd(), "server", "utils");
const PYTHON_CMD = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");

const SUPPORTED_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".pdf", ".pptx", ".docx", ".xlsx", ".xls",
  ".mp4", ".mov", ".avi", ".mkv",
  ".mp3", ".wav", ".m4a",
  ".jpg", ".jpeg", ".png", ".webp"
]);

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

    // Check if the file is already processed for RAG
    const meta = (item.assetMetadata as Record<string, any>) || {};
    if (meta.ragProcessedAt || meta.parsedFileId || meta.ragStatus === "processed") {
      sendEvent({
        type: "complete",
        cost: meta.ragCost || 0,
        fileId: meta.parsedFileId || item.id,
        reused: true,
        message: "File is already indexed in RAG.",
      });
      event.node.res.end();
      return;
    }

    // Resolve file extension
    const fileName = item.name || fileId;
    const lastDotIndex = fileName.lastIndexOf(".");
    const ext = lastDotIndex !== -1 ? fileName.substring(lastDotIndex).toLowerCase() : "";

    if (!ext || !SUPPORTED_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported file type for RAG: ${ext || "unknown"}`);
    }

    // Resolve local file path
    const storageTarget = resolveRuntimeStorageTarget(process.env);
    let localFilePath = "";

    if (storageTarget === "local") {
      localFilePath = getLocalDamStoragePath(item.storagePath || item.path);
    } else {
      // For cloud storage, download to temp
      const tempDir = join(process.cwd(), "uploads", "rag_temp");
      await fs.mkdir(tempDir, { recursive: true });
      localFilePath = join(tempDir, `${item.id}_${basename(item.name)}`);

      try {
        const hBlob = await hubBlob().get(item.storagePath || item.path);
        if (hBlob) {
          const buffer = Buffer.from(await hBlob.arrayBuffer());
          await fs.writeFile(localFilePath, buffer);
        }
      } catch {
        // Try reading from local filesystem as fallback
        const localPath = getLocalDamStoragePath(item.storagePath || item.path);
        await fs.copyFile(localPath, localFilePath);
      }
    }

    // Verify file exists
    try {
      await fs.access(localFilePath);
    } catch {
      throw new Error(`File binary not found at storage path: ${item.storagePath || item.path}`);
    }

    // Check API keys
    const scriptPath = join(RAGPUSH_DIR, "rag_parsers", "run_pipeline.py");
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const pineconeKey = process.env.PINECONE_API_KEY;

    if (!pineconeKey) {
      throw new Error("RAG is not configured. PINECONE_API_KEY is missing in .env.");
    }

    if (ext !== ".txt" && ext !== ".md" && ext !== ".markdown" && !apiKey) {
      throw new Error("RAG is not configured. ANTHROPIC_API_KEY is missing in .env.");
    }

    const orgId = item.organizationId || "org_default";
    const departmentId = item.departmentId || "global";

    // Mark file as processing in DB
    await db
      .update(files)
      .set({ processingStatus: "processing", updatedAt: new Date() })
      .where(eq(files.id, item.id));

    return new Promise((resolve) => {
      sendEvent({ type: "start", message: `Starting RAG processing for ${fileName}...` });

      const args = [
        "-u",
        scriptPath,
        localFilePath,
        fileId,
        fileName,
        ext,
        "Unknown",
        orgId,
        user.id,
        user.role || "user",
        departmentId,
      ];

      const child = spawn(PYTHON_CMD, args, {
        cwd: RAGPUSH_DIR,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          RAG_USE_BATCH: process.env.RAG_USE_BATCH || "false",
          ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
          PINECONE_API_KEY: pineconeKey,
        },
      });

      const configuredTimeout = Number(process.env.RAG_PROCESS_TIMEOUT_MS);
      const processTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 60_000
        ? configuredTimeout
        : 12 * 60 * 1000;
      const startedAt = Date.now();
      let terminalEventSent = false;
      let heartbeat: ReturnType<typeof setInterval>;
      let processTimeout: ReturnType<typeof setTimeout>;

      const clearTimers = () => {
        clearInterval(heartbeat);
        clearTimeout(processTimeout);
      };
      const finishStream = () => {
        clearTimers();
        if (!event.node.res.writableEnded) event.node.res.end();
        resolve(true);
      };

      heartbeat = setInterval(() => {
        if (terminalEventSent || event.node.res.writableEnded) return;
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        sendEvent({ type: "progress", text: `Still processing ${fileName} (${elapsedSeconds}s elapsed)...` });
      }, 15_000);

      processTimeout = setTimeout(() => {
        if (terminalEventSent) return;
        terminalEventSent = true;
        sendEvent({
          type: "fatal",
          message: "RAG processing exceeded time limit. Try again or reduce the document complexity.",
        });
        child.kill();
        db.update(files)
          .set({ processingStatus: "failed", updatedAt: new Date(), assetMetadata: { ...(item.assetMetadata as any || {}), ingestionError: "Timed out" } })
          .where(eq(files.id, item.id))
          .catch(() => {});
        finishStream();
      }, processTimeoutMs);

      event.node.res.on("close", () => {
        if (terminalEventSent || event.node.res.writableEnded) return;
        terminalEventSent = true;
        child.kill();
        clearTimers();
        resolve(true);
      });

      child.on("error", (err) => {
        if (terminalEventSent) return;
        terminalEventSent = true;
        sendEvent({ type: "fatal", message: `Process spawn failed: ${err.message}` });
        db.update(files)
          .set({ processingStatus: "failed", updatedAt: new Date() })
          .where(eq(files.id, item.id))
          .catch(() => {});
        finishStream();
      });

      let stdoutData = "";
      let stderrData = "";
      let cost = 0;

      child.stdout.on("data", (data) => {
        const text = data.toString();
        stdoutData += text;
        const costMatch = text.match(/\$([0-9]+\.[0-9]+)/);
        if (costMatch) cost = parseFloat(costMatch[1]);
        sendEvent({ type: "progress", text });
      });

      child.stderr.on("data", (data) => {
        const text = data.toString();
        stderrData += text;
        sendEvent({ type: "progress", text });
      });

      child.on("close", async (code) => {
        if (terminalEventSent) return;
        terminalEventSent = true;
        clearTimers();

        if (code !== 0) {
          const jsonError = [...`${stdoutData}\n${stderrData}`.matchAll(/\{"error"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\}/g)].at(-1)?.[1];
          const detail = jsonError ? JSON.parse(`"${jsonError}"`) : stderrData.trim().split("\n").at(-1) || `Exit code ${code}`;
          sendEvent({ type: "fatal", message: detail });

          await db.update(files)
            .set({
              processingStatus: "failed",
              updatedAt: new Date(),
              assetMetadata: { ...(item.assetMetadata as any || {}), ingestionError: String(detail), failedStage: "rag_pipeline" },
            })
            .where(eq(files.id, item.id))
            .catch(() => {});
        } else {
          // Parse output path and cost from Python stdout
          let finalPath = "";
          try {
            const lines = stdoutData.trim().split("\n");
            const lastLine = lines[lines.length - 1];
            const jsonRes = JSON.parse(lastLine);
            if (jsonRes.cost) cost = jsonRes.cost;
            if (jsonRes.output_path) finalPath = jsonRes.output_path;
          } catch {
            const outMatch = stdoutData.match(/Output saved to '([^']+)'/);
            if (outMatch) finalPath = outMatch[1];
          }

          // Save parsed markdown artifact into DAM storage & DB
          try {
            if (finalPath) {
              // No need to copy the parsed markdown into DAM — the RAG search
              // works entirely from Pinecone vectors.  The intermediate .md
              // file stays on disk only for potential re-processing.

              // Mark source file as processed
              await db.update(files)
                .set({
                  processingStatus: "processed",
                  updatedAt: new Date(),
                  assetMetadata: {
                    ...(item.assetMetadata as any || {}),
                    ragCost: cost,
                    ragProcessedAt: new Date().toISOString(),
                    ragStatus: "processed",
                  },
                })
                .where(eq(files.id, item.id));
            }

            sendEvent({ type: "complete", cost });
          } catch (err: any) {
            if (err.message?.includes("UNIQUE constraint failed")) {
              sendEvent({ type: "complete", cost });
            } else {
              console.error("[RAG] Failed to save parsed MD:", err);
              sendEvent({ type: "fatal", message: `Failed to save parsed file: ${err.message}` });
            }
          }
        }

        // Cleanup temp files
        if (storageTarget !== "local") {
          try {
            await fs.rm(localFilePath, { force: true });
          } catch {}
        }

        event.node.res.end();
        resolve(true);
      });
    });
  } catch (err: any) {
    sendEvent({ type: "fatal", message: err.message || "An unexpected error occurred." });
    event.node.res.end();
  }
});
