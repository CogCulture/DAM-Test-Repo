import { lookup } from "node:dns/promises";
import { validateRemoteFileUrl } from "../../shared/utils/remote-file-url.ts";

type ResolveHost = (hostname: string) => Promise<string[]>;
type FetchImplementation = (input: string, init: RequestInit) => Promise<Response>;

export type RemoteFile = {
  bytes: Buffer;
  filename: string;
  contentType: string;
  finalUrl: string;
};

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "text/plain": "txt",
  "application/zip": "zip",
};

const safeFilename = (value: string) => {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/[. ]+$/gu, "")
    .trim();
  return cleaned.slice(0, 180);
};

export const deriveRemoteFilename = (
  sourceUrl: string,
  contentDisposition: string | null,
  contentType: string,
): string => {
  const encodedName = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/iu)?.[1];
  const plainName = contentDisposition?.match(/filename="?([^";]+)"?/iu)?.[1];
  let dispositionName = plainName;
  if (encodedName) {
    try {
      dispositionName = decodeURIComponent(encodedName);
    } catch {
      dispositionName = encodedName;
    }
  }

  let pathName = "";
  try {
    const pathSegment = new URL(sourceUrl).pathname.split("/").filter(Boolean).pop() || "";
    pathName = decodeURIComponent(pathSegment);
  } catch {
    pathName = "";
  }
  const extension = CONTENT_TYPE_EXTENSIONS[contentType.toLocaleLowerCase()] || "bin";
  return safeFilename(dispositionName || pathName) || `imported-file.${extension}`;
};

const defaultResolveHost: ResolveHost = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
};

export const fetchRemoteFile = async (options: {
  url: string;
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  resolveHost?: ResolveHost;
  fetchImpl?: FetchImplementation;
}): Promise<RemoteFile> => {
  const resolveHost = options.resolveHost || defaultResolveHost;
  const fetchImpl = options.fetchImpl || fetch;
  const maxRedirects = options.maxRedirects ?? 5;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    let currentUrl = options.url;
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const parsed = new URL(currentUrl);
      const addresses = await resolveHost(parsed.hostname);
      const validation = validateRemoteFileUrl(currentUrl, addresses);
      if (!validation.valid) throw new Error(validation.message);

      const response = await fetchImpl(validation.url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "*/*" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("The remote file redirect is missing a destination.");
        if (redirectCount === maxRedirects) throw new Error("The remote file has too many redirects.");
        currentUrl = new URL(location, validation.url).toString();
        await response.body?.cancel();
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`The remote file returned HTTP ${response.status}.`);
      }

      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (declaredLength > options.maxBytes) {
        await response.body?.cancel();
        throw new Error(`The remote file is too large. Maximum size is ${options.maxBytes} bytes.`);
      }
      if (!response.body) throw new Error("The remote file returned an empty response.");

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        totalBytes += value.byteLength;
        if (totalBytes > options.maxBytes) {
          await reader.cancel();
          throw new Error(`The remote file is too large. Maximum size is ${options.maxBytes} bytes.`);
        }
        chunks.push(value);
      }

      const contentType = (response.headers.get("content-type") || "application/octet-stream")
        .split(";", 1)[0]!
        .trim()
        .toLocaleLowerCase();
      const finalUrl = response.url || validation.url;
      return {
        bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
        filename: deriveRemoteFilename(
          finalUrl,
          response.headers.get("content-disposition"),
          contentType,
        ),
        contentType,
        finalUrl,
      };
    }
    throw new Error("The remote file has too many redirects.");
  } catch (error: any) {
    if (controller.signal.aborted) throw new Error("The remote file download timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
