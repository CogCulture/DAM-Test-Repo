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
    if (!items.length) return;
    files.value = [...items];
    opened.value = Math.min(Math.max(index, 0), items.length - 1);
    open.value = true;
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
