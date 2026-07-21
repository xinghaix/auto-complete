import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Pure placement helper (mirrors useFloatingMenu.measure) so we can unit-test
 * without a full Vue DOM harness. Keep in sync with useFloatingMenu.ts.
 */
function placeMenu(opts: {
  trigger: { top: number; left: number; width: number; bottom: number };
  viewport: { width: number; height: number };
  preferBelow?: boolean;
  maxMenuHeight?: number;
  gap?: number;
}): { top: number; left: number; width: number; maxHeight: number } {
  const preferBelow = opts.preferBelow ?? true;
  const maxMenuHeight = opts.maxMenuHeight ?? 240;
  const gap = opts.gap ?? 4;
  const r = opts.trigger;
  const vw = opts.viewport.width;
  const vh = opts.viewport.height;
  const width = Math.max(r.width, 96);
  const spaceBelow = vh - r.bottom - gap - 8;
  const spaceAbove = r.top - gap - 8;
  const openBelow =
    preferBelow
      ? spaceBelow >= Math.min(120, maxMenuHeight) || spaceBelow >= spaceAbove
      : spaceAbove < spaceBelow;
  const available = Math.max(80, openBelow ? spaceBelow : spaceAbove);
  const height = Math.min(maxMenuHeight, available);
  let left = r.left;
  if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
  if (left < 8) left = 8;
  const top = openBelow ? r.bottom + gap : Math.max(8, r.top - gap - height);
  return {
    top: Math.round(top),
    left: Math.round(left),
    width: Math.round(width),
    maxHeight: Math.round(height),
  };
}

describe("floating menu placement", () => {
  it("opens below when there is room", () => {
    const p = placeMenu({
      trigger: { top: 40, left: 20, width: 160, bottom: 68 },
      viewport: { width: 800, height: 600 },
    });
    assert.equal(p.top, 72); // bottom + gap
    assert.equal(p.left, 20);
    assert.equal(p.width, 160);
    assert.ok(p.maxHeight <= 240);
    assert.ok(p.maxHeight > 100);
  });

  it("flips above when space below is tight", () => {
    const p = placeMenu({
      trigger: { top: 520, left: 20, width: 160, bottom: 548 },
      viewport: { width: 800, height: 560 },
    });
    // opens above: top < trigger.top
    assert.ok(p.top < 520, `expected above, got top=${p.top}`);
  });

  it("clamps left edge inside the viewport", () => {
    const p = placeMenu({
      trigger: { top: 40, left: 750, width: 160, bottom: 68 },
      viewport: { width: 800, height: 600 },
    });
    assert.ok(p.left + p.width <= 800 - 8);
    assert.ok(p.left >= 8);
  });

  it("enforces a minimum trigger width of 96", () => {
    const p = placeMenu({
      trigger: { top: 10, left: 10, width: 40, bottom: 38 },
      viewport: { width: 400, height: 400 },
    });
    assert.equal(p.width, 96);
  });
});
