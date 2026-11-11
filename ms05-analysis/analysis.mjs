import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CSV = fileURLToPath(new URL('../ms02-connectors/flex-psi69.csv', import.meta.url));
const FULL_CSV = fileURLToPath(new URL('../ms02-connectors/flex-psi69-full.csv', import.meta.url));
// Identity and test conditions must be present and non-empty.
const REQUIRED = ['id', 'date', 'fuel', 'oxygen_mole_fraction', 'nitrogen_mole_fraction', 'test_end'];
// Measurements must be present as columns but may be null (not every FLEX test yielded every measurement).
const MEASURED = ['pressure_mmHg', 'initial_droplet_diameter_mm', 'burning_rate_mm_s', 'burn_time_s'];
const NUMERIC = [
  'test', 'pressure_mmHg', 'oxygen_mole_fraction', 'nitrogen_mole_fraction',
  'carbon_dioxide_mole_fraction', 'helium_mole_fraction',
  'initial_droplet_diameter_mm', 'visible_flame_extinction_diameter_mm',
  'burning_rate_mm_s', 'burn_time_s', 'latitude', 'longitude',
  'bright_ti4', 'scan', 'track', 'acq_time', 'bright_ti5', 'frp'
];
const UNITS = {
  pressure_mmHg: 'mmHg', oxygen_mole_fraction: '1',
  initial_droplet_diameter_mm: 'mm',
  visible_flame_extinction_diameter_mm: 'mm',
  burning_rate_mm_s: 'mm²/s', burn_time_s: 's'
};

