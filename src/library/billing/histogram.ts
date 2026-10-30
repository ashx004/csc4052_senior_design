// Fixed-bucket histograms, so day rollups can carry a distribution without keeping every row. No Firebase here.

/** Upper edge of each duration bucket, in ms. The last bucket is open-topped. */
export const DURATION_EDGES_MS: readonly number[] = [
  100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 30000, 45000, 60000, 90000, Infinity,
];

/** Upper edge of each charge bucket, in micros. The last bucket is open-topped. */
export const CHARGE_EDGES_MICROS: readonly number[] = [
  100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, Infinity,
];

/** Counts per bucket, one per edge: a value lands in the first bucket whose edge it does not exceed. */
export function toHistogram(values: number[], edges: readonly number[]): number[] {
  const counts = edges.map(() => 0);
  for (const value of values) counts[edges.findIndex((edge) => value <= edge)]++;
  return counts;
}

export function mergeHistograms(a: number[], b: number[]): number[] {
  if (a.length !== b.length) throw new Error(`Cannot merge histograms of length ${a.length} and ${b.length}`);
  return a.map((n, i) => n + b[i]);
}

/** Index of the bucket holding the nearest-rank value, or -1 for fewer than 5 values. */
function percentileBucket(counts: number[], fraction: number): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total < 5) return -1;
  // Epsilon keeps 0.95 * 100 from rounding up to rank 96.
  const rank = Math.min(Math.max(1, Math.ceil(fraction * total - 1e-9)), total);
  let seen = 0;
  for (let i = 0; i < counts.length; i++) {
    seen += counts[i];
    if (seen >= rank) return i;
  }
  return -1;
}

/** Nearest-rank percentile, as `percentile()` in aiPerformance.ts, reported as the upper edge of the bucket holding it.
 * Fewer than 5 values is null. An answer in the open-topped last bucket is null too: it has no edge to report
 * (percentileAboveFromHistogram tells that case apart). */
export function percentileFromHistogram(counts: number[], edges: readonly number[], fraction: number): number | null {
  const i = percentileBucket(counts, fraction);
  return i >= 0 && Number.isFinite(edges[i]) ? edges[i] : null;
}

/** The last finite edge when the nearest-rank answer lies in the open-topped last bucket, so it can be shown as "above"
 * that edge; null otherwise, fewer than 5 values included. Never Infinity, so it survives JSON. */
export function percentileAboveFromHistogram(counts: number[], edges: readonly number[], fraction: number): number | null {
  const i = percentileBucket(counts, fraction);
  return i > 0 && !Number.isFinite(edges[i]) ? edges[i - 1] : null;
}
