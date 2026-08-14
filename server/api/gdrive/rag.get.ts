import { requireFilePermission } from "~~/server/utils/permission";
import { getGDriveAccessToken, getGDriveConnection } from "~~/server/utils/gdrive";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files, users } from "~~/server/database/schema";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import { eq, and } from "drizzle-orm";
import { buildRagArtifactMetadata, getRagArtifactName } from "~~/shared/utils/rag-artifact";

// Same constants as the platform storage RAG handler
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
    const user = await requireFilePermission(event, "canUseRag");
    const query = getQuery(event);
    const fileId = query.fileId as string;
    const requestedFileName = query.fileName as string;

    if (!fileId) {
      throw new Error("Missing fileId");
    }

    // Resolve admin GDrive credentials (same pattern as gdrive/list/[id].get.ts)
    const orgId = (user as any).organizationId;
    const db = useDrizzle();
    let adminUserId = user.id;
    if (user.role !== "admin" && orgId) {
      const [orgAdmin] = await db
        .select()
        .from(users)
        .where(and(eq(users.organizationId, orgId), eq(users.role, "admin")));
      if (orgAdmin) adminUserId = orgAdmin.id;
    }

    const connection = await getGDriveConnection(adminUserId);
    if (!connection || connection.status !== "approved") {
      throw new Error("Google Drive folder hosting is not approved.");
    }

    const token = await getGDriveAccessToken(adminUserId);

    const metadata = await $fetch<{ name: string; mimeType: string; parents?: string[] }>(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,parents`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const fileName = metadata.name || requestedFileName || fileId;
    const contentType = String(metadata.mimeType || "").toLowerCase();
    const exportTypes: Record<string, { mime: string; extension: string }> = {
      "application/vnd.google-apps.document": {
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extension: ".docx",
      },
    };
    const exportType = exportTypes[contentType];
    const lastIndex = fileName.lastIndexOf(".");
    const nameExt = lastIndex !== -1 ? fileName.substring(lastIndex).toLowerCase() : "";
    const ext = SUPPORTED_EXTENSIONS.has(nameExt)
      ? nameExt
      : exportType?.extension || (contentType === "text/plain" ? ".txt" : "");

    if (!ext) {
      throw new Error(`Unsupported file type for RAG: ${nameExt || contentType || "none"}`);
    }

    const tempDir = join(process.cwd(), "uploads", "rag_temp");
    await fs.mkdir(tempDir, { recursive: true });
    const localFilePath = join(tempDir, `${fileId}${ext}`);
    const downloadUrl = exportType
      ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportType.mime)}`
      : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const downloadRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!downloadRes.ok) {
      throw new Error(`Failed to download file from Google Drive (${downloadRes.status}).`);
    }
    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    await fs.writeFile(localFilePath, buffer);

    const parentGDriveFolderId = metadata.parents?.[0] || connection.folderId;

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
    sendEvent({ type: "start", message: `Starting RAG processing for ${fileName}...` });

    const args = [
      "-u",
      scriptPath,
      localFilePath,
      fileId,
      fileName,
      ext,
      "Unknown", // client
      orgId || "org_default",
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
        const detail = jsonError ? JSON.parse(`"${jsonError}"`) : stderrData.trim().split("\n").at(-1);
        sendEvent({ type: "fatal", message: detail || `Process exited with code ${code}` });
      } else {
        // ─── Identical output resolution logic as platform handler ───
        let finalPath = "";
        try {
          const lines = stdoutData.trim().split("\n");
          const lastLine = lines[lines.length - 1];
          const jsonRes = JSON.parse(lastLine);
          if (jsonRes.cost) cost = jsonRes.cost;
          if (jsonRes.output_path) finalPath = jsonRes.output_path;
        } catch {
          const outMatch = stdoutData.match(/Output saved to '([^']+)'/);
          if (outMatch) {
            finalPath = outMatch[1];
          } else {
            finalPath = localFilePath.replace(
              /\.[^/.]+$/,
              ext === ".txt" ? "_parsed.md" : "_anthropic_parsed.md",
            );
          }
        }

        try {
          await fs.access(finalPath);
          const mdContent = await fs.readFile(finalPath, "utf-8");

          const generatedSuffix = ext === ".txt"
            ? "_parsed.md"
            : finalPath.endsWith("_fast_parsed.md")
              ? "_fast_parsed.md"
              : "_anthropic_parsed.md";
          const newName = getRagArtifactName(fileName, generatedSuffix);

          // ── GDrive-specific: upload parsed MD back to the same parent folder ──
          const form = new FormData();
          const meta = JSON.stringify({ name: newName, parents: [parentGDriveFolderId] });
          form.append("metadata", new Blob([meta], { type: "application/json" }));
          form.append("file", new Blob([mdContent], { type: "text/markdown" }), newName);

          const uploadResponse = await fetch(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: form,
            }
          );
          if (!uploadResponse.ok) {
            throw new Error(`Google Drive rejected the parsed file (${uploadResponse.status}).`);
          }
          const uploadedArtifact = await uploadResponse.json() as { id: string; name?: string };

          // ── Same DB insert as platform handler ──
          // Store a reference record in the local DB so the file appears in the DAM
          const targetPath = `gdrive/${parentGDriveFolderId}/${newName}`;
          try {
            await db.insert(files).values({
              id: uploadedArtifact.id,
              name: newName,
              path: targetPath,
              type: "file",
              contentType: "text/markdown",
              size: Buffer.byteLength(mdContent),
              bucketName: "org",
              parentId: parentGDriveFolderId,
              organizationId: orgId || "org_default",
              visibility: "private",
              userId: user.id,
              assetMetadata: {
                ...buildRagArtifactMetadata({
                  id: fileId,
                  name: fileName,
                  path: fileId,
                }),
                source: "google-drive",
                googleDriveFileId: uploadedArtifact.id,
                storageProvider: "gdrive",
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          } catch (dbErr: any) {
            // UNIQUE constraint — already exists, not a real error
            if (!dbErr.message?.includes("UNIQUE constraint failed")) {
              console.warn("DB insert warning:", dbErr.message);
            }
          }

          sendEvent({ type: "complete", cost });
        } catch (err: any) {
          if (err.message?.includes("UNIQUE constraint failed")) {
            sendEvent({ type: "complete", cost });
          } else {
            console.error("Failed to save parsed MD:", err);
            sendEvent({ type: "fatal", message: `Failed to save parsed file: ${err.message}` });
          }
        }
      }

      // Cleanup temp files (same as platform handler)
      try {
        await fs.rm(localFilePath, { force: true });
        // Clean up the parsed output file too
        const parsedPath = localFilePath.replace(/\.[^/.]+$/, "_anthropic_parsed.md");
        await fs.rm(parsedPath, { force: true }).catch(() => {});
        const fastParsedPath = localFilePath.replace(/\.[^/.]+$/, "_fast_parsed.md");
        await fs.rm(fastParsedPath, { force: true }).catch(() => {});
        const plainTextParsedPath = localFilePath.replace(/\.[^/.]+$/, "_parsed.md");
        await fs.rm(plainTextParsedPath, { force: true }).catch(() => {});
      } catch {}

      event.node.res.end();
      resolve(true);
    });
  });
  } catch (err: any) {
    sendEvent({ type: "fatal", message: err.message || "An error occurred" });
    event.node.res.end();
  }
});
