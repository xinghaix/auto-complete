export const Debouncer = {
  MIN_MS: 150,
  INITIAL_MS: 300,
  MAX_MS: 1000,
  SAMPLE_SIZE: 10,

  nextDelay(current: number, latencySamples: number[]): number {
    if (latencySamples.length < this.SAMPLE_SIZE) {
      return clamp(current, this.MIN_MS, this.MAX_MS);
    }
    const slice = latencySamples.slice(-this.SAMPLE_SIZE);
    const avg = Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
    return Math.max(this.MIN_MS, Math.min(avg, this.MAX_MS));
  },
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
