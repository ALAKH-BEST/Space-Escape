// Small statistics helpers shared by the load generator and the report writer.

export type LatencySummary = {
  count: number;
  min: number | null;
  mean: number | null;
  p50: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  p999: number | null;
  max: number | null;
};

/**
 * Exact percentiles over every recorded sample (nearest-rank method:
 * the p-th percentile is the smallest value with at least p% of samples at or
 * below it). No histogram bucketing, so nothing is approximated.
 */
export function summarizeLatencies(buffer: Float64Array, end: number, start = 0): LatencySummary {
  const count = end - start;
  if (count <= 0) {
    return { count: 0, min: null, mean: null, p50: null, p90: null, p95: null, p99: null, p999: null, max: null };
  }
  const sorted = buffer.slice(start, end).sort();
  const pick = (p: number) => sorted[Math.min(count - 1, Math.max(0, Math.ceil((p / 100) * count) - 1))];
  let sum = 0;
  for (let i = 0; i < count; i++) sum += sorted[i];
  return {
    count,
    min: sorted[0],
    mean: sum / count,
    p50: pick(50),
    p90: pick(90),
    p95: pick(95),
    p99: pick(99),
    p999: pick(99.9),
    max: sorted[count - 1],
  };
}

/** Least-squares slope of y against x (units of y per unit of x). */
export function linearSlope(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 2) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Ordinary least-squares line y = intercept + slope * x, with the standard error
 * of the slope (needs at least 3 points; otherwise the error is null).
 */
export function linearFit(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, slopeStdError: null as number | null };
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2;
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  let slopeStdError: number | null = null;
  if (n >= 3 && sxx > 0) {
    let residualSquares = 0;
    for (let i = 0; i < n; i++) residualSquares += (ys[i] - (intercept + slope * xs[i])) ** 2;
    slopeStdError = Math.sqrt(residualSquares / (n - 2) / sxx);
  }
  return { slope, intercept, slopeStdError };
}

/** Pearson correlation coefficient (null when either series has no variation). */
export function correlation(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 3) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2;
    syy += (ys[i] - meanY) ** 2;
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

/**
 * Exact two-sided permutation test for a difference in means between two small
 * groups: the share of all ways of splitting the pooled values into groups of
 * the same sizes whose mean difference is at least as large as the observed one.
 * No distribution assumptions; practical up to about 10 values per group.
 */
export function permutationPValue(a: number[], b: number[]) {
  const pooled = [...a, ...b];
  const n = pooled.length;
  if (a.length === 0 || b.length === 0 || n > 24) return null;
  const total = pooled.reduce((x, y) => x + y, 0);
  const observed = Math.abs(a.reduce((x, y) => x + y, 0) / a.length - b.reduce((x, y) => x + y, 0) / b.length);
  let atLeastAsExtreme = 0;
  let splits = 0;
  // Enumerate every subset of size a.length with a bitmask (n <= 24, so at most 2^24 masks).
  for (let mask = 0; mask < 1 << n; mask++) {
    let count = 0;
    for (let m = mask; m; m &= m - 1) count++;
    if (count !== a.length) continue;
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += pooled[i];
    const difference = Math.abs(sum / a.length - (total - sum) / b.length);
    splits++;
    if (difference >= observed - 1e-9) atLeastAsExtreme++;
  }
  return atLeastAsExtreme / splits;
}

export function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function round(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
