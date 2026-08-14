export type UploadPickerMode = "files" | "folder";

export function resolveUploadPickerMode(mode?: string): UploadPickerMode {
  return mode === "folder" ? "folder" : "files";
}
