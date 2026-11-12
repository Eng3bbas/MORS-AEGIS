// Flammability map for the PSI-69 FLEX table: per fuel × pressure band × diluent group, the tests
// ordered by ambient O₂ mole fraction with their recorded outcome, and a limiting-oxygen-index (LOI)
// bracket where the outcomes allow one. Pure functions only (no I/O).
//
// LOI here means the lowest ambient O₂ mole fraction at which a droplet flame is sustained.
// The table records how each test ended, not an LOI, so every bracket below is INFERRED from
// OBSERVED outcomes under the interpretation stated in OUTCOME_INTERPRETATION. No single LOI value
// is ever interpolated; a bracket is two observed O₂ fractions, not a measurement between them.
import { groupRows } from './strata.mjs';

/**
 * ASSUMPTION — how each `test_end` label is read when bracketing the LOI:
 *  - Completion: the flame survived until the fuel was consumed → sustained burning.
 *  - Extinction: the flame went out while fuel remained → not sustained. In microgravity a large
 *    droplet can also extinguish radiatively at high O₂, so an Extinction is not proof that the
 *    O₂ fraction was below the LOI; it only shows that this test did not burn to completion.
 *  - Disruption: the droplet broke up or the test ended for a non-flame reason, so the flame's fate
 *    is undetermined → excluded from the bracket by default (still listed and plotted).
 *    `disruptionAs` can re-classify Disruption for a sensitivity check.
 *  - Any other or missing label → excluded.
 */
export const OUTCOME_INTERPRETATION = Object.freeze({
  Completion: Object.freeze({ reading: 'sustained', note: 'Flame survived until the fuel was consumed.' }),
  Extinction: Object.freeze({ reading: 'not-sustained', note: 'Flame went out while fuel remained (diffusive or radiative extinction).' }),
  Disruption: Object.freeze({ reading: 'excluded', note: 'Droplet disrupted or test ended for a non-flame reason; flame fate undetermined.' })
});
export const READINGS = Object.freeze(['sustained', 'not-sustained', 'excluded']);
export const BRACKET_STATUS = Object.freeze(['bracketed', 'overlapping', 'not bracketed']);

export const ASSUMPTIONS = Object.freeze([
  'Completion is read as sustained burning; Extinction as not sustained; Disruption is excluded from brackets unless disruptionAs says otherwise.',
  'An Extinction above the LOI is possible (radiative extinction of large droplets), so outcomes can overlap in O₂ and a clean bracket may not exist.',
  'Tests are grouped by fuel, pressure band and diluent only; droplet diameter, diluent fraction and exact pressure within a band are not controlled.',
  'A bracket is the pair of observed O₂ fractions on either side of the boundary; no value between them is estimated.'
]);

export const LIMITATIONS = Object.freeze([
  'The table supplies no instrument uncertainty for O₂ fraction, pressure or outcome.',
  'Free versus fiber-supported droplets and droplet drift are not recorded in the table, although both can change the outcome.',
  'Initial droplet diameter varies between tests and affects radiative extinction; it is listed but not controlled for.',
  'Some groups contain only a handful of tests; a bracket from few tests is weak evidence.'
]);

const DISRUPTION_OPTIONS = Object.freeze(['excluded', 'sustained', 'not-sustained']);

export function normalizeOptions(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new Error('options must be an object.');
  const disruptionAs = options.disruptionAs ?? 'excluded';
  if (!DISRUPTION_OPTIONS.includes(disruptionAs)) throw new Error(`disruptionAs must be one of ${DISRUPTION_OPTIONS.join(', ')}.`);
  return { disruptionAs };
}

/** Reads one `test_end` label under the stated interpretation. */
export function classifyOutcome(testEnd, options) {
  const { disruptionAs } = normalizeOptions(options);
  const label = typeof testEnd === 'string' ? testEnd.trim() : '';
  if (label === 'Disruption') return disruptionAs;
  return OUTCOME_INTERPRETATION[label]?.reading ?? 'excluded';
}

const num = value => (Number.isFinite(value) ? value : null);

/**
 * LOI bracket from points that each carry {oxygen, reading}. Points without a finite O₂ or with an
 * excluded reading are ignored. Status:
 *  - 'bracketed'     every not-sustained O₂ < every sustained O₂: LOI lies in (lower, upper].
 *  - 'overlapping'   both outcomes present but a not-sustained test sits at or above the lowest
 *                    sustained O₂, so O₂ alone does not separate them in this group.
 *  - 'not bracketed' only one outcome (or none) is present: the data do not straddle the boundary.
 */
