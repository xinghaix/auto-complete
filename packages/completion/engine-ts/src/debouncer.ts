export function normalizeDebounceBounds(
  minMs: number,
  maxMs: number,
): { min: number; max: number } {
  const safeMin = Math.max(0, Number.isFinite(minMs) ? Math.trunc(minMs) : 0);
  const safeMax = Math.max(0, Number.isFinite(maxMs) ? Math.trunc(maxMs) : 0);
  return safeMin <= safeMax
    ? { min: safeMin, max: safeMax }
    : { min: safeMax, max: safeMin };
}

export const Debouncer = {
  MIN_MS: 150,
  INITIAL_MS: 300,
  MAX_MS: 1000,
  SAMPLE_SIZE: 10,

  nextDelay(
    current: number,
    latencySamples: number[],
    minMs = 150,
    maxMs = 1000,
  ): number {
    const { min, max } = normalizeDebounceBounds(minMs, maxMs);
    if (latencySamples.length < this.SAMPLE_SIZE) {
      return clamp(current, min, max);
    }
    const slice = latencySamples.slice(-this.SAMPLE_SIZE);
    const avg = Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
    return clamp(avg, min, max);
  },
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
