import { ref } from "vue";
import { isGoogleDriveAsset } from "~/utils/damModal";
import { useRole } from "./useRole";
import { useToast } from "./useToast";

export function useMoveAsset() {
  const route = useRoute();
  const { orgType } = useRole();
  const toast = useToast();
  const refreshTrigger = useState<number>("files-refresh-trigger", () => 0);
  const isMoving = ref(false);

  const moveAsset = async (
    file: { id: string; name: string; type?: string; parentId?: string; [key: string]: any },
    targetFolder: { id: string; name?: string; [key: string]: any }
  ) => {
    if (!file?.id || !targetFolder?.id) {
      return { success: false, message: "Invalid parameters" };
    }

    if (file.id === targetFolder.id) {
      toast.add({
        title: "Cannot move item",
        description: `Cannot move "${file.name}" into itself.`,
        color: "warning",
      });
      return { success: false, message: "Cannot move item into itself" };
    }

    const normalizedCurrentParent = file.parentId || "root";
    const normalizedTargetParent = targetFolder.id || "root";

    if (normalizedCurrentParent === normalizedTargetParent) {
      toast.add({
        title: "Already in folder",
        description: `"${file.name}" is already in "${targetFolder.name || 'this folder'}".`,
        color: "neutral",
      });
      return { success: false, message: "Already in destination folder" };
    }

    const isGDrive = isGoogleDriveAsset(file) || (
      (file.storage === "gdrive" || file.storageProvider === "gdrive" || (route.params.bucket as string)?.startsWith("gdrive_")) &&
      file.storage !== "local" &&
      file.storage !== "s3" &&
      file.bucketName !== "gdrive"
    );
    const bucket = (route.params.bucket as string) || "org";
    isMoving.value = true;

    try {
      if (isGDrive) {
        try {
          await $fetch("/api/gdrive/move", {
            method: "POST",
            body: {
              fileId: file.id,
              targetFolderId: targetFolder.id,
              currentParentId: file.parentId,
            },
          });
        } catch (gdriveErr: any) {
          console.warn("[Move Asset] GDrive move failed, attempting local DAM move fallback:", gdriveErr);
          await $fetch(`/api/files/${encodeURIComponent(bucket)}/move`, {
            method: "POST",
            body: {
              file: { id: file.id },
              parentId: targetFolder.id,
            },
          });
        }
      } else {
        await $fetch(`/api/files/${encodeURIComponent(bucket)}/move`, {
          method: "POST",
          body: {
            file: { id: file.id },
            parentId: targetFolder.id,
          },
        });
      }

      toast.add({
        title: "Item moved",
        description: `Successfully moved "${file.name}" to "${targetFolder.name || 'selected folder'}".`,
        color: "success",
      });

      refreshTrigger.value++;
      return { success: true };
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || "Failed to move item.";
      console.error("[Move Asset Error]:", err);
      toast.add({
        title: "Move failed",
        description: msg,
        color: "error",
      });
      return { success: false, message: msg };
    } finally {
      isMoving.value = false;
    }
  };

  return {
    moveAsset,
    isMoving,
  };
}
