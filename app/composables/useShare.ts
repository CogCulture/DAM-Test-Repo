import Share from "~/components/Share.vue";
import { useOverlay } from "./useOverlay";
import { useToast } from "./useToast";

export function useShare() {
  const route = useRoute();
  const overlay = useOverlay();
  const toast = useToast();
  const modal = overlay.create(Share);

  const sharing = useState("sharing", () => false);
  const error = ref("");

  const shareFiles = async (files: IFile[], members: Member[]) => {
    if (sharing.value) return;
    sharing.value = true;
    try {
      const data = await $fetch<{ status: string; message?: string }>(`/api/files/${route.params.bucket}/share`, {
        method: "POST",
        body: { files, members },
      });
      modal.close();
      toast.add({
        title: "Shared Successfully",
        description: data?.message || `Shared ${files.length} item(s) with ${members.length} team member(s). Email invitations sent.`,
        color: "green",
      });
    } catch (errors: any) {
      const msg = errors?.data?.message || errors?.message || "An error occurred while sharing. Please try again.";
      console.error("Share error:", errors);
      toast.add({
        title: "Sharing Failed",
        description: msg,
        color: "red",
      });
      error.value = msg;
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
}
