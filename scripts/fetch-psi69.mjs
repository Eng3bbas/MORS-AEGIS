// Downloads the official NASA PSI-69 (FLEX) experimental table and regenerates the bundled,
// normalized dataset plus a quality report.
//   node scripts/fetch-psi69.mjs            download, verify, normalize, write
//   node scripts/fetch-psi69.mjs --offline  re-normalize the committed raw file only
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { decodePsiBytes, normalizePsi69, toCSV } from '../ms02-connectors/normalize-psi69.mjs';

const FILE = 'PSI-69_Experimental table_FLEX.csv';
const API = `https://psi.nasa.gov/geode-py/ws/studies/PSI-69/download?file=${encodeURIComponent(FILE)}&version=1&redirect=false`;
const out = name => fileURLToPath(new URL(`../ms02-connectors/${name}`, import.meta.url));
const RAW = out('raw/PSI-69_Experimental_table_FLEX.csv');
const sha256 = data => createHash('sha256').update(data).digest('hex');

async function download() {
  // The PSI API answers with a short-lived signed S3 URL as plain text.
  const pointer = await fetch(API, { signal: AbortSignal.timeout(30_000) });
  if (!pointer.ok) throw new Error(`PSI API returned HTTP ${pointer.status}`);
  const signed = (await pointer.text()).trim();
  const url = new URL(signed);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.amazonaws.com')) throw new Error('Unexpected download location from PSI API.');
  const file = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!file.ok) throw new Error(`Download returned HTTP ${file.status}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > 5_000_000) throw new Error('Downloaded table is unexpectedly large.');
  return bytes;
}

const offline = process.argv.includes('--offline');
const bytes = offline ? await readFile(RAW) : await download();
const { rows, corrections } = normalizePsi69(decodePsiBytes(bytes));
const csv = toCSV(rows);
await mkdir(out('raw'), { recursive: true });
if (!offline) await writeFile(RAW, bytes);
await writeFile(out('flex-psi69-full.csv'), csv);
const report = {
  dataset: 'PSI-69', title: 'Flame Extinguishment Experiment (FLEX) — experimental table',
  doi: '10.60555/mbq8-0451', license: 'CC0-1.0', source: API.replace(/&redirect=false$/, ''),
  retrievedAt: offline ? null : new Date().toISOString(),
  rawSha256: sha256(bytes), normalizedSha256: sha256(csv), records: rows.length,
  interpretation: [
    'Source gas columns "O", "N", "CO", "He" are read as O2, N2, CO2 and He mole fractions (subscripts flattened in the export).',
    'Source "Burning rate; mm" is the d²-law burning-rate constant and is reported here in mm²/s.',
    'Dates are converted from M/D/YY or M/D/YYYY to ISO 8601; this is a format change only.'
  ],
  corrections
};
await writeFile(out('flex-psi69-quality.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`PSI-69: ${rows.length} records, ${corrections.length} documented corrections, raw sha256 ${report.rawSha256.slice(0, 12)}…`);
