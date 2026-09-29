import { ref, computed } from "vue";

export interface UploadProgressItem {
  id: string;
  name: string;
  size?: number;
  progress: number;
  status: "pending" | "uploading" | "syncing" | "complete" | "error";
  error?: string;
}

let activeAbortController: AbortController | null = null;

export function useUploadProgress() {
  const isUploading = useState<boolean>("dam-upload-active", () => false);
  const showWidget = useState<boolean>("dam-upload-widget-visible", () => false);
  const minimized = useState<boolean>("dam-upload-widget-minimized", () => false);
  const isCancelled = useState<boolean>("dam-upload-cancelled", () => false);
  const uploadPhase = useState<"uploading" | "syncing" | "complete" | "error" | null>(
    "dam-upload-phase",
    () => null,
  );
  const items = useState<UploadProgressItem[]>("dam-upload-items", () => []);
  const currentDestination = useState<string>("dam-upload-dest-name", () => "");

  const totalFiles = computed(() => items.value.length);
  const completedFiles = computed(
    () => items.value.filter((i) => i.status === "complete").length,
  );

  const overallProgress = computed(() => {
    if (!items.value.length) return 0;
    const sum = items.value.reduce((acc, item) => acc + (item.progress || 0), 0);
    return Math.min(100, Math.round(sum / items.value.length));
  });

  let dismissTimer: any = null;

  const startUpload = (
    files: Array<{ name: string; size?: number }>,
    destination: string = "DAM Storage",
  ) => {
    if (dismissTimer) clearTimeout(dismissTimer);
    activeAbortController = new AbortController();
    isCancelled.value = false;
    currentDestination.value = destination;
    isUploading.value = true;
    showWidget.value = true;
    minimized.value = false;
    uploadPhase.value = "uploading";

    items.value = files.map((f, idx) => ({
      id: `${f.name}-${Date.now()}-${idx}`,
      name: f.name,
      size: f.size,
      progress: 0,
      status: "uploading",
    }));
  };

  const updateItemProgress = (name: string, progress: number) => {
    const item = items.value.find((i) => i.name === name);
    if (item) {
      item.progress = Math.min(100, Math.max(0, Math.round(progress)));
      if (item.progress >= 100 && item.status !== "complete") {
        item.status = "syncing";
      }
    }
  };

  const setItemComplete = (name: string) => {
    const item = items.value.find((i) => i.name === name);
    if (item) {
      item.progress = 100;
      item.status = "complete";
    }
  };

  const setItemError = (name: string, error: string) => {
    const item = items.value.find((i) => i.name === name);
    if (item) {
      item.status = "error";
      item.error = error;
    }
  };

  const setPhase = (phase: "uploading" | "syncing" | "complete" | "error") => {
    uploadPhase.value = phase;
  };

  const completeUpload = (autoDismissMs = 6000) => {
    isUploading.value = false;
    uploadPhase.value = "complete";
    items.value.forEach((item) => {
      if (item.status !== "error") {
        item.progress = 100;
        item.status = "complete";
      }
    });

    if (autoDismissMs > 0) {
      if (dismissTimer) clearTimeout(dismissTimer);
      dismissTimer = setTimeout(() => {
        dismissUpload();
      }, autoDismissMs);
    }
  };

  const failUpload = (errorMessage?: string) => {
    isUploading.value = false;
    uploadPhase.value = "error";
    items.value.forEach((item) => {
      if (item.status === "uploading" || item.status === "pending") {
        item.status = "error";
        if (errorMessage) item.error = errorMessage;
      }
    });
  };

  const stopUpload = (reason: string = "Upload stopped by user") => {
    isCancelled.value = true;
    if (activeAbortController) {
      try {
        activeAbortController.abort();
      } catch {}
    }
    isUploading.value = false;
    uploadPhase.value = "error";
    items.value.forEach((item) => {
      if (item.status === "uploading" || item.status === "pending" || item.status === "syncing") {
        item.status = "error";
        item.error = reason;
      }
    });
  };

  const stopItem = (identifier: string) => {
    const item = items.value.find((i) => i.id === identifier || i.name === identifier);
    if (item && (item.status === "uploading" || item.status === "pending")) {
      item.status = "error";
      item.error = "Stopped by user";
    }
  };

  const getAbortSignal = () => activeAbortController?.signal;

  const dismissUpload = () => {
    if (dismissTimer) clearTimeout(dismissTimer);
    if (isUploading.value) {
      stopUpload("Upload dismissed");
    }
    showWidget.value = false;
    isUploading.value = false;
    uploadPhase.value = null;
    items.value = [];
  };

  const toggleMinimized = () => {
    minimized.value = !minimized.value;
  };

  return {
    isUploading,
    showWidget,
    minimized,
    isCancelled,
    uploadPhase,
    items,
    currentDestination,
    totalFiles,
    completedFiles,
    overallProgress,
    startUpload,
    updateItemProgress,
    setItemComplete,
    setItemError,
    setPhase,
    completeUpload,
    failUpload,
    stopUpload,
    stopItem,
    getAbortSignal,
    dismissUpload,
    toggleMinimized,
  };
}
