// Test-condition strata for the PSI-69 FLEX table: fuel, pressure band and diluent gas.
// Pure functions only (no I/O), so grouping is reproducible and unit-testable.

/**
 * Pressure bands derived from the bundled table (273 of 274 tests report pressure; one is missing).
 * The reported pressures form three well-separated clusters, so the cut points sit in the empty gaps:
 *   ~0.7 atm : 526.3–544.4 mmHg observed (103 tests)  → band [0, 650)
 *   ~1 atm   : 752.0–774.1 mmHg observed (161 tests)  → band [650, 1000)
 *   >2 atm   : 1545.7–2319.9 mmHg observed (9 tests)  → band [1000, ∞)
 * 1 atm = 760 mmHg. A missing pressure is placed in the "unknown" band, never imputed.
 * The >2 atm band is deliberately coarse: it spans ~2.0–3.1 atm because only 9 tests exist there.
 */
export const PRESSURE_BANDS = Object.freeze([
  Object.freeze({ id: '0.7atm', label: '~0.7 atm', minMmHg: 0, maxMmHg: 650, observed: '526–545 mmHg' }),
  Object.freeze({ id: '1atm', label: '~1 atm', minMmHg: 650, maxMmHg: 1000, observed: '752–774 mmHg' }),
  Object.freeze({ id: '>2atm', label: '>2 atm', minMmHg: 1000, maxMmHg: Infinity, observed: '1546–2320 mmHg' })
]);
export const UNKNOWN_BAND = 'unknown';

/**
 * Diluent is the added inert gas beyond O₂/N₂: "CO2" when the CO₂ mole fraction is > 0,
 * "He" when the helium mole fraction is > 0, "none" otherwise. "mixed" (both > 0) does not
 * occur in PSI-69 but is kept so uploaded tables are never silently misclassified.
 */
export const DILUENTS = Object.freeze(['none', 'CO2', 'He', 'mixed']);
export const GROUP_KEYS = Object.freeze(['fuel', 'pressureBand', 'diluent']);

export function pressureBandOf(row) {
  const p = row?.pressure_mmHg;
  if (!Number.isFinite(p)) return UNKNOWN_BAND;
  return PRESSURE_BANDS.find(band => p >= band.minMmHg && p < band.maxMmHg)?.id ?? UNKNOWN_BAND;
}

export function diluentOf(row) {
  const co2 = row?.carbon_dioxide_mole_fraction, he = row?.helium_mole_fraction;
  const hasCo2 = Number.isFinite(co2) && co2 > 0, hasHe = Number.isFinite(he) && he > 0;
  if (hasCo2 && hasHe) return 'mixed';
  if (hasCo2) return 'CO2';
  if (hasHe) return 'He';
  return 'none';
}

export function fuelOf(row) {
  return typeof row?.fuel === 'string' && row.fuel.trim() ? row.fuel.trim() : 'unknown';
}

export function conditionOf(row) {
  return { fuel: fuelOf(row), pressureBand: pressureBandOf(row), diluent: diluentOf(row) };
}

const bandLabel = id => PRESSURE_BANDS.find(band => band.id === id)?.label ?? 'pressure unknown';
const diluentLabel = id => (id === 'none' ? 'no diluent' : id === 'mixed' ? 'CO₂ + He' : `${id === 'CO2' ? 'CO₂' : id} diluent`);

export function conditionLabel(condition) {
  const parts = [];
  if (condition.fuel !== undefined) parts.push(condition.fuel);
  if (condition.pressureBand !== undefined) parts.push(bandLabel(condition.pressureBand));
  if (condition.diluent !== undefined) parts.push(diluentLabel(condition.diluent));
  return parts.length ? parts.join(' · ') : 'all tests (pooled)';
}

/**
 * Validates an optional {fuel, pressureBand, diluent} filter. Empty strings and null mean "any".
 * Returns a canonical object with keys in GROUP_KEYS order (only the constrained keys), so the
 * filter can be hashed into a replay recipe. Throws on unknown keys or values.
 */
