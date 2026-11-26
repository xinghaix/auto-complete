import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFloatingMenuPlacement, isAnchorVisible } from "./useFloatingMenu.ts";

describe("floating menu placement", () => {
  it("opens below using top when there is room", () => {
    const res = computeFloatingMenuPlacement({
      trigger: { top: 40, left: 20, width: 160, bottom: 68 },
      viewport: { width: 800, height: 600 },
    });
    assert.equal(res.placement, "below");
    assert.equal(res.style.top, "72px"); // bottom + gap
    assert.equal(res.style.bottom, undefined);
    assert.equal(res.style.left, "20px");
    assert.equal(res.style.width, "160px");
    assert.ok(parseInt(res.style.maxHeight, 10) <= 240);
    assert.ok(parseInt(res.style.maxHeight, 10) > 100);
  });

  it("flips above using bottom so short menus hug the trigger", () => {
    const res = computeFloatingMenuPlacement({
      trigger: { top: 520, left: 20, width: 160, bottom: 548 },
      viewport: { width: 800, height: 560 },
      gap: 4,
    });
    assert.equal(res.placement, "above");
    assert.equal(res.style.top, undefined);
    // bottom = vh - r.top + gap = 560 - 520 + 4 = 44px
    assert.equal(res.style.bottom, "44px");
  });

  it("clamps left edge inside the viewport", () => {
    const res = computeFloatingMenuPlacement({
      trigger: { top: 40, left: 750, width: 160, bottom: 68 },
      viewport: { width: 800, height: 600 },
    });
    const left = parseInt(res.style.left, 10);
    const width = parseInt(res.style.width, 10);
    assert.ok(left + width <= 800 - 8);
    assert.ok(left >= 8);
  });

  it("enforces a minimum trigger width of 96", () => {
    const res = computeFloatingMenuPlacement({
      trigger: { top: 10, left: 10, width: 40, bottom: 38 },
      viewport: { width: 400, height: 400 },
    });
    assert.equal(res.style.width, "96px");
  });

  it("detects when anchor scrolls out of viewport or scroll container", () => {
    const vp = { width: 800, height: 600 };
    const container = { top: 40, bottom: 560, left: 0, right: 800 };

    assert.equal(
      isAnchorVisible({ top: 100, bottom: 128, left: 20, width: 160 }, vp, container),
      true,
    );
    // Scrolled above the scroll container header
    assert.equal(
      isAnchorVisible({ top: 10, bottom: 38, left: 20, width: 160 }, vp, container),
      false,
    );
    // Scrolled below the scroll container bottom
    assert.equal(
      isAnchorVisible({ top: 565, bottom: 593, left: 20, width: 160 }, vp, container),
      false,
    );
    // Outside viewport completely
    assert.equal(
      isAnchorVisible({ top: -30, bottom: -2, left: 20, width: 160 }, vp, null),
      false,
    );
  });
});