// RFC 4180-compatible parser for quoted fields, escaped quotes and embedded newlines.
export function parseCSV(text, { allowEmpty = false } = {}) {
  if (typeof text !== 'string' || text.length === 0) throw new Error('CSV is empty');
  const input = text.replace(/^\uFEFF/, '');
  const matrix = [];
  let row = [], cell = '', quoted = false, closedQuote = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; closedQuote = true; }
      else cell += ch;
    } else if (closedQuote && ![',', '\n', '\r'].includes(ch)) {
      throw new Error(`Unexpected text after closing quote at character ${i + 1}`);
    } else if (ch === '"') {
      if (cell.length) throw new Error(`Unexpected quote at character ${i + 1}`);
      quoted = true;
    } else if (ch === ',') {
      row.push(cell); cell = ''; closedQuote = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); matrix.push(row); row = []; cell = ''; closedQuote = false;
    } else {
      cell += ch;
    }
  }
  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (cell.length || row.length) { row.push(cell); matrix.push(row); }
  while (matrix.length && matrix.at(-1).every(v => v === '')) matrix.pop();
  if (!matrix.length) throw new Error('CSV has no headers');

  const headers = matrix.shift().map(v => v.trim());
  if (headers.some(v => !v)) throw new Error('CSV contains an empty column name');
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column names');
  if (!matrix.length && !allowEmpty) throw new Error('CSV has no data rows');
  return matrix.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Malformed row ${index + 2}: expected ${headers.length} columns, received ${values.length}`);
    return Object.fromEntries(headers.map((key, col) => {
      const value = values[col].trim();
      if (value === '') return [key, null];
      if (NUMERIC.includes(key)) {
        const n = Number(value);
        return [key, Number.isFinite(n) ? n : value];
      }
      return [key, value];
    }));
  });
}

/** Five-row extract shown on the PSI page; kept as a small, hand-checkable fixture. */
export async function readFlex() {
  return parseCSV(await readFile(CSV, 'utf8'));
}
/** Full official PSI-69 experimental table, normalized by scripts/fetch-psi69.mjs. */
export async function readFlexFull() {
  return parseCSV(await readFile(FULL_CSV, 'utf8'));
}

export function validate(rows) {
  const errors = [], warnings = [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return { valid: false, errors: ['Dataset must contain at least one row.'], warnings, rows: 0 };
  }
  const seenIds = new Set();
  for (const [i, row] of rows.entries()) {
    const label = `Row ${i + 1}`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(`${label}: expected a record object.`);
      continue;
    }
    for (const key of REQUIRED) {
      if (!(key in row)) errors.push(`${label}: missing required field ${key}.`);
      else if (row[key] === null || (typeof row[key] === 'string' && !row[key].trim())) errors.push(`${label}: required field ${key} is empty.`);
    }
    for (const key of MEASURED) if (!(key in row)) errors.push(`${label}: missing measurement column ${key}.`);
    for (const key of ['id', 'date', 'fuel', 'test_end']) {
      if (key in row && typeof row[key] !== 'string') errors.push(`${label}: ${key} must be text.`);
    }
    if (typeof row.id === 'string') {
      if (seenIds.has(row.id)) errors.push(`${label}: duplicate experiment id ${row.id}.`);
      seenIds.add(row.id);
    }
    for (const key of NUMERIC) {
      if (!(key in row) || row[key] === null || row[key] === '') continue;
      if (typeof row[key] !== 'number' || !Number.isFinite(row[key])) {
        errors.push(`${label}: ${key} must be a finite number or null.`);
      } else if (row[key] < 0) {
        errors.push(`${label}: ${key} cannot be negative.`);
      }
    }
    for (const key of ['oxygen_mole_fraction', 'nitrogen_mole_fraction', 'carbon_dioxide_mole_fraction', 'helium_mole_fraction']) {
      if (typeof row[key] === 'number' && (row[key] < 0 || row[key] > 1)) errors.push(`${label}: ${key} must be between 0 and 1.`);
    }
    for (const key of ['pressure_mmHg', 'initial_droplet_diameter_mm', 'burning_rate_mm_s', 'burn_time_s']) {
      if (typeof row[key] === 'number' && row[key] <= 0) errors.push(`${label}: ${key} must be greater than zero.`);
    }
    const gas = ['oxygen_mole_fraction', 'nitrogen_mole_fraction', 'carbon_dioxide_mole_fraction', 'helium_mole_fraction'].map(k => row[k]);
    if (gas.every(Number.isFinite) && Math.abs(gas.reduce((a, b) => a + b, 0) - 1) > 0.02) {
      warnings.push(`${label}: reported gas fractions sum to ${gas.reduce((a, b) => a + b, 0).toFixed(3)}, outside the 0.02 tolerance.`);
    }
    if (typeof row.date === 'string') {
      const parsedDate = new Date(`${row.date}T00:00:00Z`);
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(row.date) && !Number.isNaN(parsedDate.valueOf()) && parsedDate.toISOString().slice(0, 10) === row.date;
      if (!validDate) errors.push(`${label}: date must be a real ISO YYYY-MM-DD date.`);
    }
  }
  return { valid: errors.length === 0, errors, warnings, rows: rows.length };
}

export function summarize(rows) {
  const cols = Object.keys(UNITS);
  const stats = Object.fromEntries(cols.map(key => {
    const values = rows.map(row => row?.[key]).filter(Number.isFinite);
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const sd = values.length > 1
      ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1))
      : null;
    return [key, {
      n: values.length, missing: rows.length - values.length, mean, sd,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      unit: UNITS[key]
    }];
  }));
  const outcomes = Object.create(null);
  for (const row of rows) if (typeof row?.test_end === 'string') outcomes[row.test_end] = (outcomes[row.test_end] || 0) + 1;
  return {
    evidence: 'COMPUTED',
    method: 'Arithmetic mean; sample standard deviation (n−1); missing values excluded per variable.',
    records: rows.length,
    stats,
    outcomes
  };
}

export function pearson(rows, a, b) {
  const pairs = rows.filter(row => Number.isFinite(row?.[a]) && Number.isFinite(row?.[b]));
  if (pairs.length < 3) return { n: pairs.length, r: null, reason: 'At least 3 paired values are required.' };
  const x = pairs.map(row => row[a]), y = pairs.map(row => row[b]);
  const mx = x.reduce((s, v) => s + v, 0) / pairs.length;
  const my = y.reduce((s, v) => s + v, 0) / pairs.length;
  const numerator = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0);
  const dx = x.reduce((s, v) => s + (v - mx) ** 2, 0);
  const dy = y.reduce((s, v) => s + (v - my) ** 2, 0);
  return {
    n: pairs.length,
    r: dx && dy ? numerator / Math.sqrt(dx * dy) : null,
    warning: 'Exploratory association only; this small subset is not suitable for causal or population-level claims.'
  };
}
