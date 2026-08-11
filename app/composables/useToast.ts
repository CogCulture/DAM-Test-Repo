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
    const id = toast.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const item = { ...toast, id };
    toasts.value.push(item);

    const timeout = toast.timeout ?? 4000;
    if (timeout > 0 && process.client) {
      setTimeout(() => {
        remove(id);
      }, timeout);
    }
    return item;
  }

  function remove(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
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
