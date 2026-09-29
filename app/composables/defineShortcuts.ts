import { onMounted, onUnmounted } from "vue";

export function defineShortcuts(shortcuts: Record<string, any>) {
  if (import.meta.server) return;

  onMounted(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          activeEl.isContentEditable ||
          activeEl.closest("input, textarea, select, [contenteditable='true']"))
      ) {
        return;
      }

      for (const [keyCombo, target] of Object.entries(shortcuts)) {
        const action = typeof target === "function" ? target : target?.handler;
        if (!action) continue;

        const keys = keyCombo.toLowerCase().split("_");
        const needMeta = keys.includes("meta") || keys.includes("ctrl") || keys.includes("cmd");
        const needShift = keys.includes("shift");
        const needAlt = keys.includes("alt");
        const mainKey = keys.find((k) => !["meta", "ctrl", "cmd", "shift", "alt"].includes(k));

        const metaPressed = e.metaKey || e.ctrlKey;
        const shiftPressed = e.shiftKey;
        const altPressed = e.altKey;

        if (needMeta && !metaPressed) continue;
        if (needShift && !shiftPressed) continue;
        if (needAlt && !altPressed) continue;

        if (mainKey && e.key.toLowerCase() === mainKey.toLowerCase()) {
          e.preventDefault();
          action();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onUnmounted(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });
}
