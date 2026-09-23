export type FileCollisionInput = {
  requestedName: string;
  existingNames: string[];
};

export type FileCollisionResolution = {
  finalName: string;
  renamed: boolean;
};

const splitFileName = (name: string) => {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0) return { stem: name, extension: "" };
  return { stem: name.slice(0, lastDot), extension: name.slice(lastDot) };
};

export const stripCollisionSuffix = (filename: string): string => {
  const { stem, extension } = splitFileName(filename);
  return `${stem.replace(/\s+\(\d+\)$/u, "")}${extension}`;
};

const getNextNumberedName = (requestedName: string, existingNames: string[]): string => {
  const occupied = new Set(existingNames.map((name) => name.toLocaleLowerCase()));
  const baseName = stripCollisionSuffix(requestedName);
  const { stem, extension } = splitFileName(baseName);
  let copyNumber = 1;
  let candidate = `${stem} (${copyNumber})${extension}`;

  while (occupied.has(candidate.toLocaleLowerCase())) {
    copyNumber += 1;
    candidate = `${stem} (${copyNumber})${extension}`;
  }

  return candidate;
};

export const resolveFileCollision = ({
  requestedName,
  existingNames,
}: FileCollisionInput): FileCollisionResolution => {
  const occupied = new Set(existingNames.map((name) => name.toLocaleLowerCase()));
  if (!occupied.has(requestedName.toLocaleLowerCase())) {
    return { finalName: requestedName, renamed: false };
  }

  return { finalName: getNextNumberedName(requestedName, existingNames), renamed: true };
};

export type ExistingContentMatch = {
  id: string;
  name: string;
  storagePath: string;
};

export type FileUploadPlan = FileCollisionResolution & (
  | { duplicate: false }
  | {
      duplicate: true;
      duplicateOfId: string;
      duplicateOfName: string;
      reuseStoragePath: string;
    }
);

export const planFileUpload = ({
  requestedName,
  existingNames,
  contentMatch,
}: FileCollisionInput & { contentMatch?: ExistingContentMatch | null }): FileUploadPlan => {
  if (!contentMatch) {
    const collision = resolveFileCollision({ requestedName, existingNames });
    return { ...collision, duplicate: false };
  }

  const canonicalNames = [...existingNames, contentMatch.name];
  const finalName = getNextNumberedName(contentMatch.name, canonicalNames);

  return {
    finalName,
    renamed: finalName !== requestedName,
    duplicate: true,
    duplicateOfId: contentMatch.id,
    duplicateOfName: contentMatch.name,
    reuseStoragePath: contentMatch.storagePath,
  };
};

export const getCollisionNumber = (filename: string): number => {
  const { stem } = splitFileName(filename);
  const match = stem.match(/\((\d+)\)$/u);
  return match ? parseInt(match[1], 10) : 0;
};

export const processFileDuplicates = <T extends {
  id: string;
  name: string;
  type?: string;
  duplicateOfId?: string | null;
  md5?: string | null;
  createdAt?: string | Date | number;
  [key: string]: any;
}>(fileList: T[]): T[] => {
  if (!Array.isArray(fileList) || fileList.length === 0) return fileList;

  const folders = fileList.filter((item) => item.type === "folder");
  const files = fileList.filter((item) => item.type !== "folder");

  const groups = new Map<string, T[]>();

  for (const item of files) {
    const baseKey = stripCollisionSuffix(item.name || "").toLowerCase();
    if (!groups.has(baseKey)) {
      groups.set(baseKey, []);
    }
    groups.get(baseKey)!.push(item);
  }

  const processedItemMap = new Map<string, { duplicateOfId: string | null; isDuplicate: boolean }>();

  for (const [, groupItems] of groups.entries()) {
    if (groupItems.length > 1) {
      groupItems.sort((a, b) => {
        const numA = getCollisionNumber(a.name || "");
        const numB = getCollisionNumber(b.name || "");
        if (numA !== numB) return numA - numB;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return (a.name || "").localeCompare(b.name || "");
      });

      const primary = groupItems[0];
      groupItems.forEach((item, index) => {
        processedItemMap.set(item.id, {
          duplicateOfId: index === 0 ? null : (item.duplicateOfId || primary.id),
          isDuplicate: index > 0,
        });
      });
    }
  }

  const updatedFiles = files.map((item) => {
    const info = processedItemMap.get(item.id);
    if (!info) return item;
    return {
      ...item,
      duplicateOfId: info.duplicateOfId,
      isDuplicate: info.isDuplicate,
    };
  });

  updatedFiles.sort((a, b) => {
    const baseA = stripCollisionSuffix(a.name || "").toLowerCase();
    const baseB = stripCollisionSuffix(b.name || "").toLowerCase();
    if (baseA !== baseB) return baseA.localeCompare(baseB, undefined, { numeric: true });
    const numA = getCollisionNumber(a.name || "");
    const numB = getCollisionNumber(b.name || "");
    return numA - numB;
  });

  return [...folders, ...updatedFiles];
};