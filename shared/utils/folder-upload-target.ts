const INVALID_SEGMENTS = new Set(["", ".", ".."]);

export type UploadFolderDestination = {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  type: "folder";
};

export const normalizeUploadRelativePath = (value: string) => {
  const normalized = String(value || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error("Invalid upload path.");
  }

  const parts = normalized.split("/");
  if (parts.some(part => INVALID_SEGMENTS.has(part) || /[\u0000-\u001f]/.test(part))) {
    throw new Error("Invalid upload path.");
  }

  const fileName = parts.pop();
  if (!fileName) throw new Error("Invalid upload path.");
  return { directories: parts, fileName };
};

export const getUploadDirectoryPaths = (relativePaths: string[]) => {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const relativePath of relativePaths) {
    const { directories } = normalizeUploadRelativePath(relativePath);
    for (let index = 1; index <= directories.length; index++) {
      const directoryPath = directories.slice(0, index).join("/");
      if (!seen.has(directoryPath)) {
        seen.add(directoryPath);
        paths.push(directoryPath);
      }
    }
  }

  return paths;
};

export const normalizeDirectoryManifest = (paths: string[]) => {
  const normalized = new Set<string>();

  for (const path of paths) {
    const { directories } = normalizeUploadRelativePath(`${path}/.directory`);
    for (let index = 1; index <= directories.length; index++) {
      normalized.add(directories.slice(0, index).join("/"));
    }
  }

  return [...normalized].sort((left, right) => {
    const depth = left.split("/").length - right.split("/").length;
    return depth || left.localeCompare(right, undefined, { sensitivity: "base" });
  });
};

export const resolveSelectedFolderId = ({
  selectedFolderId,
  routeFolderId,
  rootFolderId,
}: {
  selectedFolderId?: string | null;
  routeFolderId?: string | null;
  rootFolderId: string;
}) => selectedFolderId?.trim() || routeFolderId?.trim() || rootFolderId;

export const resolveLocalUploadParentId = ({
  selectedDestinationId,
  selectedDepartmentFolderId,
  routeFolderId,
  routeBreadcrumbIds,
}: {
  selectedDestinationId?: string | null;
  selectedDepartmentFolderId?: string | null;
  routeFolderId?: string | null;
  routeBreadcrumbIds?: string[] | null;
}) => {
  if (selectedDestinationId === "root") return "root";
  const selectedId = selectedDepartmentFolderId?.trim();
  const routeId = routeFolderId?.trim();
  if (!selectedId) return routeId || "root";
  if (routeId && (routeId === selectedId || routeBreadcrumbIds?.includes(selectedId))) {
    return routeId;
  }
  return selectedId;
};

export const resolveAuthorizedFolderId = ({
  requestedId,
  allowedIds,
}: {
  requestedId: string;
  allowedIds: Set<string>;
}) => {
  if (!allowedIds.has(requestedId)) {
    throw new Error("Upload folder is not authorized.");
  }
  return requestedId;
};

export const sortDirectoryChildren = <T extends { type: string; name: string }>(items: T[]) =>
  [...items].sort((a, b) =>
    Number(b.type === "folder") - Number(a.type === "folder")
    || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

export const replaceDirectoryBranch = <T extends { type: string; name: string }>(
  current: T[],
  incoming: T[],
  responseReady: boolean,
) => responseReady ? sortDirectoryChildren(incoming) : current;
