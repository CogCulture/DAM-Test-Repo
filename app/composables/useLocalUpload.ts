type LocalUploadOptions = {
  file: File;
  bucket: string;
  parentId: string;
  relativePath?: string;
  dimensions?: string | null;
  onProgress?: (progress: number) => void;
};

export function uploadFileToLocalStorage(options: LocalUploadOptions) {
  return new Promise<any>((resolve, reject) => {
    const query = new URLSearchParams({
      parentId: options.parentId || "root",
      relativePath: options.relativePath || options.file.name,
    });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/files/${encodeURIComponent(options.bucket)}/local-upload?${query.toString()}`);
    xhr.responseType = "json";
    xhr.timeout = 10 * 60 * 1000;
    xhr.setRequestHeader("Content-Type", options.file.type || "application/octet-stream");
    if (options.dimensions) xhr.setRequestHeader("x-dam-dimensions", options.dimensions);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
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
    xhr.onerror = () => reject(new Error("Local upload failed because the server connection was interrupted."));
    xhr.ontimeout = () => reject(new Error("Local upload timed out. Please retry the file."));
    xhr.onabort = () => reject(new Error("Local upload was cancelled."));
    xhr.send(options.file);
  });
}
