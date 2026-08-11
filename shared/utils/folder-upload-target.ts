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

export const resolveSelectedFolderId = ({
  selectedFolderId,
  routeFolderId,
  rootFolderId,
}: {
  selectedFolderId?: string | null;
  routeFolderId?: string | null;
  rootFolderId: string;
}) => selectedFolderId || routeFolderId || rootFolderId;

export const sortDirectoryChildren = <T extends { type: string; name: string }>(items: T[]) =>
  [...items].sort((a, b) =>
    Number(b.type === "folder") - Number(a.type === "folder")
    || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
