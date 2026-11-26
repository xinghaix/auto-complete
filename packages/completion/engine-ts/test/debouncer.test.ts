import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Debouncer, normalizeDebounceBounds } from "../src/debouncer.js";

describe("Debouncer", () => {
  it("normalizes inverted bounds and allows min=0", () => {
    assert.deepEqual(normalizeDebounceBounds(0, 500), { min: 0, max: 500 });
    assert.deepEqual(normalizeDebounceBounds(800, 200), { min: 200, max: 800 });
    assert.deepEqual(normalizeDebounceBounds(-50, 100), { min: 0, max: 100 });
  });

  it("clamps current delay when sample count is below SAMPLE_SIZE", () => {
    assert.equal(Debouncer.nextDelay(300, [100, 200]), 300);
    assert.equal(Debouncer.nextDelay(50, [100], 0, 500), 50);
    assert.equal(Debouncer.nextDelay(50, [100], 150, 500), 150);
  });

  it("uses average of last 10 latency samples clamped to [min, max]", () => {
    const samples = Array.from({ length: 10 }, () => 400);
    assert.equal(Debouncer.nextDelay(300, samples, 0, 1000), 400);

    const fast = Array.from({ length: 10 }, () => 20);
    assert.equal(Debouncer.nextDelay(300, fast, 0, 1000), 20);
    assert.equal(Debouncer.nextDelay(300, fast, 150, 1000), 150);

    const slow = Array.from({ length: 10 }, () => 2500);
    assert.equal(Debouncer.nextDelay(300, slow, 150, 1000), 1000);
  });
});
