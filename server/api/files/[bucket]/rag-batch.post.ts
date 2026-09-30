/**
 * POST /api/files/:bucket/rag-batch
 *
 * Accepts a list of fileIds / items (or a single folderId to expand server-side),
 * writes a manifest JSON, spawns one Python process for the whole batch,
 * and streams SSE progress back to the client.
 *
 * Supports both local storage and Google Drive files.
 * Cost savings vs. N individual calls:
 *  - Single Python interpreter startup (not N)
 *  - Pinecone embeddings called ONCE for all chunks across all files
 *  - Pinecone upsert called ONCE per namespace (not N times)
 */

import { verifyBucket, requireFileDepartmentAccess } from "~~/server/utils/permission";
import { getItemById, getFolder } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files, users } from "~~/server/database/schema";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { spawn } from "node:child_process";
import { join, basename } from "node:path";
import { promises as fs } from "node:fs";
import { getLocalDamStoragePath } from "~~/server/utils/localBlob";
import { resolveRuntimeStorageTarget } from "~~/shared/utils/drive-storage";
import { getGDriveAccessToken, getGDriveConnection } from "~~/server/utils/gdrive";
import { ulid } from "ulidx";

const RAGPUSH_DIR = join(process.cwd(), "server", "utils");
const PYTHON_CMD = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");
const BATCH_SCRIPT = join(RAGPUSH_DIR, "rag_parsers", "run_batch_pipeline.py");

const SUPPORTED_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".pdf", ".pptx", ".docx", ".xlsx", ".xls",
  ".mp4", ".mov", ".avi", ".mkv",
  ".mp3", ".wav", ".m4a",
  ".jpg", ".jpeg", ".png", ".webp",
]);

const GDRIVE_EXPORT_TYPES: Record<string, { mime: string; extension: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: ".docx",
  },
};

function getExt(name: string) {
  const i = name.lastIndexOf(".");
  return i !== -1 ? name.substring(i).toLowerCase() : "";
}

interface BatchItemInput {
  id: string;
  name: string;
  size?: number;
  bucketName?: string;
  isGDrive?: boolean;
  googleDriveFileId?: string;
  contentType?: string;
  parentId?: string;
}

/** Recursively expand a folder to a flat list of supported file records. */
async function expandFolder(folderId: string, orgId: string, db: any): Promise<any[]> {
  const children = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.parentId, folderId),
        eq(files.organizationId, orgId),
        isNull(files.deletedAt),
      ),
    );

  const result: any[] = [];
  for (const child of children) {
    if (child.type === "folder") {
      result.push(...(await expandFolder(child.id, orgId, db)));
    } else {
      const ext = getExt(child.name);
      if (SUPPORTED_EXTENSIONS.has(ext)) result.push(child);
    }
  }
  return result;
}

