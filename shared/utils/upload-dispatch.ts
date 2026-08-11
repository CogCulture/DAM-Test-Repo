export type UploadController = {
  processFiles: (files: File[] | any[]) => Promise<void> | void;
};

export const dispatchDroppedFiles = async (
  files: File[] | any[],
  controller: UploadController | null | undefined,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (!controller) {
    return {
      ok: false,
      message: "The upload controls are still loading. Please try again.",
    };
  }

  await controller.processFiles(files);
  return { ok: true };
};

