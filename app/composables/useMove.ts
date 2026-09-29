import { ref } from "vue";
import { useMoveAsset } from "./useMoveAsset";

const isMoveOpen = ref(false);
const moveTargetFile = ref<any>(null);
const moveLoading = ref(false);
const moveError = ref("");

export function useMove() {
  const { moveAsset } = useMoveAsset();

  const openMove = (file: any) => {
    if (!file) return;
    moveTargetFile.value = file;
    moveError.value = "";
    moveLoading.value = false;
    isMoveOpen.value = true;
  };

  const closeMove = () => {
    isMoveOpen.value = false;
    moveTargetFile.value = null;
    moveError.value = "";
    moveLoading.value = false;
  };

  const executeMove = async (target: { id?: string; folderId?: string; name?: string; folderName?: string } | string) => {
    if (!moveTargetFile.value || moveLoading.value) return;
    moveLoading.value = true;
    moveError.value = "";

    const folderId = typeof target === "string" ? target : (target?.id || target?.folderId || "");
    const folderName = typeof target === "string" ? "" : (target?.name || target?.folderName || "");

    try {
      const res = await moveAsset(moveTargetFile.value, { id: folderId, name: folderName });
      if (res.success) {
        closeMove();
      } else if (res.message) {
        moveError.value = res.message;
      }
    } catch (err: any) {
      moveError.value = err?.data?.message || err?.message || "Failed to move item.";
    } finally {
      moveLoading.value = false;
    }
  };

  return {
    isMoveOpen,
    moveTargetFile,
    moveLoading,
    moveError,
    openMove,
    closeMove,
    executeMove,
  };
}
