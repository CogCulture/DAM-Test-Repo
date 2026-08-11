import { isGoogleDriveAsset } from "~/utils/damModal";
import Rename from "~/components/Rename.vue";
import { useToast } from "./useToast";
import { useOverlay } from "./useOverlay";

export function useRename() {
  const route = useRoute();
  const toast = useToast();
  const overlay = useOverlay();
  const modal = overlay.create(Rename);
  const refreshTrigger = useState("files-refresh-trigger", () => 0);
  const visibleFiles = useState<IFile[]>("files", () => []);

  const renameFile = async (file: IFile, name: string) => {
    try {
      const bucket = String(route.params.bucket || "");
      const newName = name.trim();
      const isGDrive = isGoogleDriveAsset(file);

      if (isGDrive) {
        await $fetch("/api/gdrive/rename", {
          method: "POST",
          body: { fileId: file.id, newName },
          timeout: 30000,
        });
      } else {
        const response = await $fetch<{ status?: string }>(`/api/files/${bucket}/rename`, {
          method: "POST",
          body: { file: { id: file.id }, name: newName },
          timeout: 30000,
        });
        if (response?.status !== "success") {
          throw new Error("The server did not confirm the rename.");
        }
      }

      toast.add({
        title: "Asset renamed",
        description: `Renamed to ${newName}`,
        color: "success",
      });
      const visibleIndex = visibleFiles.value.findIndex((item) => item.id === file.id);
      if (visibleIndex >= 0) {
        visibleFiles.value[visibleIndex] = {
          ...visibleFiles.value[visibleIndex],
          name: newName,
          updatedAt: new Date(),
        };
      }
      refreshTrigger.value++;
    } catch (error: any) {
      const message = error?.data?.message
        || error?.data?.statusMessage
        || (error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "The rename took too long. Please try again."
          : error?.message)
        || "The asset could not be renamed. Please try again.";
      throw new Error(message);
    }
  };

  const openRename = (file: IFile) => {
    modal.open({
      file,
      submitRename: async (value: string) => {
        await renameFile(file, value);
        modal.close();
      },
      onClose: () => modal.close(),
    });
  };

  return { openRename };
}
