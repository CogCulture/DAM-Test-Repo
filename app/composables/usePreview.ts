import { onKeyStroke } from "@vueuse/core";

export function usePreview() {
  const files = useState<IFile[]>("preview-files", () => []);
  const opened = useState("opened-preview", () => -1);
  const open = useState("preview-open", () => false);
  const limit = computed(() => files.value.length);

  // onKeyStroke("ArrowRight", (e) => {
  //   e.preventDefault();
  //   next();
  // });

  // onKeyStroke("ArrowLeft", (e) => {
  //   e.preventDefault();
  //   prev();
  // });

  const direction = ref("right"); // Track slide direction: 'left' or 'right'
  const nextPage = () => {
    if (opened.value >= 0 && opened.value < limit.value - 1) {
      direction.value = "right";
      opened.value++;
    }
  };

  function prevPage() {
    if (opened.value > 0) {
      direction.value = "left";
      opened.value--;
    }
  }

  const showPreview = (items: IFile[], index = 0) => {
    if (!items || !items.length) return;
    const item = items[index] || items[0];
    if (item && typeof window !== "undefined") {
      const isDriveAsset = item.assetMetadata?.source === "google-drive";
      const fileUrl = item.assetMetadata?.externalUrl || (isDriveAsset
        ? `/api/gdrive/download/${encodeURIComponent(item.id)}?inline=true`
        : `/api/files/org/download/${encodeURIComponent(item.id)}?inline=true`);
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    }
  };

  watch(opened, (value) => {
    if (value >= 0) {
      open.value = true;
    }
  });

  watch(open, (isOpen) => {
    if (!isOpen) {
      opened.value = -1;
    }
  });

  return {
    files,
    open,
    opened,
    limit,
    showPreview,
    prevPage,
    nextPage,
  };
};
