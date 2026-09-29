type LocalUploadOptions = {
  file: File;
  bucket: string;
  parentId: string;
  departmentId?: string | null;
  relativePath?: string;
  dimensions?: string | null;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

const CHUNK_SIZE = 16 * 1024 * 1024; // 16 MB chunks for optimal network performance and memory efficiency

export function uploadFileToLocalStorage(options: LocalUploadOptions): Promise<any> {
  const file = options.file;

  if (options.signal?.aborted) {
    return Promise.reject(new Error("Local upload was cancelled."));
  }

  // Single-request upload for small files (<= 16 MB)
  if (file.size <= CHUNK_SIZE) {
    return new Promise<any>((resolve, reject) => {
      const query = new URLSearchParams({
        parentId: options.parentId || "root",
        relativePath: options.relativePath || file.name,
      });
      if (options.departmentId) query.set("departmentId", options.departmentId);

      const xhr = new XMLHttpRequest();
      const onAbort = () => {
        try { xhr.abort(); } catch {}
      };
      if (options.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      xhr.open("POST", `/api/files/${encodeURIComponent(options.bucket)}/local-upload?${query.toString()}`);
      xhr.responseType = "json";
      xhr.timeout = 2 * 60 * 60 * 1000;
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      if (options.dimensions) xhr.setRequestHeader("x-dam-dimensions", options.dimensions);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          options.onProgress?.(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (options.signal) options.signal.removeEventListener("abort", onAbort);
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.success === true) {
          options.onProgress?.(100);
          resolve(xhr.response);
          return;
        }
        const message = xhr.response?.message
          || xhr.response?.statusMessage
          || (xhr.status >= 200 && xhr.status < 300
            ? "The server did not confirm that the file was stored."
            : `Upload failed (${xhr.status})`);
        reject(new Error(message));
      };
      xhr.onerror = () => {
        if (options.signal) options.signal.removeEventListener("abort", onAbort);
        reject(new Error("Local upload failed because the server connection was interrupted."));
      };
      xhr.ontimeout = () => {
        if (options.signal) options.signal.removeEventListener("abort", onAbort);
        reject(new Error("Local upload timed out. Please retry the file."));
      };
      xhr.onabort = () => {
        if (options.signal) options.signal.removeEventListener("abort", onAbort);
        reject(new Error("Local upload was cancelled."));
      };
      xhr.send(file);
    });
  }

  // Resumable chunked upload for multi-megabyte / multi-gigabyte files (> 16 MB)
  return (async () => {
    const sessionKey = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    let finalResult: any = null;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (options.signal?.aborted) {
        throw new Error("Local upload was cancelled.");
      }

      const rangeStart = chunkIndex * CHUNK_SIZE;
      const rangeEnd = Math.min(rangeStart + CHUNK_SIZE - 1, totalSize - 1);
      const chunk = file.slice(rangeStart, rangeEnd + 1);
      const isFinalChunk = chunkIndex === totalChunks - 1;

      let chunkResult: any = null;
      let lastError: any = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        if (options.signal?.aborted) {
          throw new Error("Local upload was cancelled.");
        }

        try {
          chunkResult = await new Promise<any>((resolve, reject) => {
            const query = new URLSearchParams({
              sessionKey,
              rangeStart: String(rangeStart),
              rangeEnd: String(rangeEnd),
              totalSize: String(totalSize),
              parentId: options.parentId || "root",
              relativePath: options.relativePath || file.name,
              isFinalChunk: isFinalChunk ? "1" : "0",
            });
            if (options.departmentId) query.set("departmentId", options.departmentId);

            const xhr = new XMLHttpRequest();
            const onAbort = () => {
              try { xhr.abort(); } catch {}
            };
            if (options.signal) {
              options.signal.addEventListener("abort", onAbort, { once: true });
            }

            xhr.open("POST", `/api/files/${encodeURIComponent(options.bucket)}/local-upload-chunk?${query.toString()}`);
            xhr.responseType = "json";
            xhr.timeout = 10 * 60 * 1000; // 10 min per chunk

            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable) {
                const chunkFraction = (chunkIndex + ev.loaded / ev.total) / totalChunks;
                const pct = Math.min(100, Math.round(chunkFraction * 100));
                options.onProgress?.(pct);
              }
            };

            xhr.onload = () => {
              if (options.signal) options.signal.removeEventListener("abort", onAbort);
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
              } else {
                const errMsg = xhr.response?.message || xhr.response?.statusMessage || `Chunk ${chunkIndex + 1}/${totalChunks} failed (${xhr.status})`;
                reject(new Error(errMsg));
              }
            };
            xhr.onerror = () => {
              if (options.signal) options.signal.removeEventListener("abort", onAbort);
              reject(new Error("Connection to server lost during chunk upload."));
            };
            xhr.ontimeout = () => {
              if (options.signal) options.signal.removeEventListener("abort", onAbort);
              reject(new Error(`Chunk ${chunkIndex + 1} timed out while processing.`));
            };
            xhr.onabort = () => {
              if (options.signal) options.signal.removeEventListener("abort", onAbort);
              reject(new Error("Local upload was cancelled."));
            };

            xhr.setRequestHeader("Content-Type", "application/octet-stream");
            if (options.dimensions) xhr.setRequestHeader("x-dam-dimensions", options.dimensions);

            xhr.send(chunk);
          });

          break; // Chunk succeeded
        } catch (err: any) {
          lastError = err;
          if (options.signal?.aborted) {
            throw err;
          }
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, attempt * 1500));
          }
        }
      }

      if (!chunkResult) {
        throw lastError || new Error(`Chunk ${chunkIndex + 1}/${totalChunks} failed after 3 attempts.`);
      }

      if (chunkResult.done) {
        finalResult = chunkResult;
      }
    }

    options.onProgress?.(100);
    return finalResult || { success: true };
  })();
}
