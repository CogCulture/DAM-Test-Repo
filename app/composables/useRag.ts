import RagProgressModal from "~/components/RagProgressModal.vue";
import { useOverlay } from "./useOverlay";

export function useRag() {
  const overlay = useOverlay();
  
  // In Nuxt UI v3, we create the modal wrapper
  const modal = overlay.create(RagProgressModal);

  const startRagProcess = (file: any) => {
    // Open the modal, pass props to it.
    modal.open({
      file,
      onClose: () => {
        modal.close();
      }
    });
  };

  return { startRagProcess };
};
