export const damModalUi = {
  overlay: "fixed inset-0 z-[200] bg-slate-950/70 backdrop-blur-[3px]",
  content: "z-[210] w-[min(34rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-hidden rounded-2xl border border-[var(--dam-line-strong)] bg-[var(--dam-panel-solid)] text-[var(--dam-ink)] opacity-100 shadow-2xl ring-0",
  header: "border-b border-[var(--dam-line)] bg-[var(--dam-panel-solid)] px-6 py-5",
  body: "max-h-[calc(100dvh-13rem)] overflow-y-auto bg-[var(--dam-panel-solid)] px-6 py-6",
  footer: "flex justify-end gap-2 border-t border-[var(--dam-line)] bg-[var(--dam-panel-raised)] px-6 py-4",
} as const;

export const isGoogleDriveAsset = (file?: Partial<IFile> | null) =>
  file?.storageProvider === "gdrive" ||
  file?.bucketName === "gdrive" ||
  file?.assetMetadata?.source === "google-drive" ||
  Boolean(file?.assetMetadata?.googleDriveFileId);