export default defineEventHandler(async (event) => {
  // ── SSE setup ──────────────────────────────────────────────────────────────
  setHeader(event, "Content-Type", "text/event-stream");
  setHeader(event, "Cache-Control", "no-cache");
  setHeader(event, "Connection", "keep-alive");

  const sendEvent = (data: any) => {
    if (!event.node.res.writableEnded) {
      event.node.res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  let tempManifestPath = "";
  const tempFilesToClean: string[] = [];

  try {
    const { bucket, user } = await verifyBucket(event, "canUseRag");
    const body = await readBody<{
      fileIds?: string[];
      folderId?: string;
      items?: BatchItemInput[];
    }>(event);

    const pineconeKey = process.env.PINECONE_API_KEY;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!pineconeKey) {
      throw new Error("RAG is not configured. PINECONE_API_KEY is missing in .env.");
    }

    const db = useDrizzle();
    const orgId = (user as any).organizationId || "org_default";
    const storageTarget = resolveRuntimeStorageTarget(process.env);
    const gdriveMetaMap = new Map<string, any>();

    // Helper to get Google Drive auth
    let gdriveToken: string | null = null;
    let gdriveConn: any = null;
    const getGDriveAuth = async () => {
      if (gdriveToken) return { token: gdriveToken, connection: gdriveConn };
      let adminUserId = user.id;
      if (user.role !== "admin" && orgId) {
        const [orgAdmin] = await db
          .select()
          .from(users)
          .where(and(eq(users.organizationId, orgId), eq(users.role, "admin")));
        if (orgAdmin) adminUserId = orgAdmin.id;
      }
      gdriveConn = await getGDriveConnection(adminUserId);
      if (gdriveConn && gdriveConn.status === "approved") {
        gdriveToken = await getGDriveAccessToken(adminUserId);
      }
      return { token: gdriveToken, connection: gdriveConn };
    };

    // ── Resolve file list ───────────────────────────────────────────────────
    let fileRecords: any[] = [];

    if (body.items && body.items.length > 0) {
      const localIds: string[] = [];
      const gdriveItems: BatchItemInput[] = [];

      for (const item of body.items) {
        const isDrive = item.isGDrive || item.bucketName === "gdrive" || String(item.bucketName || "").startsWith("gdrive_");
        if (isDrive) {
          const gid = item.googleDriveFileId || item.id;
          gdriveMetaMap.set(item.id, { ...item, gdriveFileId: gid });
          gdriveMetaMap.set(gid, { ...item, gdriveFileId: gid });
          gdriveItems.push(item);
        } else {
          localIds.push(item.id);
        }
      }

      // Fetch local files from DB
      if (localIds.length > 0) {
        const dbLocalFiles = await db
          .select()
          .from(files)
          .where(
            and(
              inArray(files.id, localIds),
              eq(files.organizationId, orgId),
              isNull(files.deletedAt),
            ),
          );
        fileRecords.push(...dbLocalFiles.filter((f: any) => SUPPORTED_EXTENSIONS.has(getExt(f.name))));
      }

      // Resolve Google Drive items
      if (gdriveItems.length > 0) {
        const gdriveIds = gdriveItems.map((g) => g.googleDriveFileId || g.id);
        const existingGDriveRecords = await db
          .select()
          .from(files)
          .where(
            and(
              inArray(files.id, gdriveIds),
              eq(files.organizationId, orgId),
              isNull(files.deletedAt),
            ),
          );
        const existingMap = new Map(existingGDriveRecords.map((r) => [r.id, r]));

        for (const gItem of gdriveItems) {
          const gid = gItem.googleDriveFileId || gItem.id;
          const ext = getExt(gItem.name);
          const isDocxExport = gItem.contentType === "application/vnd.google-apps.document";
          if (!SUPPORTED_EXTENSIONS.has(ext) && !isDocxExport) continue;

          const existing = existingMap.get(gid);
          if (existing) {
            fileRecords.push({ ...existing, isGDrive: true, gdriveFileId: gid, name: gItem.name || existing.name });
          } else {
            fileRecords.push({
              id: gid,
              name: gItem.name,
              isGDrive: true,
              gdriveFileId: gid,
              contentType: gItem.contentType,
              parentId: gItem.parentId || "root",
              organizationId: orgId,
              departmentId: "global",
            });
          }
        }
      }
    } else if (body.folderId) {
      // Folder mode: expand recursively
      const folder = await getFolder(body.folderId, orgId);
      if (!folder) throw new Error("Folder not found.");
      await requireFileDepartmentAccess(user, body.folderId);
      sendEvent({ type: "scan", message: `Scanning folder "${folder.name}" for supported files...` });
      fileRecords = await expandFolder(body.folderId, orgId, db);
    } else if (body.fileIds && body.fileIds.length > 0) {
      // Multi-select mode by ID
      const dbFiles = await db
        .select()
        .from(files)
        .where(
          and(
            inArray(files.id, body.fileIds),
            eq(files.organizationId, orgId),
            isNull(files.deletedAt),
          ),
        );
      fileRecords = dbFiles.filter((f: any) => SUPPORTED_EXTENSIONS.has(getExt(f.name)));

      // If some fileIds were not in DB, attempt Google Drive lookup
      const foundIds = new Set(dbFiles.map((f) => f.id));
      const missingIds = body.fileIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        const { token } = await getGDriveAuth();
        if (token) {
          for (const mid of missingIds) {
            try {
              const meta = await $fetch<{ name: string; mimeType: string; parents?: string[] }>(
                `https://www.googleapis.com/drive/v3/files/${mid}?fields=name,mimeType,parents`,
                { headers: { Authorization: `Bearer ${token}` } },
              );
              const ext = getExt(meta.name);
              const isDoc = meta.mimeType === "application/vnd.google-apps.document";
              if (SUPPORTED_EXTENSIONS.has(ext) || isDoc) {
                gdriveMetaMap.set(mid, { id: mid, name: meta.name, contentType: meta.mimeType, parentId: meta.parents?.[0] });
                fileRecords.push({
                  id: mid,
                  name: meta.name,
                  isGDrive: true,
                  gdriveFileId: mid,
                  contentType: meta.mimeType,
                  parentId: meta.parents?.[0] || "root",
                  organizationId: orgId,
                  departmentId: "global",
                });
              }
            } catch { /* not GDrive */ }
          }
        }
      }
    } else {
      throw new Error("Provide either items[], fileIds[], or folderId in the request body.");
    }

    if (fileRecords.length === 0) {
      sendEvent({ type: "fatal", message: "No supported files found in selection." });
      event.node.res.end();
      return;
    }

    // ── Deduplicate: skip already-processed files ───────────────────────────
    const toProcess: any[] = [];
    const skipped: any[] = [];
    for (const file of fileRecords) {
      const meta = (file.assetMetadata as Record<string, any>) || {};
      if (meta.ragProcessedAt || meta.ragStatus === "processed") {
        skipped.push(file);
        sendEvent({ type: "file_skip", file_id: file.id, file_name: file.name, reason: "already indexed" });
      } else {
        toProcess.push(file);
      }
    }

    if (toProcess.length === 0) {
      sendEvent({
        type: "complete",
        message: `All ${skipped.length} file(s) already indexed in RAG.`,
        total_cost: 0,
        processed: 0,
        skipped: skipped.length,
      });
      event.node.res.end();
      return;
    }

    sendEvent({
      type: "start",
      message: `Starting batch RAG for ${toProcess.length} file(s)${skipped.length ? ` (${skipped.length} already indexed, skipped)` : ""}...`,
      total: toProcess.length,
    });

    // ── Resolve local paths and build manifest ──────────────────────────────
    const tempDir = join(process.cwd(), "uploads", "rag_temp");
    await fs.mkdir(tempDir, { recursive: true });
    const manifestId = ulid();
    tempManifestPath = join(tempDir, `manifest_${manifestId}.json`);

    const manifest: any[] = [];

    for (const file of toProcess) {
      let localFilePath: string;
      const isDrive = file.isGDrive || gdriveMetaMap.has(file.id);

      if (isDrive) {
        const { token } = await getGDriveAuth();
        if (!token) {
          sendEvent({ type: "file_error", file_id: file.id, file_name: file.name, error: "Google Drive is not connected or approved." });
          continue;
        }

        const gdriveId = file.gdriveFileId || gdriveMetaMap.get(file.id)?.gdriveFileId || file.id;
        const contentType = String(file.contentType || gdriveMetaMap.get(file.id)?.contentType || "").toLowerCase();
        const exportType = GDRIVE_EXPORT_TYPES[contentType];
        const lastDot = file.name.lastIndexOf(".");
        const nameExt = lastDot !== -1 ? file.name.substring(lastDot).toLowerCase() : "";
        const ext = SUPPORTED_EXTENSIONS.has(nameExt) ? nameExt : exportType?.extension || (contentType === "text/plain" ? ".txt" : "");

        if (!ext) {
          sendEvent({ type: "file_error", file_id: file.id, file_name: file.name, error: `Unsupported file type (${nameExt || contentType})` });
          continue;
        }

        const tfPath = join(tempDir, `gdrive_${basename(gdriveId)}${ext}`);
        const downloadUrl = exportType
          ? `https://www.googleapis.com/drive/v3/files/${gdriveId}/export?mimeType=${encodeURIComponent(exportType.mime)}`
          : `https://www.googleapis.com/drive/v3/files/${gdriveId}?alt=media`;

        try {
          const downloadRes = await fetch(downloadUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!downloadRes.ok) {
            sendEvent({ type: "file_error", file_id: file.id, file_name: file.name, error: `Google Drive download failed (${downloadRes.status})` });
            continue;
          }
          const buf = Buffer.from(await downloadRes.arrayBuffer());
          await fs.writeFile(tfPath, buf);
          tempFilesToClean.push(tfPath);
          localFilePath = tfPath;
        } catch (err: any) {
          sendEvent({ type: "file_error", file_id: file.id, file_name: file.name, error: `Google Drive download error: ${err.message}` });
          continue;
        }

        manifest.push({
          file_path: localFilePath,
          file_id:   file.id,
          file_name: file.name,
          ext:       ext,
          org_id:    file.organizationId || orgId,
          user_id:   (user as any).id,
          user_role: (user as any).role || "user",
          dept_id:   file.departmentId || "global",
        });
      } else {
        // Platform / local storage
        if (storageTarget === "local") {
          localFilePath = getLocalDamStoragePath(file.storagePath || file.path);
        } else {
          const tfPath = join(tempDir, `${file.id}_${basename(file.name)}`);
          try {
            const hBlob = await hubBlob().get(file.storagePath || file.path);
            if (hBlob) {
              await fs.writeFile(tfPath, Buffer.from(await hBlob.arrayBuffer()));
            } else {
              const lb = getLocalDamStoragePath(file.storagePath || file.path);
              await fs.copyFile(lb, tfPath);
            }
          } catch (e) {
            sendEvent({ type: "file_error", file_id: file.id, file_name: file.name, error: "Could not fetch file binary" });
            continue;
          }
          tempFilesToClean.push(tfPath);
          localFilePath = tfPath;
        }

        // Mark as processing in DB if record exists
        await db
          .update(files)
          .set({ processingStatus: "processing", updatedAt: new Date() })
          .where(eq(files.id, file.id))
          .catch(() => {});

        manifest.push({
          file_path: localFilePath,
          file_id:   file.id,
          file_name: file.name,
          ext:       getExt(file.name),
          org_id:    file.organizationId || orgId,
          user_id:   (user as any).id,
          user_role: (user as any).role || "user",
          dept_id:   file.departmentId || "global",
        });
      }
    }

    if (manifest.length === 0) {
      sendEvent({ type: "fatal", message: "Could not resolve any file paths." });
      event.node.res.end();
      return;
    }

    await fs.writeFile(tempManifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    // ── Spawn single Python batch process ───────────────────────────────────
    const child = spawn(PYTHON_CMD, ["-u", BATCH_SCRIPT, tempManifestPath], {
      cwd: RAGPUSH_DIR,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
        ...(openaiKey ? { OPENAI_API_KEY: openaiKey } : {}),
        PINECONE_API_KEY: pineconeKey,
      },
    });

    const configuredTimeout = Number(process.env.RAG_PROCESS_TIMEOUT_MS);
    const perFileMs = 12 * 60 * 1000;
    const processTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 60_000
      ? configuredTimeout
      : Math.max(perFileMs, manifest.length * 3 * 60 * 1000); // 3 min per file minimum

    let terminalEventSent = false;
    let heartbeat: ReturnType<typeof setInterval>;
    let processTimeout: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    return new Promise((resolve) => {
      const clearTimers = () => {
        clearInterval(heartbeat);
        clearTimeout(processTimeout);
      };
      const finishStream = async () => {
        clearTimers();
        // Cleanup all temporary files
        for (const p of tempFilesToClean) {
          fs.rm(p, { force: true }).catch(() => {});
        }
        if (tempManifestPath) {
          fs.rm(tempManifestPath, { force: true }).catch(() => {});
        }
        if (!event.node.res.writableEnded) event.node.res.end();
        resolve(true);
      };

      heartbeat = setInterval(() => {
        if (terminalEventSent || event.node.res.writableEnded) return;
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        sendEvent({ type: "progress", text: `Still processing batch... (${elapsed}s elapsed)` });
      }, 15_000);

      processTimeout = setTimeout(() => {
        if (terminalEventSent) return;
        terminalEventSent = true;
        sendEvent({ type: "fatal", message: "Batch RAG processing exceeded time limit." });
        child.kill();
        finishStream();
      }, processTimeoutMs);

      event.node.res.on("close", () => {
        if (!terminalEventSent) {
          terminalEventSent = true;
          child.kill();
          finishStream();
        }
      });

      child.on("error", (err) => {
        if (terminalEventSent) return;
        terminalEventSent = true;
        sendEvent({ type: "fatal", message: `Batch process spawn failed: ${err.message}` });
        finishStream();
      });

      let stdoutBuf = "";

      child.stdout.on("data", async (data: Buffer) => {
        stdoutBuf += data.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            // Forward all events to client unchanged
            sendEvent(parsed);

            // React to file_done to update DB
            if (parsed.type === "file_done") {
              const { file_id, cost, chunks } = parsed;
              const gdriveInfo = gdriveMetaMap.get(file_id);
              const [existing] = await db.select().from(files).where(eq(files.id, file_id)).limit(1);

              if (existing) {
                db.update(files)
                  .set({
                    processingStatus: "processed",
                    updatedAt: new Date(),
                    assetMetadata: {
                      ...((existing.assetMetadata as any) || {}),
                      ...(gdriveInfo ? { source: "google-drive", googleDriveFileId: file_id, storageProvider: "gdrive" } : {}),
                      ragCost: cost || 0,
                      ragProcessedAt: new Date().toISOString(),
                      ragStatus: "processed",
                      ragChunks: chunks || 0,
                      ragBatchId: manifestId,
                    },
                  })
                  .where(eq(files.id, file_id))
                  .catch(() => {});
              } else if (gdriveInfo) {
                db.insert(files).values({
                  id: file_id,
                  name: gdriveInfo.name,
                  path: `gdrive/${gdriveInfo.parentId || "root"}/${gdriveInfo.name}`,
                  type: "file",
                  contentType: gdriveInfo.contentType || "application/octet-stream",
                  bucketName: "org",
                  parentId: gdriveInfo.parentId || "root",
                  organizationId: orgId || "org_default",
                  visibility: "private",
                  userId: (user as any).id,
                  processingStatus: "processed",
                  assetMetadata: {
                    source: "google-drive",
                    googleDriveFileId: file_id,
                    storageProvider: "gdrive",
                    ragCost: cost || 0,
                    ragProcessedAt: new Date().toISOString(),
                    ragStatus: "processed",
                    ragChunks: chunks || 0,
                    ragBatchId: manifestId,
                  },
                  createdAt: new Date(),
                  updatedAt: new Date(),
                }).catch(() => {});
              }
            }

            // React to file_error to mark failed in DB
            if (parsed.type === "file_error") {
              const { file_id, error: errMsg } = parsed;
              db.update(files)
                .set({
                  processingStatus: "failed",
                  updatedAt: new Date(),
                  assetMetadata: { ingestionError: errMsg, failedStage: "rag_batch" },
                })
                .where(eq(files.id, file_id))
                .catch(() => {});
            }
          } catch {
            // Non-JSON line — emit as raw progress
            sendEvent({ type: "progress", text: trimmed });
          }
        }
      });

      child.stderr.on("data", (data: Buffer) => {
        sendEvent({ type: "progress", text: data.toString() });
      });

      child.on("close", async (code) => {
        if (terminalEventSent) return;
        terminalEventSent = true;

        if (code !== 0) {
          sendEvent({ type: "fatal", message: `Batch pipeline exited with code ${code}.` });
        }
        await finishStream();
      });
    });
  } catch (err: any) {
    sendEvent({ type: "fatal", message: err.message || "Unexpected error in batch RAG." });
    for (const p of tempFilesToClean) {
      fs.rm(p, { force: true }).catch(() => {});
    }
    if (tempManifestPath) {
      fs.rm(tempManifestPath, { force: true }).catch(() => {});
    }
    event.node.res.end();
  }
});