export function loiBracket(points) {
  const decided = points.filter(p => Number.isFinite(p.oxygen) && (p.reading === 'sustained' || p.reading === 'not-sustained'));
  const sustained = decided.filter(p => p.reading === 'sustained').map(p => p.oxygen);
  const notSustained = decided.filter(p => p.reading === 'not-sustained').map(p => p.oxygen);
  const lowestSustained = sustained.length ? Math.min(...sustained) : null;
  const highestNotSustained = notSustained.length ? Math.max(...notSustained) : null;
  const base = {
    evidence: 'INFERRED', decided: decided.length, sustained: sustained.length, notSustained: notSustained.length,
    lowestSustained, highestNotSustained, interval: null, overlap: null
  };
  if (!decided.length) return { ...base, status: 'not bracketed', reason: 'No test in this group has an outcome that counts for the bracket.' };
  if (!sustained.length) return {
    ...base, status: 'not bracketed',
    reason: `No test sustained burning (highest O₂ tested with a decided outcome: ${highestNotSustained}). The data do not straddle the boundary, and an Extinction alone does not place the LOI above it.`
  };
  if (!notSustained.length) return {
    ...base, status: 'not bracketed',
    reason: `Every decided test sustained burning, so the LOI is at most ${lowestSustained}; no lower bound is observed.`
  };
  if (highestNotSustained < lowestSustained) return {
    ...base, status: 'bracketed', interval: { lower: highestNotSustained, upper: lowestSustained },
    reason: `Highest not-sustained O₂ ${highestNotSustained} < lowest sustained O₂ ${lowestSustained}; the LOI lies above ${highestNotSustained} and at or below ${lowestSustained}. No value inside the interval is estimated.`
  };
  return {
    ...base, status: 'overlapping', overlap: { from: lowestSustained, to: highestNotSustained },
    reason: `Outcomes overlap ${lowestSustained === highestNotSustained ? `at O₂ ${lowestSustained}` : `between O₂ ${lowestSustained} and ${highestNotSustained}`}: tests extinguished at or above the lowest O₂ where one burned to completion. O₂ alone does not separate the outcomes here; sustained burning at ${lowestSustained} only shows the LOI is at most ${lowestSustained}.`
  };
}

function toPoint(row, options) {
  return {
    evidence: 'OBSERVED',
    id: row.id ?? null, test: row.test ?? null,
    pressure_mmHg: num(row.pressure_mmHg), oxygen: num(row.oxygen_mole_fraction),
    carbon_dioxide: num(row.carbon_dioxide_mole_fraction), helium: num(row.helium_mole_fraction),
    initial_droplet_diameter_mm: num(row.initial_droplet_diameter_mm),
    test_end: typeof row.test_end === 'string' ? row.test_end : null,
    reading: classifyOutcome(row.test_end, options)
  };
}

const byOxygen = (a, b) => (a.oxygen ?? Infinity) - (b.oxygen ?? Infinity) || (a.pressure_mmHg ?? Infinity) - (b.pressure_mmHg ?? Infinity) || String(a.id).localeCompare(String(b.id));

/** Per-O₂ tally inside one group: [{oxygen, sustained, notSustained, excluded, outcomes:{label:n}}]. */
function oxygenLevels(points) {
  const levels = new Map();
  for (const p of points) {
    if (p.oxygen === null) continue;
    if (!levels.has(p.oxygen)) levels.set(p.oxygen, { oxygen: p.oxygen, sustained: 0, notSustained: 0, excluded: 0, outcomes: {} });
    const level = levels.get(p.oxygen);
    level[p.reading === 'sustained' ? 'sustained' : p.reading === 'not-sustained' ? 'notSustained' : 'excluded']++;
    const label = p.test_end ?? 'missing';
    level.outcomes[label] = (level.outcomes[label] ?? 0) + 1;
  }
  return [...levels.values()].sort((a, b) => a.oxygen - b.oxygen);
}

/**
 * The flammability map: one entry per fuel × pressure band × diluent group, in strata order.
 * @returns {{options, interpretation, assumptions, limitations, records, groups: object[]}}
 */
export function flammabilityMap(rows, options) {
  const opts = normalizeOptions(options);
  const groups = groupRows(rows).map(({ condition, label, rows: members }) => {
    const points = members.map(row => toPoint(row, opts)).sort(byOxygen);
    const pressures = points.map(p => p.pressure_mmHg).filter(v => v !== null);
    return {
      condition, label, n: points.length,
      pressureRange: pressures.length ? { min: Math.min(...pressures), max: Math.max(...pressures) } : null,
      missingOxygen: points.filter(p => p.oxygen === null).length,
      levels: oxygenLevels(points),
      bracket: loiBracket(points),
      points
    };
  });
  return {
    options: opts,
    interpretation: OUTCOME_INTERPRETATION,
    assumptions: ASSUMPTIONS,
    limitations: LIMITATIONS,
    records: rows.length,
    groups
  };
}

