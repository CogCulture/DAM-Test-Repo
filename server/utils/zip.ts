export type ZipContents = {
  entries: string[];
  totalEntries: number;
};

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_HEADER = 0x02014b50;

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
