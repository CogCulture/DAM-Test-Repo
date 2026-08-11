import { useRole } from "./useRole";
import { useToast } from "./useToast";
import { isGoogleDriveAsset } from "~/utils/damModal";

export function useFileActions() {
  const route = useRoute();
  const { orgType } = useRole();
  const toast = useToast();
  const refreshTrigger = useState("files-refresh-trigger", () => 0);
  const deleting = ref(false);
  const settingFavorite = ref(false);
  const downloading = ref(false);
  const visibleFiles = useState<IFile[]>("files", () => []);

  const deleteFiles = async (fileInputs: Array<IFile | string>) => {
    if (deleting.value) return;
    deleting.value = true;
    try {
      const assets = fileInputs.map((input) => {
        if (typeof input !== "string") return input;
        return visibleFiles.value.find((item) => item.id === input) || input;
      });
      const driveIds: string[] = [];
      const localIds: string[] = [];

      for (const asset of assets) {
        const id = typeof asset === "string" ? asset : asset.id;
        const isDrive = typeof asset === "string"
          ? orgType.value === "gdrive" || String(route.params.bucket || "").startsWith("gdrive_")
          : isGoogleDriveAsset(asset);
        (isDrive ? driveIds : localIds).push(id);
      }

      for (const fileId of driveIds) {
        await $fetch(`/api/gdrive/delete/${encodeURIComponent(fileId)}`, {
          method: "DELETE",
        });
      }
      if (localIds.length > 0) {
        await $fetch(`/api/files/${route.params.bucket}/delete`, {
          method: "POST",
          body: localIds,
        });
      }

      refreshTrigger.value++;
      toast.add({
        title: "Moved to Trash",
        description: `${fileInputs.length} item${fileInputs.length === 1 ? "" : "s"} updated.`,
        color: "success",
      });
    } catch (error: any) {
      console.error("Error processing files:", error);
      toast.add({
        title: "Action failed",
        description: error?.data?.message || error?.message || "The selected files could not be updated.",
        color: "error",
      });
    } finally {
      deleting.value = false;
    }
  };
  const downloadFile = (bucket: string, file: IFile | string): string => {
    const asset = typeof file === "string"
      ? visibleFiles.value.find((item) => item.id === file)
      : file;
    const id = typeof file === "string" ? file : file.id;
    const isGDrive = asset
      ? isGoogleDriveAsset(asset)
      : orgType.value === "gdrive" || bucket.startsWith("gdrive_");
    return isGDrive
      ? `/api/gdrive/download/${encodeURIComponent(id)}`
      : `/api/files/${encodeURIComponent(bucket)}/download/${encodeURIComponent(id)}`;
  };

  const downloadAsset = async (
    file: IFile,
    bucket = String(route.params.bucket || file.bucketName || ""),
  ) => {
    if (downloading.value || typeof window === "undefined") return;
    downloading.value = true;
    try {
      const response = await fetch(downloadFile(bucket, file), {
        credentials: "same-origin",
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const details = contentType.includes("application/json")
          ? await response.json().catch(() => null)
          : null;
        throw new Error(
          details?.message ||
            details?.statusMessage ||
            `Download failed (${response.status}).`,
        );
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const downloadName = encodedName
        ? decodeURIComponent(encodedName.replace(/^"|"$/g, ""))
        : file.name || "download";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      toast.add({
        title: "Download started",
        description: file.name,
        color: "success",
      });
    } catch (error: any) {
      toast.add({
        title: "Download failed",
        description: error?.message || "The file could not be downloaded.",
        color: "error",
      });
    } finally {
      downloading.value = false;
    }
  };

  const setFavorite = async (file: IFile | string, add: boolean) => {
    if (settingFavorite.value) return;
    settingFavorite.value = true;
    try {
      const fileId = typeof file === "string" ? file : file.id;
      const data = await $fetch(`/api/files/${route.params.bucket}/favorite`, {
        method: "POST",
        body: { file, add },
      });
      if (data?.status === "success") {
        const visibleIndex = visibleFiles.value.findIndex((item) => item.id === fileId);
        if (visibleIndex >= 0) {
          visibleFiles.value[visibleIndex] = {
            ...visibleFiles.value[visibleIndex],
            isFavorite: add ? new Date().toISOString() : undefined,
          };
        }
        refreshTrigger.value++;
        toast.add({
          title: "Success",
          description: add ? "Added to Favorites" : "Removed from Favorites",
          color: "success",
        });
      }
    } catch (err: any) {
      console.error("Error processing files:", err);
      toast.add({
        title: "Favorite could not be updated",
        description: err?.data?.message || err?.message || "Please try again.",
        color: "error",
      });
    } finally {
      settingFavorite.value = false;
    }
  };
  return {
    deleteFiles,
    deleting,
    downloadFile,
    downloadAsset,
    downloading,
    setFavorite,
    settingFavorite,
  };
};
