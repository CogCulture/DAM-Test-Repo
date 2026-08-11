export interface FloatingPanelRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FloatingPanelSize {
  width: number;
  height: number;
}

export interface FloatingPanelPositionInput {
  trigger: FloatingPanelRect | null;
  panel: FloatingPanelSize;
  viewport: FloatingPanelSize;
  margin?: number;
  gap?: number;
}

export interface FloatingPanelPosition {
  top: number;
  left: number;
  maxHeight: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

export const calculateFloatingPanelPosition = ({
  trigger,
  panel,
  viewport,
  margin = 12,
  gap = 10,
}: FloatingPanelPositionInput): FloatingPanelPosition => {
  const maxHeight = Math.max(0, viewport.height - (margin * 2));
  const leftLimit = viewport.width - margin - panel.width;

  if (!trigger) {
    return {
      top: margin,
      left: clamp(viewport.width - margin - panel.width, margin, leftLimit),
      maxHeight,
    };
  }

  const roomBelow = viewport.height - margin - trigger.bottom - gap;
  const roomAbove = trigger.top - margin - gap;
  const openAbove = roomBelow < Math.min(panel.height, maxHeight) && roomAbove > roomBelow;
  const top = openAbove
    ? Math.max(margin, trigger.top - gap - Math.min(panel.height, roomAbove))
    : Math.max(margin, trigger.bottom + gap);

  return {
    top,
    left: clamp(trigger.right - panel.width, margin, leftLimit),
    maxHeight: openAbove ? roomAbove : Math.max(0, viewport.height - margin - top),
  };
};
