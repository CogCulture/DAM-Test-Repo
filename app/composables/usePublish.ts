import Publish from "~/components/Publish.vue";
import { useOverlay } from "./useOverlay";

type PublishProps = {
  public: true;
  domain: string;
};

export function usePublish() {
  const route = useRoute();
  const overlay = useOverlay();
  const modal = overlay.create(Publish);

  const open = useState("publish-open", () => false);
  const publishing = useState("publishing", () => false);
  const error = ref("");

  const publishFile = async (file: IFile, status: PublishProps) => {
    if (publishing.value) return;
    publishing.value = true;
    try {
      const data = await $fetch(`/api/files/${route.params.bucket}/publish`, {
        method: "POST",
        body: { ...file, ...status },
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
    });
  };
  return { open, openPublish };
};
