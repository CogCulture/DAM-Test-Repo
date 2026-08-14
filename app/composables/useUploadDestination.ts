import type { UploadFolderDestination } from "~~/shared/utils/folder-upload-target";

export type ActiveUploadFolder = UploadFolderDestination & {
  departmentId?: string | null;
};

export const useUploadDestination = () => {
  const activeFolder = useState<ActiveUploadFolder | null>("active-upload-folder", () => null);

  const selectUploadFolder = (folder: ActiveUploadFolder) => {
    activeFolder.value = { ...folder };
  };

  const clearUploadFolder = () => {
    activeFolder.value = null;
  };

  return {
    activeFolder,
    clearUploadFolder,
    selectUploadFolder,
  };
};
