import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";
import { getFolder } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files } from "~~/server/database/schema";
import { ulid } from "ulidx";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import { getLocalDamStoragePath } from "~~/server/utils/localBlob";
import {
  buildRagArtifactMetadata,
  getRagArtifactName,
  getRagArtifactPath,
  resolveRagArtifactState,
} from "~~/shared/utils/rag-artifact";
import { resolveRuntimeStorageTarget } from "~~/shared/utils/drive-storage";

// RAGPush parsers path
const RAGPUSH_DIR = join(process.cwd(), "server", "utils");
const PYTHON_CMD = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");

const SUPPORTED_EXTENSIONS = new Set([
  ".txt", ".pdf", ".pptx", ".docx", ".xlsx", ".xls",
  ".mp4", ".mov", ".avi", ".mkv",
  ".mp3", ".wav", ".m4a",
  ".jpg", ".jpeg", ".png", ".webp"
]);

export default defineEventHandler(async (event) => {
  // Setup Server-Sent Events early so we can stream validation errors to the client
  setHeader(event, "Content-Type", "text/event-stream");
  setHeader(event, "Cache-Control", "no-cache");
  setHeader(event, "Connection", "keep-alive");

  const sendEvent = (data: any) => {
    event.node.res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { bucket, user } = await verifyBucket(event, "canUseRag");
    const storageTarget = resolveRuntimeStorageTarget(process.env);
    const query = getQuery(event);
    const fileId = query.fileId as string;
    await requireFileDepartmentAccess(user, fileId);

    if (!fileId) {
      throw new Error("Missing fileId");
    }

    // @ts-ignore
    const item = await getFolder(fileId, user.organizationId);
    if (!item || item.bucketName !== bucket.name) {
      throw new Error("File not found");
    }

    const sourceIdentity = {
      id: item.id,
      md5: item.md5,
      name: item.name,
      path: item.path,
    };
    const db = useDrizzle();
    const existingSiblings = await db.select().from(files).where(and(
      eq(files.organizationId, item.organizationId),
      eq(files.bucketName, item.bucketName),
      eq(files.parentId, item.parentId),
      eq(files.type, "file"),
      isNull(files.deletedAt),
    ));
    const existingArtifact = resolveRagArtifactState(sourceIdentity, existingSiblings);

    if (existingArtifact.canonical && existingArtifact.canReuseContent) {
      const storagePath = existingArtifact.canonical.storagePath || existingArtifact.canonical.path;
      const storedArtifact = storageTarget === "local"
        ? await localBlob().head(storagePath)
        : await hubBlob().get(storagePath);

      if (storedArtifact) {
        await db.update(files).set({
          storagePath,
          assetMetadata: {
            ...(existingArtifact.canonical.assetMetadata || {}),
            ...buildRagArtifactMetadata(sourceIdentity),
          },
          updatedAt: new Date(),
        }).where(eq(files.id, existingArtifact.canonical.id));

        if (existingArtifact.duplicateIds.length > 0) {
          await db.delete(files).where(inArray(files.id, existingArtifact.duplicateIds));
        }

        sendEvent({
          type: "complete",
          cost: 0,
          fileId: existingArtifact.canonical.id,
          reused: true,
          message: "Existing parsed Markdown reused.",
        });
        event.node.res.end();
        return;
      }
    }

    // Define the local path of the file
    let localFilePath = "";
    let tempDir = "";
    if (storageTarget === "local") {
      localFilePath = getLocalDamStoragePath(item.storagePath || item.path);
    } else {
      // For BYOS, download to temp
      tempDir = join(process.cwd(), "uploads", "rag_temp");
      await fs.mkdir(tempDir, { recursive: true });
      localFilePath = join(tempDir, item.name);
      
      // We try localBlob first, then fallback to hubBlob
      let blob = await localBlob().get(item.storagePath || item.path);
      let bufferData: Buffer | null = null;
      
      if (blob) {
        bufferData = Buffer.isBuffer(blob) ? blob : Buffer.from(blob as any);
      } else {
        const hBlob = await hubBlob().get(item.storagePath || item.path);
        if (hBlob) {
          bufferData = Buffer.from(await hBlob.arrayBuffer());
        }
      }

      if (bufferData) {
        await fs.writeFile(localFilePath, bufferData);
      } else {
        throw new Error("Could not retrieve file from storage");
      }
    }

    const lastIndex = item.name.lastIndexOf(".");
    const nameExt = lastIndex !== -1 ? item.name.substring(lastIndex).toLowerCase() : "";
    const contentType = String(item.contentType || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const ext = SUPPORTED_EXTENSIONS.has(nameExt)
      ? nameExt
      : contentType === "text/plain"
        ? ".txt"
        : "";

    if (!ext) {
      throw new Error(`Unsupported file type for RAG: ${nameExt || contentType || "none"}`);
    }

    const scriptPath = join(RAGPUSH_DIR, "rag_parsers", "run_pipeline.py");
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const pineconeKey = process.env.PINECONE_API_KEY;

    if (!pineconeKey) {
      throw new Error("RAG is not configured. PINECONE_API_KEY is missing in .env.");
    }

    if (ext !== ".txt" && !apiKey) {
      throw new Error("RAG is not configured. ANTHROPIC_API_KEY is missing in .env.");
    }

  return new Promise((resolve) => {
    sendEvent({ type: "start", message: `Starting RAG processing for ${item.name}...` });

    const args = [
      "-u",
      scriptPath,
      localFilePath,
      item.id,
      item.name,
      ext,
      "Unknown", // client
      item.organizationId || "org_default",
      user.id,
      user.role || "user"
    ];
    
    const child = spawn(PYTHON_CMD, args, {
      cwd: RAGPUSH_DIR,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        RAG_USE_BATCH: process.env.RAG_USE_BATCH || "false",
        ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
        PINECONE_API_KEY: pineconeKey,
      }
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
      sendEvent({ type: "progress", text: `Still processing ${item.name} (${elapsedSeconds}s elapsed)...` });
    }, 15_000);

    processTimeout = setTimeout(() => {
      if (terminalEventSent) return;
      terminalEventSent = true;
      sendEvent({
        type: "fatal",
        message: "RAG processing exceeded 12 minutes and was stopped. Try again or reduce the document complexity.",
      });
      child.kill();
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
      finishStream();
    });

    let stdoutData = "";
    let stderrData = "";
    let cost = 0;

    child.stdout.on("data", (data) => {
      const text = data.toString();
      stdoutData += text;
      
      const costMatch = text.match(/\$([0-9]+\.[0-9]+)/);
      if (costMatch) {
        cost = parseFloat(costMatch[1]);
      }

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
        const detail = jsonError ? JSON.parse(`"${jsonError}"`) : stderrData.trim().split("\n").at(-1);
        sendEvent({ type: "fatal", message: detail || `Process exited with code ${code}` });
      } else {
        let finalPath = "";
        let jsonRes: any = null;
        try {
           const lines = stdoutData.trim().split('\n');
           const lastLine = lines[lines.length - 1];
           jsonRes = JSON.parse(lastLine);
           if (jsonRes.cost) cost = jsonRes.cost;
           if (jsonRes.output_path) finalPath = jsonRes.output_path;
        } catch (e) {
           const outMatch = stdoutData.match(/Output saved to '([^']+)'/);
           if (outMatch) {
               finalPath = outMatch[1];
           } else {
               const fallbackSuffix = ext === ".txt" ? "_parsed.md" : "_anthropic_parsed.md";
               finalPath = /\.[^/.]+$/.test(localFilePath)
                 ? localFilePath.replace(/\.[^/.]+$/, fallbackSuffix)
                 : `${localFilePath}${fallbackSuffix}`;
           }
        }

        try {
          await fs.access(finalPath);
          const mdContent = await fs.readFile(finalPath, "utf-8");
          
          // Automatically determine suffix based on the actual generated file.
          const generatedSuffix = ext === ".txt"
            ? "_parsed.md"
            : finalPath.endsWith("_fast_parsed.md")
              ? "_fast_parsed.md"
              : "_anthropic_parsed.md";
          const newName = getRagArtifactName(item.name, generatedSuffix);
          const targetPath = getRagArtifactPath(item.path, generatedSuffix);
          const sourceIdentity = {
            id: item.id,
            md5: item.md5,
            name: item.name,
            path: item.path,
          };

          const blobData = new Blob([mdContent], { type: "text/markdown" });
          if (storageTarget === "local") {
            await localBlob().put(targetPath, mdContent);
          } else {
            await hubBlob().put(targetPath, blobData);
          }

          const db = useDrizzle();
          const siblingFiles = await db.select().from(files).where(and(
            eq(files.organizationId, item.organizationId),
            eq(files.bucketName, item.bucketName),
            eq(files.parentId, item.parentId),
            eq(files.type, "file"),
            isNull(files.deletedAt),
          ));
          const artifactState = resolveRagArtifactState(sourceIdentity, siblingFiles);
          const now = new Date();
          const metadata = {
            ...(artifactState.canonical?.assetMetadata || {}),
            ...buildRagArtifactMetadata(sourceIdentity),
            ragGeneratedSuffix: generatedSuffix,
          };
          const parsedFileId = artifactState.canonical?.id || ulid();

          if (artifactState.canonical) {
            await db.update(files).set({
              name: newName,
              path: targetPath,
              storagePath: targetPath,
              contentType: "text/markdown",
              size: Buffer.byteLength(mdContent),
              visibility: item.visibility,
              assetMetadata: metadata,
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
              bucketName: item.bucketName,
              parentId: item.parentId,
              organizationId: item.organizationId,
              visibility: item.visibility,
              assetMetadata: metadata,
              userId: user.id,
              createdAt: now,
              updatedAt: now,
            });
          }

          if (artifactState.duplicateIds.length > 0) {
            await db.delete(files).where(inArray(files.id, artifactState.duplicateIds));
          }

          sendEvent({
            type: "complete",
            cost,
            fileId: parsedFileId,
            reused: Boolean(artifactState.canonical),
          });
        } catch (err: any) {
          if (err.message && err.message.includes("UNIQUE constraint failed")) {
            // Already exists, just send complete
            sendEvent({ type: "complete", cost: cost });
          } else {
            console.error("Failed to save MD file", err);
            sendEvent({ type: "fatal", message: `Failed to save database record: ${err.message}` });
          }
        }
      }
      
      try {
        if (tempDir) {
          await fs.rm(localFilePath, { force: true });
        }
      } catch(e) {}

      event.node.res.end();
      resolve(true);
    });
  });
  } catch (err: any) {
    sendEvent({ type: "fatal", message: err.message || "An error occurred" });
    event.node.res.end();
  }
});
