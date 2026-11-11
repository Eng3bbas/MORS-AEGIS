// Normalizes the official NASA PSI-69 "Experimental table" CSV into the MORS schema.
// Every change to a source value is recorded in `corrections`; nothing is fixed silently.
import { parseCSV } from '../ms05-analysis/analysis.mjs';

// Source header -> MORS column. The PSI export flattens chemical subscripts
// ("O" = O2, "N" = N2, "CO" = CO2, the FLEX suppressant), and reports the d²-law
// burning-rate constant (mm²/s) under the header "Burning rate; mm".
export const COLUMN_MAP = Object.freeze({
  'FLEX Test #': 'test',
  'FLEX Identifier': 'id',
  'Test Date': 'date',
  'Test GMT': 'time_utc',
  'Fuel': 'fuel',
  'Ambient pressure; mmHg': 'pressure_mmHg',
  'O initial ambient composition; mole fraction': 'oxygen_mole_fraction',
  'N initial ambient composition; mole fraction': 'nitrogen_mole_fraction',
  'CO initial ambient composition; mole fraction': 'carbon_dioxide_mole_fraction',
  'He initial ambient composition; mole fraction': 'helium_mole_fraction',
  'Droplet initial diameter; mm': 'initial_droplet_diameter_mm',
  'Visible flame extinction diameter; mm': 'visible_flame_extinction_diameter_mm',
  'Burning rate; mm': 'burning_rate_mm_s',
  'Burn time; s': 'burn_time_s',
  'Test end': 'test_end'
});
export const OUTPUT_COLUMNS = Object.freeze(Object.values(COLUMN_MAP).concat('quality_flags'));
const NUMERIC = new Set(['test', 'pressure_mmHg', 'oxygen_mole_fraction', 'nitrogen_mole_fraction',
  'carbon_dioxide_mole_fraction', 'helium_mole_fraction', 'initial_droplet_diameter_mm',
  'visible_flame_extinction_diameter_mm', 'burning_rate_mm_s', 'burn_time_s']);
const MUST_BE_POSITIVE = new Set(['pressure_mmHg', 'initial_droplet_diameter_mm', 'burning_rate_mm_s', 'burn_time_s']);
const PLACEHOLDERS = new Set(['–', '—', '-', 'n/a', 'na']);

// Windows-1252 code points for bytes 0x80–0x9F (undefined bytes map to themselves).
// Decoded explicitly because some Node versions treat 'windows-1252' as Latin-1,
// which turns the en-dash placeholder (0x96) into a control character.
const CP1252_HIGH = [0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F,
  0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178];

/** Decode the PSI export: it is Windows-1252 (en-dash placeholders), not UTF-8. */
export function decodePsiBytes(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return String.fromCodePoint(...Array.from(buffer, byte => byte >= 0x80 && byte <= 0x9F ? CP1252_HIGH[byte - 0x80] : byte)); }
}

function isoDate(text) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (!match) return null;
  const [, m, d, y] = match;
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  const iso = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

export function normalizePsi69(text) {
  const source = parseCSV(text);
  const headers = Object.keys(source[0] || {});
  const missing = Object.keys(COLUMN_MAP).filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`PSI-69 schema changed; missing columns: ${missing.join(', ')}`);
  const corrections = [];
  const note = (row, field, from, to, reason) => {
    row.quality_flags.push(`${field}:${reason}`);
    corrections.push({ test: row.test, id: row.id, field, from, to, reason });
  };
  const rows = source.map(raw => {
    const row = { quality_flags: [] };
    for (const [header, key] of Object.entries(COLUMN_MAP)) {
      const value = raw[header];
      row[key] = typeof value === 'string' ? value.trim() : value;
    }
    for (const key of NUMERIC) {
      const value = row[key];
      if (value === null || typeof value === 'number') continue;
      if (/^-?\d+(?:\.\d+)?$/.test(value)) { row[key] = Number(value); continue; }
      if (PLACEHOLDERS.has(value.toLowerCase())) { note(row, key, value, null, 'placeholder-as-missing'); row[key] = null; continue; }
      const approx = /^~\s*(\d+(?:\.\d+)?)$/.exec(value);
      if (approx) { note(row, key, value, Number(approx[1]), 'approximate-value'); row[key] = Number(approx[1]); continue; }
      note(row, key, value, null, 'unparseable-as-missing'); row[key] = null;
    }
    for (const key of MUST_BE_POSITIVE) {
      if (typeof row[key] === 'number' && row[key] <= 0) { note(row, key, row[key], null, 'non-positive-as-missing'); row[key] = null; }
    }
    const date = isoDate(String(row.date ?? ''));
    if (!date) throw new Error(`Test ${row.test}: unrecognized date ${row.date}`);
    if (date !== row.date) row.date = date; // format-only change, not a value correction
    return row;
  });
  const seen = new Map();
  for (const row of rows) seen.set(row.id, (seen.get(row.id) || 0) + 1);
  for (const row of rows) if (seen.get(row.id) > 1) {
    const unique = `${row.id}-T${row.test}`;
    note(row, 'id', row.id, unique, 'duplicate-identifier-disambiguated');
    row.id = unique;
  }
  for (const row of rows) row.quality_flags = row.quality_flags.join(';') || null;
  return { rows, corrections };
}

const cell = value => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export function toCSV(rows) {
  return [OUTPUT_COLUMNS.join(','), ...rows.map(row => OUTPUT_COLUMNS.map(key => cell(row[key])).join(','))].join('\n') + '\n';
}
