/**
 * POST /api/gdrive/upload-chunk
 *
 * Receives a single raw chunk of a file and forwards it to an active Google Drive
 * Resumable Upload Session. This keeps the OAuth token server-side while allowing
 * files of any size to be uploaded in manageable chunks (default: 10 MB each).
 *
 * Query or Header params:
 *   sessionUrl  / x-session-url  - The GDrive resumable upload session URL
 *   rangeStart  / x-range-start  - Byte offset of this chunk (e.g. 0, 10485760, ...)
 *   rangeEnd    / x-range-end    - Last byte index of this chunk (inclusive, e.g. 10485759)
 *   totalSize   / x-total-size   - Total file size in bytes
 *   contentType / x-content-type - File MIME type
 *
 * Body: raw binary chunk (application/octet-stream)
 *
 * Returns:
 *   { done: false }                          — chunk accepted, more chunks needed
 *   { done: true, file: { id, name, ... } }  — final chunk, upload complete
 */
import { requireFilePermission } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  // Auth — user must be logged in with upload permission
  await requireFilePermission(event, "canUpload");

  const query = getQuery(event);
  const headers = getHeaders(event);

  const sessionUrl = String(query.sessionUrl || headers["x-session-url"] || "");
  const rangeStart = Number(query.rangeStart ?? headers["x-range-start"] ?? 0);
  const rangeEnd = Number(query.rangeEnd ?? headers["x-range-end"] ?? 0);
  const totalSize = Number(query.totalSize ?? headers["x-total-size"] ?? 0);
  const contentType = String(query.contentType || headers["x-content-type"] || "application/octet-stream");

  if (!sessionUrl || !sessionUrl.startsWith("https://www.googleapis.com/")) {
    throw createError({ status: 400, message: "Invalid or missing sessionUrl." });
  }
  if (isNaN(rangeStart) || isNaN(rangeEnd) || isNaN(totalSize) || rangeEnd < rangeStart || totalSize <= 0) {
    throw createError({ status: 400, message: "Invalid range parameters." });
  }

  // Read the chunk body — each chunk is at most 10 MB so this is memory-safe
  const chunkBuffer = (await readRawBody(event, false)) as Buffer | null;
  if (!chunkBuffer || chunkBuffer.length === 0) {
    throw createError({ status: 400, message: "Empty chunk body." });
  }

  const expectedChunkSize = rangeEnd - rangeStart + 1;
  if (chunkBuffer.length !== expectedChunkSize) {
    throw createError({
      status: 400,
      message: `Chunk size mismatch: expected ${expectedChunkSize} bytes, got ${chunkBuffer.length}.`,
    });
  }

  const contentRangeHeader = `bytes ${rangeStart}-${rangeEnd}/${totalSize}`;
  const isFinalChunk = rangeEnd === totalSize - 1;

  // Forward chunk to Google Drive with automatic retry and recovery probe
  async function uploadChunkToDrive(attempt = 1): Promise<{ done: boolean; file?: any }> {
    try {
      const res = await fetch(sessionUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(chunkBuffer!.length),
          "Content-Range": contentRangeHeader,
        },
        body: chunkBuffer!,
        // @ts-ignore Node.js fetch duplex requirement for binary streaming body
        duplex: "half",
      });

      // 308 Resume Incomplete = chunk accepted by Google Drive, more chunks needed
      if (res.status === 308) {
        return { done: false };
      }

      // 200 OK or 201 Created = final chunk accepted, file is ready
      if (res.status === 200 || res.status === 201) {
        const file = await res.json().catch(() => ({}));
        return { done: true, file };
      }

      // Handle transient Google server errors (500, 502, 503, 504)
      // These are especially common on the final chunk while Google Drive assembles large files
      if (res.status >= 500 && attempt <= 3) {
        console.warn(
          `[GDrive Chunk] Transient status ${res.status} on attempt ${attempt} for [${contentRangeHeader}]. Querying upload status...`
        );
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));

        // Send Google's official recovery probe: empty PUT with bytes */totalSize
        const probeRes = await fetch(sessionUrl, {
          method: "PUT",
          headers: {
            "Content-Length": "0",
            "Content-Range": `bytes */${totalSize}`,
          },
        });

        if (probeRes.status === 200 || probeRes.status === 201) {
          const file = await probeRes.json().catch(() => ({}));
          return { done: true, file };
        }

        if (probeRes.status === 308) {
          const rangeHeader = probeRes.headers.get("range") || "";
          const match = rangeHeader.match(/bytes=0-(\d+)/);
          if (match) {
            const bytesReceived = Number(match[1]);
            // If Google already received past this chunk, don't resend
            if (bytesReceived >= rangeEnd) {
              if (isFinalChunk) {
                // Final chunk was received, wait a moment and probe once more for the file object
                await new Promise((resolve) => setTimeout(resolve, 2000));
                const finalProbe = await fetch(sessionUrl, {
                  method: "PUT",
                  headers: { "Content-Length": "0", "Content-Range": `bytes */${totalSize}` },
                });
                if (finalProbe.status === 200 || finalProbe.status === 201) {
                  return { done: true, file: await finalProbe.json().catch(() => ({})) };
                }
              }
              return { done: isFinalChunk };
            }
          }
        }

        // Retry sending this chunk
        return uploadChunkToDrive(attempt + 1);
      }

      // If non-retryable 4xx or unexpected status from Google Drive
      const errText = await res.text().catch(() => "");
      let errorDetail = errText;
      try {
        const parsed = JSON.parse(errText);
        errorDetail = parsed?.error?.message || errText;
      } catch {}

      console.error(`[GDrive Chunk] GDrive rejected status ${res.status} [${contentRangeHeader}]:`, errorDetail);
      throw createError({
        status: 502,
        message: `Google Drive upload rejected (${res.status}): ${errorDetail || res.statusText}`,
      });
    } catch (err: any) {
      if (err?.statusCode || err?.status) throw err; // Already a createError

      if (attempt <= 3) {
        console.warn(
          `[GDrive Chunk] Network error to GDrive on attempt ${attempt} [${contentRangeHeader}]: ${err.message}. Retrying...`
        );
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        return uploadChunkToDrive(attempt + 1);
      }

      console.error(`[GDrive Chunk] Failed after 3 attempts [${contentRangeHeader}]:`, err);
      throw createError({
        status: 502,
        message: `Failed to stream chunk to Google Drive: ${err.message}`,
      });
    }
  }

  return await uploadChunkToDrive();
});
