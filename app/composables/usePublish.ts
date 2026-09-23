import Publish from "~/components/Publish.vue";
import { useOverlay } from "./useOverlay";
import { useToast } from "./useToast";

type PublishProps = {
  visibility?: string;
  domain?: string;
};

export function usePublish() {
  const route = useRoute();
  const toast = useToast();
  const overlay = useOverlay();
  const modal = overlay.create(Publish);
  const refreshTrigger = useState("files-refresh-trigger", () => 0);
  const visibleFiles = useState<IFile[]>("files", () => []);

  const open = useState("publish-open", () => false);
  const publishing = useState("publishing", () => false);
  const error = ref("");

  const publishFile = async (file: IFile, status: PublishProps) => {
    if (publishing.value) return;
    publishing.value = true;
    try {
      const bucketName = route.params.bucket || (file as any)?.bucketName || "org";
      const targetVisibility = status.visibility || "public";
      await $fetch<{ status?: string; file?: string; visibility?: string }>(
        `/api/files/${bucketName}/publish`,
        {
          method: "POST",
          body: {
            id: file.id,
            visibility: targetVisibility,
            domain: status.domain,
          },
        }
      );

      const target = visibleFiles.value.find((item) => item.id === file.id);
      if (target) {
        target.visibility = targetVisibility as any;
      }

      refreshTrigger.value++;
      modal.close();
      toast.add({
        title: targetVisibility === "public" ? "Asset published" : "Visibility updated",
        description: `"${file.name}" is now ${targetVisibility}.`,
        color: "success",
      });
    } catch (errors: any) {
      const message =
        errors?.data?.message ||
        errors?.message ||
        "An error occurred while publishing. Please try again.";
      console.error("Publish error:", message);
      error.value = message;
      toast.add({
        title: "Publish failed",
        description: message,
        color: "error",
      });
    } finally {
      publishing.value = false;
    }
  };

  const openPublish = (file: IFile) => {
    modal.open({
      file,
      publishing,
      onUpdate: (value: PublishProps) => {
        publishFile(file, value);
      },
      onClose: () => {
        modal.close();
      },
    });
  };

  return { open, openPublish };
}

