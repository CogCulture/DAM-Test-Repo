import test from 'node:test';
import assert from 'node:assert/strict';

test('clamps the Asset actions panel inside the viewport', async () => {
  const { calculateFloatingPanelPosition } = await import('../app/utils/floating-panel.ts');

  assert.deepEqual(calculateFloatingPanelPosition({
    trigger: { top: 60, bottom: 100, left: 940, right: 1020 },
    panel: { width: 480, height: 600 },
    viewport: { width: 1024, height: 720 },
    margin: 12,
    gap: 10,
  }), {
    top: 110,
    left: 532,
    maxHeight: 598,
  });
});

test('opens above the trigger when that preserves more usable height', async () => {
  const { calculateFloatingPanelPosition } = await import('../app/utils/floating-panel.ts');

  assert.deepEqual(calculateFloatingPanelPosition({
    trigger: { top: 650, bottom: 690, left: 700, right: 780 },
    panel: { width: 320, height: 400 },
    viewport: { width: 800, height: 720 },
    margin: 12,
    gap: 8,
  }), {
    top: 242,
    left: 460,
    maxHeight: 630,
  });
});

test('uses a safe upper-right fallback when the trigger is unavailable', async () => {
  const { calculateFloatingPanelPosition } = await import('../app/utils/floating-panel.ts');

  assert.deepEqual(calculateFloatingPanelPosition({
    trigger: null,
    panel: { width: 360, height: 500 },
    viewport: { width: 390, height: 844 },
    margin: 12,
    gap: 8,
  }), {
    top: 12,
    left: 18,
    maxHeight: 820,
  });
});
