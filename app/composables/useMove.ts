import Move from "~/components/Move.vue";
import { useOverlay } from "./useOverlay";

export function useMove() {
  const route = useRoute();
  const overlay = useOverlay();
  const modal = overlay.create(Move);

  const refreshTrigger = useState("files-refresh-trigger", () => 0);
  const open = useState("move-open", () => false);
  const loading = ref(false);
  const error = ref("");

  const moveFile = async (file: IFile, parentId: string) => {
    if (loading.value) return;
    loading.value = true;
    try {
      const data = await $fetch(`/api/files/${route.params.bucket}/move`, {
        method: "POST",
        body: { file, parentId },
      });
      refreshTrigger.value++;
      modal.close();
    } catch (errors: any) {
      if (errors?.data?.message) {
        console.error(errors?.data.message);
        error.value = errors.data.message;
      } else {
        error.value = "An error occurred. Please try again.";
      }
    } finally {
      loading.value = false;
    }
  };

  const openMove = (file: IFile) => {
    modal.open({
      file,
      loading,
      error,
      onSubmit: (value: string) => {
        moveFile(file, value);
      },
    });
  };
  return { open, openMove };
};
