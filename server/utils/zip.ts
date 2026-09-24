import { promises as fs } from "node:fs";

export type ZipContents = {
  entries: string[];
  totalEntries: number;
};

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_HEADER = 0x02014b50;

/** Legacy in-memory reader – kept for compatibility with any other callers */
export function readZipContents(buffer: Buffer, maxEntries = 8): ZipContents {
  const minimumEocdSize = 22;
  const earliestOffset = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;

  for (let offset = buffer.length - minimumEocdSize; offset >= earliestOffset; offset--) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) throw new Error("Invalid ZIP file: central directory not found.");

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: string[] = [];

  for (let index = 0; index < totalEntries && offset + 46 <= buffer.length; index++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_FILE_HEADER) break;

    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > buffer.length) break;

    const fileName = buffer.subarray(fileNameStart, fileNameEnd).toString("utf8");
    if (fileName && !fileName.endsWith("/") && entries.length < maxEntries) {
      entries.push(fileName);
    }

    offset = fileNameEnd + extraLength + commentLength;
  }

  return { entries, totalEntries };
}

/**
 * Low-memory ZIP central-directory reader.
 * Opens the file by file descriptor and reads only the trailing ~65 KB to locate
 * the End-of-Central-Directory record. Never loads the full file into memory.
 * Safe to call on archives of any size (1 MB or 4 GB).
 */
export async function readZipContentsFromFile(
  filePath: string,
  fileSize: number,
  maxEntries = 8,
): Promise<ZipContents> {
  const minimumEocdSize = 22;
  // We read the last min(65,557, fileSize) bytes to find the EOCD
  const tailSize = Math.min(65_557, fileSize);
  const tailOffset = fileSize - tailSize;

  const fd = await fs.open(filePath, "r");
  try {
    // 1. Read the trailing 65 KB
    const tailBuf = Buffer.allocUnsafe(tailSize);
    await fd.read(tailBuf, 0, tailSize, tailOffset);

    // 2. Locate EOCD signature scanning from the back
    let eocdInTail = -1;
    for (let i = tailSize - minimumEocdSize; i >= 0; i--) {
      if (tailBuf.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
        eocdInTail = i;
        break;
      }
    }
    if (eocdInTail < 0) throw new Error("Invalid ZIP file: central directory not found.");

    const totalEntries = tailBuf.readUInt16LE(eocdInTail + 10);
    // Absolute offset of the Central Directory in the file
    const cdAbsoluteOffset = tailBuf.readUInt32LE(eocdInTail + 16);

    // 3. Read a portion of the Central Directory to extract file names
    // Each central directory record is at least 46 bytes + filename.
    // We read up to 128 KB of CD entries (enough for ~1000 entries).
    const cdReadSize = Math.min(131_072, fileSize - cdAbsoluteOffset);
    const cdBuf = Buffer.allocUnsafe(cdReadSize);
    await fd.read(cdBuf, 0, cdReadSize, cdAbsoluteOffset);

    const entries: string[] = [];
    let offset = 0;

    for (let i = 0; i < totalEntries && offset + 46 <= cdBuf.length; i++) {
      if (cdBuf.readUInt32LE(offset) !== CENTRAL_DIRECTORY_FILE_HEADER) break;

      const fileNameLength = cdBuf.readUInt16LE(offset + 28);
      const extraLength = cdBuf.readUInt16LE(offset + 30);
      const commentLength = cdBuf.readUInt16LE(offset + 32);
      const fileNameStart = offset + 46;
      const fileNameEnd = fileNameStart + fileNameLength;
      if (fileNameEnd > cdBuf.length) break;

      const fileName = cdBuf.subarray(fileNameStart, fileNameEnd).toString("utf8");
      if (fileName && !fileName.endsWith("/") && entries.length < maxEntries) {
        entries.push(fileName);
      }

      offset = fileNameEnd + extraLength + commentLength;
    }

    return { entries, totalEntries };
  } finally {
    await fd.close();
  }
}
