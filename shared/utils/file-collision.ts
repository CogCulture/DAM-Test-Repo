export interface ICollisionFile {
  id: string;
  name: string;
  type?: string;
  duplicateOfId?: string | null;
  isDuplicate?: boolean | null;
  createdAt?: string | Date | number;
  [key: string]: any;
}

export const getCollisionNumber = (filename: string): number => {
  const match = filename.match(/\((\d+)\)(?:\.[^.]+)?$/);
  return match ? parseInt(match[1], 10) : 0;
};

export const stripCollisionSuffix = (filename: string): string => {
  return filename.replace(/\s*\(\d+\)(?=(\.[^.]+)?$)/, "");
};

export const processFileDuplicates = <T extends ICollisionFile>(
  fileList: T[],
  sortBy: string = "createdAt",
  order: string = "desc"
): T[] => {
  if (!Array.isArray(fileList) || fileList.length === 0) return fileList;

  const isFolder = (item: any) =>
    Boolean(item && (item.type === "folder" || item.type === "directory" || item.contentType === "folder" || item.mimeType === "application/vnd.google-apps.folder"));

  const folders = fileList.filter((item) => isFolder(item));
  const files = fileList.filter((item) => !isFolder(item));

  if (sortBy === "name") {
    folders.sort((a, b) =>
      (order === "desc" ? -1 : 1) * (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base", numeric: true })
    );
  } else {
    folders.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) return order === "desc" ? timeB - timeA : timeA - timeB;
      return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base", numeric: true });
    });
  }

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
        return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base", numeric: true });
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

  if (sortBy === "name") {
    updatedFiles.sort((a, b) => {
      const baseA = stripCollisionSuffix(a.name || "").toLowerCase();
      const baseB = stripCollisionSuffix(b.name || "").toLowerCase();
      if (baseA !== baseB) return (order === "desc" ? -1 : 1) * baseA.localeCompare(baseB, undefined, { sensitivity: "base", numeric: true });
      const numA = getCollisionNumber(a.name || "");
      const numB = getCollisionNumber(b.name || "");
      return numA - numB;
    });
  } else {
    updatedFiles.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) return order === "desc" ? timeB - timeA : timeA - timeB;
      const baseA = stripCollisionSuffix(a.name || "").toLowerCase();
      const baseB = stripCollisionSuffix(b.name || "").toLowerCase();
      if (baseA !== baseB) return baseA.localeCompare(baseB, undefined, { sensitivity: "base", numeric: true });
      const numA = getCollisionNumber(a.name || "");
      const numB = getCollisionNumber(b.name || "");
      return numA - numB;
    });
  }

  return [...folders, ...updatedFiles];
};

export interface PlanFileUploadOptions {
  requestedName: string;
  existingNames: string[];
  contentMatch?: {
    id: string;
    name: string;
    storagePath: string;
  } | null;
}

export interface PlanFileUploadResult {
  finalName: string;
  renamed: boolean;
  duplicate: boolean;
  duplicateOfId: string | null;
  duplicateOfName: string | null;
  reuseStoragePath: string | null;
}

export function planFileUpload(options: PlanFileUploadOptions): PlanFileUploadResult {
  const { requestedName, existingNames, contentMatch } = options;
  const existingSet = new Set(existingNames.map((n) => n.toLowerCase()));

  let finalName = requestedName;
  let renamed = false;

  if (existingSet.has(finalName.toLowerCase())) {
    const extIndex = requestedName.lastIndexOf(".");
    const baseName = extIndex !== -1 ? requestedName.substring(0, extIndex) : requestedName;
    const ext = extIndex !== -1 ? requestedName.substring(extIndex) : "";

    const cleanBase = stripCollisionSuffix(baseName);
    let counter = 1;
    while (existingSet.has(`${cleanBase} (${counter})${ext}`.toLowerCase())) {
      counter++;
    }
    finalName = `${cleanBase} (${counter})${ext}`;
    renamed = true;
  }

  const isDuplicate = Boolean(contentMatch);

  return {
    finalName,
    renamed,
    duplicate: isDuplicate,
    duplicateOfId: contentMatch ? contentMatch.id : null,
    duplicateOfName: contentMatch ? contentMatch.name : null,
    reuseStoragePath: contentMatch ? contentMatch.storagePath : null,
  };
}

export interface ResolveFileCollisionOptions {
  requestedName: string;
  existingNames: string[];
}

export function resolveFileCollision(options: ResolveFileCollisionOptions): { finalName: string; renamed: boolean } {
  const plan = planFileUpload({
    requestedName: options.requestedName,
    existingNames: options.existingNames,
  });
  return {
    finalName: plan.finalName,
    renamed: plan.renamed,
  };
}