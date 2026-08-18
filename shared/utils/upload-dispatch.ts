import type { DirectoryUploadSelection } from "./directory-upload";

export type UploadController = {
  processFiles: (files: File[] | any[]) => Promise<void> | void;
  processSelection?: (selection: DirectoryUploadSelection) => Promise<void> | void;
};

export const dispatchDroppedFiles = async (
  input: File[] | any[] | DirectoryUploadSelection,
  controller: UploadController | null | undefined,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (!controller) {
    return {
      ok: false,
      message: "The upload controls are still loading. Please try again.",
    };
  }

  if (!Array.isArray(input) && controller.processSelection) {
    await controller.processSelection(input);
  } else {
    await controller.processFiles(Array.isArray(input) ? input : input.files);
  }
  return { ok: true };
};
