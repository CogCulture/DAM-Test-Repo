import Share from "~/components/Share.vue";
import { useOverlay } from "./useOverlay";

export function useShare() {
  const route = useRoute();
  const overlay = useOverlay();
  const modal = overlay.create(Share);

  const open = useState("share-open", () => false);
  const sharing = useState("sharing", () => false);
  const error = ref("");

  const shareFiles = async (files: IFile[], members: Member[]) => {
    if (sharing.value) return;
    sharing.value = true;
    try {
      const data = await $fetch(`/api/files/${route.params.bucket}/share`, {
        method: "POST",
        body: { files, members },
      });
      modal.close();
    } catch (errors: any) {
      if (errors?.data?.message) {
        console.error(errors?.data.message);
        error.value = errors.data.message;
      } else {
        error.value = "An error occurred. Please try again.";
      }
    } finally {
      sharing.value = false;
    }
  };

  const openShare = (files: IFile[]) => {
    modal.open({
      files,
      sharing,
      onUpdate: (members: Member[]) => {
        shareFiles(files, members);
      },
    });
  };
  return { openShare };
};