export function normalizeFilter(filter) {
  if (filter === undefined || filter === null) return {};
  if (typeof filter !== 'object' || Array.isArray(filter)) throw new Error('filter must be an object.');
  for (const key of Object.keys(filter)) if (!GROUP_KEYS.includes(key)) throw new Error(`Unknown filter key ${key}.`);
  const out = {};
  const { fuel, pressureBand, diluent } = filter;
  if (fuel !== undefined && fuel !== null && fuel !== '') {
    if (typeof fuel !== 'string' || fuel.trim().length === 0 || fuel.length > 40) throw new Error('fuel filter must be a short text value.');
    out.fuel = fuel.trim();
  }
  if (pressureBand !== undefined && pressureBand !== null && pressureBand !== '') {
    const ids = [...PRESSURE_BANDS.map(band => band.id), UNKNOWN_BAND];
    if (!ids.includes(pressureBand)) throw new Error(`pressureBand must be one of ${ids.join(', ')}.`);
    out.pressureBand = pressureBand;
  }
  if (diluent !== undefined && diluent !== null && diluent !== '') {
    if (!DILUENTS.includes(diluent)) throw new Error(`diluent must be one of ${DILUENTS.join(', ')}.`);
    out.diluent = diluent;
  }
  return out;
}

/** Rows matching every constrained key of the filter; fuel matches case-insensitively. */
export function filterRows(rows, filter) {
  const f = normalizeFilter(filter);
  return rows.filter(row => {
    const c = conditionOf(row);
    if (f.fuel !== undefined && c.fuel.toLowerCase() !== f.fuel.toLowerCase()) return false;
    if (f.pressureBand !== undefined && c.pressureBand !== f.pressureBand) return false;
    if (f.diluent !== undefined && c.diluent !== f.diluent) return false;
    return true;
  });
}

export function normalizeGroupBy(by) {
  if (by === undefined || by === null) return [...GROUP_KEYS];
  if (!Array.isArray(by) || by.some(key => !GROUP_KEYS.includes(key)) || new Set(by).size !== by.length)
    throw new Error(`groupBy must be a list drawn from ${GROUP_KEYS.join(', ')}.`);
  return GROUP_KEYS.filter(key => by.includes(key)); // canonical order
}

const bandOrder = id => {
  const i = PRESSURE_BANDS.findIndex(band => band.id === id);
  return i === -1 ? PRESSURE_BANDS.length : i;
};
const diluentOrder = id => DILUENTS.indexOf(id);

/**
 * Splits rows into condition groups. Output order is deterministic: fuel alphabetically,
 * then pressure band low→high (unknown last), then diluent in DILUENTS order. Rows keep source order.
 * @returns {{condition: object, label: string, rows: object[]}[]}
 */
export function groupRows(rows, by) {
  const keys = normalizeGroupBy(by);
  const groups = new Map();
  for (const row of rows) {
    const full = conditionOf(row);
    const condition = Object.fromEntries(keys.map(key => [key, full[key]]));
    const id = JSON.stringify(condition);
    if (!groups.has(id)) groups.set(id, { condition, label: conditionLabel(condition), rows: [] });
    groups.get(id).rows.push(row);
  }
  return [...groups.values()].sort((a, b) => {
    for (const key of keys) {
      const x = a.condition[key], y = b.condition[key];
      const d = key === 'pressureBand' ? bandOrder(x) - bandOrder(y)
        : key === 'diluent' ? diluentOrder(x) - diluentOrder(y)
        : x < y ? -1 : x > y ? 1 : 0;
      if (d) return d;
    }
    return 0;
  });
}

/** Distinct values present in the rows, for building filter controls. */
export function conditionCatalog(rows) {
  const fuels = [...new Set(rows.map(fuelOf))].sort();
  const count = (fn, id) => rows.filter(row => fn(row) === id).length;
  return {
    fuels: fuels.map(id => ({ id, label: id, n: count(fuelOf, id) })),
    pressureBands: [...PRESSURE_BANDS.map(({ id, label, observed }) => ({ id, label, observed })),
      { id: UNKNOWN_BAND, label: 'pressure unknown', observed: 'missing value' }]
      .map(band => ({ ...band, n: count(pressureBandOf, band.id) })).filter(band => band.n > 0),
    diluents: DILUENTS.map(id => ({ id, label: diluentLabel(id), n: count(diluentOf, id) })).filter(d => d.n > 0),
    bandDefinition: 'Pressure bands: <650 mmHg (~0.7 atm), 650–1000 mmHg (~1 atm), ≥1000 mmHg (>2 atm); cut points lie in empty gaps between the reported clusters.'
  };
}
