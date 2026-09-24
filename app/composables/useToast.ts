export interface ToastItem {
  id?: string;
  title?: string;
  description?: string;
  color?: string;
  icon?: string;
  timeout?: number;
}

export function useToast() {
  const toasts = useState<ToastItem[]>("app-toasts-state", () => []);

  function add(toast: ToastItem) {
    // Toasts are permanently disabled per user requirement (no positive or negative popups)
    return { ...toast, id: "disabled" };
  }

  function remove(_id: string) {
    toasts.value = [];
  }

  function clear() {
    toasts.value = [];
  }

  return {
    toasts,
    add,
    remove,
    clear,
  };
}
