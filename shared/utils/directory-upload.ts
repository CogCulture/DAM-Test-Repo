export type DirectoryUploadFile = File & { customPath?: string };

export type DirectoryUploadSelection = {
  files: DirectoryUploadFile[];
  directories: string[];
};

export type FileHandleLike = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
};

export type DirectoryHandleLike = {
  kind: "directory";
  name: string;
  values: () => AsyncIterable<FileHandleLike | DirectoryHandleLike>;
};

export type DirectoryPickerWindow = {
  showDirectoryPicker: () => Promise<DirectoryHandleLike>;
};

const joinPath = (parent: string, name: string) => parent ? `${parent}/${name}` : name;

export const readDirectoryHandle = async (
  root: DirectoryHandleLike,
): Promise<DirectoryUploadSelection> => {
  const files: DirectoryUploadFile[] = [];
  const directories: string[] = [];

  const visit = async (directory: DirectoryHandleLike, path: string) => {
    directories.push(path);
    for await (const entry of directory.values()) {
      const entryPath = joinPath(path, entry.name);
      if (entry.kind === "directory") {
        await visit(entry, entryPath);
        continue;
      }

      const file = await entry.getFile() as DirectoryUploadFile;
      file.customPath = entryPath;
      files.push(file);
    }
  };

  await visit(root, root.name);
  return { files, directories };
};

export const chooseDirectory = async (
  pickerWindow: DirectoryPickerWindow,
): Promise<DirectoryUploadSelection | null> => {
  try {
    return await readDirectoryHandle(await pickerWindow.showDirectoryPicker());
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
};

export const chooseUploadSource = async ({
  mode,
  pickerWindow,
  openFallback,
}: {
  mode: "files" | "folder";
  pickerWindow: Partial<DirectoryPickerWindow>;
  openFallback: () => void;
}): Promise<DirectoryUploadSelection | null> => {
  if (mode !== "folder" || !pickerWindow.showDirectoryPicker) {
    openFallback();
    return null;
  }

  return await chooseDirectory({
    showDirectoryPicker: pickerWindow.showDirectoryPicker.bind(pickerWindow),
  });
};
