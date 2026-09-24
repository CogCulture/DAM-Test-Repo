import { ref } from "vue";
import Move from "~/components/Move.vue";
import { useOverlay } from "./useOverlay";
import { useMoveAsset } from "./useMoveAsset";

export function useMove() {
  const overlay = useOverlay();
  const modal = overlay.create(Move);
  const { moveAsset } = useMoveAsset();

  const open = useState("move-open", () => false);
  const loading = ref(false);
  const error = ref("");

  const moveFile = async (
    file: any,
    target: { folderId: string; folderName?: string } | string
  ) => {
    if (loading.value) return;
    loading.value = true;
    error.value = "";

    const folderId = typeof target === "string" ? target : target.folderId;
    const folderName = typeof target === "string" ? "" : target.folderName;

    try {
      const res = await moveAsset(file, { id: folderId, name: folderName });
      if (res.success) {
        modal.close();
      } else if (res.message) {
        error.value = res.message;
      }
    } catch (err: any) {
      error.value = err?.data?.message || err?.message || "Failed to move item.";
    } finally {
      loading.value = false;
    }
  };

  const openMove = (file: any) => {
    error.value = "";
    modal.open({
      file,
      loading,
      error,
      onSubmit: (target: { folderId: string; folderName: string }) => {
        moveFile(file, target);
      },
    });
  };

  return { open, openMove };
}
