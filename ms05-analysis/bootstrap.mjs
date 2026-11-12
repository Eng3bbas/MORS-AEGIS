// Seeded percentile bootstrap confidence intervals and condition-stratified summaries.
// Deterministic: the same rows, seed and resample count always give identical intervals.
import { pearson } from './analysis.mjs';
import { groupRows, normalizeGroupBy, conditionLabel } from './strata.mjs';

export const DEFAULT_SEED = 69; // PSI-69
export const DEFAULT_RESAMPLES = 2000;
export const MIN_RESAMPLES = 200;
export const MAX_RESAMPLES = 20000;
export const MIN_CI_N = 5; // below this, no interval is reported
export const CI_LEVEL = 0.95;
export const BOOTSTRAP_METHOD = 'percentile bootstrap, 95%; mulberry32 PRNG; sample with replacement; lower = sorted[floor(0.025·B)], upper = sorted[ceil(0.975·B)−1]';

/** mulberry32: small, well-known 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derives an independent 32-bit seed per stratum (FNV-1a over the label) so filtering one group never shifts another's CI. */
export function deriveSeed(seed, label) {
  let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  for (const ch of String(label)) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h;
}

export function normalizeBootstrap({ seed = DEFAULT_SEED, resamples = DEFAULT_RESAMPLES } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be an integer between 0 and 4294967295.');
  if (!Number.isInteger(resamples) || resamples < MIN_RESAMPLES || resamples > MAX_RESAMPLES)
    throw new Error(`resamples must be an integer between ${MIN_RESAMPLES} and ${MAX_RESAMPLES}.`);
  return { seed, resamples, level: CI_LEVEL, method: BOOTSTRAP_METHOD, minN: MIN_CI_N };
}

const mean = values => values.reduce((s, v) => s + v, 0) / values.length;
function percentile(sorted) {
  const alpha = (1 - CI_LEVEL) / 2;
  return { low: sorted[Math.floor(alpha * sorted.length)], high: sorted[Math.ceil((1 - alpha) * sorted.length) - 1] };
}
const refused = n => ({ low: null, high: null, n, reason: `n = ${n} < ${MIN_CI_N}: confidence interval not reported.` });

/** Percentile bootstrap CI for the arithmetic mean of finite values. */
export function bootstrapMeanCI(values, options = {}) {
  const { seed, resamples } = normalizeBootstrap(options);
  const xs = values.filter(Number.isFinite);
  if (xs.length < MIN_CI_N) return refused(xs.length);
  const rand = mulberry32(seed), n = xs.length, stats = new Float64Array(resamples);
  for (let b = 0; b < resamples; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += xs[Math.floor(rand() * n)];
    stats[b] = sum / n;
  }
  stats.sort();
  return { ...percentile(stats), n, level: CI_LEVEL, resamples, seed };
}

/** Percentile bootstrap CI for Pearson r over paired rows; degenerate resamples (zero variance) are dropped and counted. */
export function bootstrapPearsonCI(rows, a, b, options = {}) {
  const { seed, resamples } = normalizeBootstrap(options);
  const pairs = rows.filter(row => Number.isFinite(row?.[a]) && Number.isFinite(row?.[b])).map(row => [row[a], row[b]]);
  const n = pairs.length;
  if (n < MIN_CI_N) return refused(n);
  const rand = mulberry32(seed), rs = [];
  for (let k = 0; k < resamples; k++) {
    let sx = 0, sy = 0;
    const idx = new Array(n);
    for (let i = 0; i < n; i++) { idx[i] = Math.floor(rand() * n); sx += pairs[idx[i]][0]; sy += pairs[idx[i]][1]; }
    const mx = sx / n, my = sy / n;
    let num = 0, dx = 0, dy = 0;
    for (const i of idx) { const u = pairs[i][0] - mx, v = pairs[i][1] - my; num += u * v; dx += u * u; dy += v * v; }
    if (dx > 0 && dy > 0) rs.push(num / Math.sqrt(dx * dy));
  }
  if (rs.length < resamples / 2) return { low: null, high: null, n, reason: 'Most resamples had no variation; interval not reported.' };
  rs.sort((x, y) => x - y);
  return { ...percentile(rs), n, level: CI_LEVEL, resamples, seed, degenerateResamples: resamples - rs.length };
}

function describe(rows, variable, bootstrap, label) {
  const values = rows.map(row => row?.[variable]).filter(Number.isFinite);
  const m = values.length ? mean(values) : null;
  const sd = values.length > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1)) : null;
  return {
    n: values.length, missing: rows.length - values.length, mean: m, sampleSd: sd,
    ci95: bootstrapMeanCI(values, { ...bootstrap, seed: deriveSeed(bootstrap.seed, `${label}|${variable}`) })
  };
}

function associate(rows, bootstrap, label) {
  const [a, b] = ['initial_droplet_diameter_mm', 'burning_rate_mm_s'];
  const base = pearson(rows, a, b);
  return { x: a, y: b, n: base.n, r: base.r,
    ci95: base.r === null ? refused(base.n) : bootstrapPearsonCI(rows, a, b, { ...bootstrap, seed: deriveSeed(bootstrap.seed, `${label}|pearson`) }) };
}

/**
 * Pooled and per-condition descriptive statistics with bootstrap CIs for one variable,
 * plus the diameter–burning-rate Pearson r per group. Pass `condition` (the filter already applied to rows).
 */
export function stratifiedSummary(rows, { variable = 'burning_rate_mm_s', groupBy, seed, resamples, unit = null, condition = {} } = {}) {
  const keys = normalizeGroupBy(groupBy);
  const bootstrap = normalizeBootstrap({ seed, resamples });
  // The pooled row is named (and seeded) after the filter that produced `rows`, so a stratum gets
  // the same interval whether it is requested as a filter or appears as a group.
  const pooledLabel = conditionLabel(condition);
  return {
    evidence: 'COMPUTED', variable, unit, groupBy: keys,
    bootstrap: { seed: bootstrap.seed, resamples: bootstrap.resamples, level: bootstrap.level, method: bootstrap.method, minN: bootstrap.minN },
    pooled: { condition, label: pooledLabel, records: rows.length, ...describe(rows, variable, bootstrap, pooledLabel), association: associate(rows, bootstrap, pooledLabel) },
    groups: keys.length === 0 ? [] : groupRows(rows, keys).map(group => ({
      condition: group.condition, label: group.label, records: group.rows.length,
      ...describe(group.rows, variable, bootstrap, group.label), association: associate(group.rows, bootstrap, group.label)
    }))
  };
}
