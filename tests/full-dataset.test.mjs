import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFlex, readFlexFull, validate, summarize } from '../ms05-analysis/analysis.mjs';
import { decodePsiBytes, normalizePsi69, toCSV } from '../ms02-connectors/normalize-psi69.mjs';
import { compareExperiments } from '../src/science/research.mjs';
import { runWorkflow } from '../ms09-agents/workflow.mjs';

const file = name => new URL(`../ms02-connectors/${name}`, import.meta.url);
const sha256 = data => createHash('sha256').update(data).digest('hex');

test('normalizer reproduces the committed full table byte-for-byte from the raw NASA file', async () => {
  const raw = await readFile(file('raw/PSI-69_Experimental_table_FLEX.csv'));
  const committed = await readFile(file('flex-psi69-full.csv'), 'utf8');
  const report = JSON.parse(await readFile(file('flex-psi69-quality.json'), 'utf8'));
  assert.equal(sha256(raw), report.rawSha256);
  const { rows, corrections } = normalizePsi69(decodePsiBytes(raw));
  assert.equal(toCSV(rows), committed);
  assert.equal(sha256(committed), report.normalizedSha256);
  assert.deepEqual(corrections, report.corrections);
});

test('full table validates, keeps every test and has unique identifiers', async () => {
  const rows = await readFlexFull();
  assert.equal(rows.length, 274);
  assert.equal(validate(rows).valid, true);
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  assert.ok(rows.some(r => r.id === '193F001-T70') && rows.some(r => r.id === '193F001-T73'));
  assert.deepEqual(new Set(rows.map(r => r.fuel)), new Set(['Methanol', 'Heptane']));
});

test('first five full-table rows are exactly the original hand-transcribed extract', async () => {
  const subset = await readFlex();
  const full = (await readFlexFull()).slice(0, 5).map(({ quality_flags, ...row }) => row);
  assert.deepEqual(full, subset);
});

test('documented corrections become nulls or flagged values, never silent changes', async () => {
  const rows = await readFlexFull();
  const zeroPressure = rows.find(r => r.id === 'C11M201');
  assert.equal(zeroPressure.pressure_mmHg, null);
  assert.match(zeroPressure.quality_flags, /pressure_mmHg:non-positive-as-missing/);
  const approx = rows.find(r => r.id === 'H01M104');
  assert.equal(approx.burn_time_s, 6);
  assert.match(approx.quality_flags, /approximate-value/);
  assert.ok(rows.filter(r => r.quality_flags === null).length > 200);
});

test('full-table statistics are null-aware and use the burning-rate constant unit', async () => {
  const s = summarize(await readFlexFull()).stats.burning_rate_mm_s;
  assert.equal(s.n, 258); assert.equal(s.missing, 16); assert.equal(s.unit, 'mm²/s');
  assert.ok(Math.abs(s.mean - 0.5018992248062017) < 1e-12);
});

test('comparison refuses tests with different CO2 or helium diluent', async () => {
  const [a] = await readFlexFull();
  assert.equal(compareExperiments(a, { ...a, id: 'X', carbon_dioxide_mole_fraction: 0.2 }).status, 'unsupported');
  assert.equal(compareExperiments(a, { ...a, id: 'Y', helium_mole_fraction: 0.15 }).status, 'unsupported');
});

test('workflow recognises the bundled full table as NASA-sourced', async () => {
  const w = runWorkflow(await readFlexFull());
  assert.equal(w.status, 'reviewed');
  assert.equal(w.provenance.doi, '10.60555/mbq8-0451');
});

test('NASA provenance does not depend on row order (catalogue sorts by date)', async () => {
  const rows = await readFlexFull();
  const w = runWorkflow([...rows].reverse());
  assert.equal(w.provenance.doi, '10.60555/mbq8-0451');
});
