import type { Ref } from "vue";
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { calculateFloatingPanelPosition } from "~/utils/floating-panel";

type TriggerElement = HTMLElement | { $el?: HTMLElement } | null;

const resolveElement = (value: TriggerElement): HTMLElement | null => {
  if (!value) return null;
  if (value instanceof HTMLElement) return value;
  if ("$el" in value && value.$el instanceof HTMLElement) return value.$el;
  return null;
};

export const useFloatingPanel = (
  triggerRef: Ref<TriggerElement>,
  panelRef: Ref<HTMLElement | null>,
  open: Ref<boolean>,
) => {
  const panelStyle = ref<Record<string, string>>({
    top: "12px",
    left: "12px",
    maxHeight: "calc(100dvh - 24px)",
  });
  let frame: number | null = null;
  let listening = false;

  const computePosition = () => {
    if (!import.meta.client || !open.value) return;
    const triggerEl = resolveElement(triggerRef.value);
    const trigger = triggerEl ? triggerEl.getBoundingClientRect() : null;
    const panel = panelRef.value?.getBoundingClientRect();
    const position = calculateFloatingPanelPosition({
      trigger,
      panel: {
        width: panel?.width || Math.min(480, window.innerWidth - 24),
        height: panel?.height || Math.min(608, window.innerHeight - 24),
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    panelStyle.value = {
      top: `${position.top}px`,
      left: `${position.left}px`,
      maxHeight: `${position.maxHeight}px`,
    };
  };

  const updatePosition = () => {
    if (!import.meta.client || !open.value) return;
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      frame = null;
      computePosition();
    });
  };

  const close = () => {
    open.value = false;
  };

  const toggle = () => {
    open.value = !open.value;
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };

  const addListeners = () => {
    if (!import.meta.client || listening) return;
    listening = true;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("keydown", onKeydown);
  };

  const removeListeners = () => {
    if (!import.meta.client || !listening) return;
    listening = false;
    window.removeEventListener("resize", updatePosition);
    window.removeEventListener("scroll", updatePosition, true);
    document.removeEventListener("keydown", onKeydown);
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  };

  watch(open, async (isOpen, wasOpen) => {
    if (isOpen) {
      addListeners();
      computePosition();
      await nextTick();
      computePosition();
      updatePosition();
      return;
    }
    removeListeners();
    if (wasOpen) await nextTick();
    resolveElement(triggerRef.value)?.focus();
  }, { flush: "post" });

  onBeforeUnmount(removeListeners);

  return { panelStyle, close, toggle, updatePosition };
};
