import { readMultipartFormData, createError } from 'h3';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { getContentType } from '~~/shared/utils/helper';

export const getLocalDamStorageRoot = () =>
  resolve(process.env.LOCAL_DAM_STORAGE_DIR || join(process.cwd(), 'local dam storage'));

const resolveStoragePath = (pathname: string) => {
  const normalized = pathname.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').includes('..') || /^[a-zA-Z]:/.test(normalized)) {
    throw createError({ statusCode: 400, message: 'Invalid storage path' });
  }

  const root = getLocalDamStorageRoot();
  const fullPath = resolve(root, ...normalized.split('/').filter(Boolean));
  const pathFromRoot = relative(root, fullPath);
  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    throw createError({ statusCode: 400, message: 'Storage path escapes the local DAM directory' });
  }
  return fullPath;
};

export const getLocalDamStoragePath = (pathname: string) => resolveStoragePath(pathname);

async function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export const localBlob = () => {
  return {
    async get(pathname: string) {
      try {
        const fullPath = resolveStoragePath(pathname);
        const buffer = await fs.readFile(fullPath);
        return buffer;
      } catch (err: any) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },

    async put(pathname: string, buffer: Buffer | ArrayBuffer | string) {
      const fullPath = resolveStoragePath(pathname);
      await ensureDir(fullPath);
      await fs.writeFile(fullPath, Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any));
      return { pathname, fullPath };
    },

    async del(pathname: string) {
      const fullPath = resolveStoragePath(pathname);
      try {
        await fs.unlink(fullPath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') throw err;
      }
    },

    async head(pathname: string) {
      try {
        const fullPath = resolveStoragePath(pathname);
        const stats = await fs.stat(fullPath);
        return { size: stats.size, contentType: getContentType(pathname) };
      } catch (err: any) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },

    async handleMultipartUpload(event: any) {
      const parts = await readMultipartFormData(event);
      if (!parts || parts.length === 0) {
        throw createError({ statusCode: 400, message: 'No file uploaded' });
      }

      // Find the file part. NuxtHub typically expects files to be named 'file' or just processes the first file part.
      const filePart = parts.find(p => p.filename) || parts[0];
      if (!filePart || !filePart.filename) {
        throw createError({ statusCode: 400, message: 'No file found in request' });
      }

      // You can extract custom headers or prefix if needed, or pass via URL
      // If the client sends a specific 'pathname' in form-data or we generate one
      let prefix = '';
      const prefixPart = parts.find(p => p.name === 'prefix');
      if (prefixPart) {
        prefix = prefixPart.data.toString();
      }

      const filename = filePart.filename;
      const pathname = prefix ? `${prefix}/${filename}` : filename;
      const fullPath = resolveStoragePath(pathname);

      await ensureDir(fullPath);
      await fs.writeFile(fullPath, filePart.data);

      return {
        action: 'complete',
        data: {
          pathname,
          contentType: filePart.type || 'application/octet-stream',
          size: filePart.data.length,
        }
      };
    },

    async serve(event: any, pathname: string) {
      const { sendStream } = await import('h3');
      const fullPath = resolveStoragePath(pathname);
      try {
        const stats = await fs.stat(fullPath);
        const range = event.node.req.headers.range;
        event.node.res.setHeader('Content-Type', getContentType(pathname));
        event.node.res.setHeader('Accept-Ranges', 'bytes');

        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (match) {
            const start = match[1] ? Number(match[1]) : 0;
            const end = match[2] ? Math.min(Number(match[2]), stats.size - 1) : stats.size - 1;
            if (start <= end && start < stats.size) {
              event.node.res.statusCode = 206;
              event.node.res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
              event.node.res.setHeader('Content-Length', end - start + 1);
              return sendStream(event, createReadStream(fullPath, { start, end }));
            }
          }
          event.node.res.statusCode = 416;
          event.node.res.setHeader('Content-Range', `bytes */${stats.size}`);
          return '';
        }

        event.node.res.setHeader('Content-Length', stats.size);
        return sendStream(event, createReadStream(fullPath));
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          throw createError({ statusCode: 404, message: 'File not found' });
        }
        throw err;
      }
    }
  };
};
