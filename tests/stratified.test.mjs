import test from 'node:test';
import assert from 'node:assert/strict';
import { readFlexFull } from '../ms05-analysis/analysis.mjs';
import {
  pressureBandOf, diluentOf, conditionOf, normalizeFilter, filterRows, groupRows, conditionCatalog, normalizeGroupBy
} from '../ms05-analysis/strata.mjs';
import {
  mulberry32, bootstrapMeanCI, bootstrapPearsonCI, stratifiedSummary, deriveSeed, MIN_CI_N
} from '../ms05-analysis/bootstrap.mjs';
import { runAnalysis, replayAnalysis } from '../src/science/research.mjs';
import { inferFilter } from '../src/server/routes/copilot.mjs';

const row = (over = {}) => ({ id: 'X', fuel: 'Methanol', pressure_mmHg: 760, carbon_dioxide_mole_fraction: 0, helium_mole_fraction: 0, ...over });

test('pressure bands sit in the gaps between reported clusters; missing pressure is never imputed', () => {
  assert.equal(pressureBandOf(row({ pressure_mmHg: 526.3 })), '0.7atm');
  assert.equal(pressureBandOf(row({ pressure_mmHg: 649.9 })), '0.7atm');
  assert.equal(pressureBandOf(row({ pressure_mmHg: 650 })), '1atm');
  assert.equal(pressureBandOf(row({ pressure_mmHg: 774.1 })), '1atm');
  assert.equal(pressureBandOf(row({ pressure_mmHg: 1000 })), '>2atm');
  assert.equal(pressureBandOf(row({ pressure_mmHg: 2319.9 })), '>2atm');
  assert.equal(pressureBandOf(row({ pressure_mmHg: null })), 'unknown');
});

test('diluent classification covers none, CO2, He and mixed', () => {
  assert.equal(diluentOf(row()), 'none');
  assert.equal(diluentOf(row({ carbon_dioxide_mole_fraction: 0.35 })), 'CO2');
  assert.equal(diluentOf(row({ helium_mole_fraction: 0.4 })), 'He');
  assert.equal(diluentOf(row({ carbon_dioxide_mole_fraction: 0.1, helium_mole_fraction: 0.1 })), 'mixed');
  assert.deepEqual(conditionOf(row({ fuel: ' Heptane ' })), { fuel: 'Heptane', pressureBand: '1atm', diluent: 'none' });
});

test('filters are validated, canonical and case-insensitive for fuel', () => {
  assert.deepEqual(normalizeFilter(null), {});
  assert.deepEqual(normalizeFilter({ diluent: 'He', fuel: 'methanol', pressureBand: '' }), { fuel: 'methanol', diluent: 'He' });
  assert.throws(() => normalizeFilter({ planet: 'Mars' }), /Unknown filter key/);
  assert.throws(() => normalizeFilter({ pressureBand: '5atm' }), /pressureBand/);
  assert.throws(() => normalizeFilter({ diluent: 'Ar' }), /diluent/);
  assert.throws(() => normalizeFilter([]), /object/);
  const rows = [row({ id: 'a' }), row({ id: 'b', fuel: 'Heptane' }), row({ id: 'c', helium_mole_fraction: 0.4 })];
  assert.deepEqual(filterRows(rows, { fuel: 'METHANOL' }).map(r => r.id), ['a', 'c']);
  assert.deepEqual(filterRows(rows, { fuel: 'methanol', diluent: 'He' }).map(r => r.id), ['c']);
  assert.throws(() => normalizeGroupBy(['fuel', 'fuel']), /groupBy/);
  assert.deepEqual(normalizeGroupBy(['diluent', 'fuel']), ['fuel', 'diluent']);
});

test('grouping the full PSI-69 table is exhaustive, ordered and deterministic', async () => {
  const rows = await readFlexFull();
  const groups = groupRows(rows);
  assert.equal(groups.reduce((s, g) => s + g.rows.length, 0), 274);
  assert.equal(new Set(groups.map(g => JSON.stringify(g.condition))).size, groups.length);
  assert.deepEqual(groupRows(rows, ['fuel']).map(g => [g.condition.fuel, g.rows.length]), [['Heptane', 117], ['Methanol', 157]]);
  assert.deepEqual(groupRows(rows, ['diluent']).map(g => [g.condition.diluent, g.rows.length]), [['none', 101], ['CO2', 123], ['He', 50]]);
  assert.deepEqual(groupRows(rows, ['pressureBand']).map(g => [g.condition.pressureBand, g.rows.length]),
    [['0.7atm', 103], ['1atm', 161], ['>2atm', 9], ['unknown', 1]]);
  assert.deepEqual(groups.map(g => g.label), groupRows([...rows].reverse()).map(g => g.label));
  assert.equal(groups[0].label, 'Heptane · ~0.7 atm · no diluent');
  const catalog = conditionCatalog(rows);
  assert.deepEqual(catalog.fuels.map(f => f.id), ['Heptane', 'Methanol']);
  assert.equal(catalog.pressureBands.find(b => b.id === '>2atm').n, 9);
});

test('seeded bootstrap is reproducible and changes with the seed', async () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const values = (await readFlexFull()).map(r => r.burning_rate_mm_s).filter(Number.isFinite);
  const first = bootstrapMeanCI(values, { seed: 7, resamples: 500 });
  assert.deepEqual(bootstrapMeanCI(values, { seed: 7, resamples: 500 }), first);
  assert.notDeepEqual(bootstrapMeanCI(values, { seed: 8, resamples: 500 }), first);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  assert.ok(first.low < mean && mean < first.high);
  assert.ok(first.high - first.low < 0.05, 'CI for n=258 should be narrow');
  assert.throws(() => bootstrapMeanCI(values, { resamples: 10 }), /resamples/);
  assert.throws(() => bootstrapMeanCI(values, { seed: -1 }), /seed/);
  assert.notEqual(deriveSeed(69, 'Heptane'), deriveSeed(69, 'Methanol'));
});

test('CIs are refused below n = 5 for means and Pearson r', () => {
  const four = bootstrapMeanCI([1, 2, 3, 4]);
  assert.equal(four.low, null); assert.equal(four.high, null); assert.match(four.reason, /n = 4 < 5/);
  assert.notEqual(bootstrapMeanCI([1, 2, 3, 4, 5]).low, null);
  const pairs = [1, 2, 3, 4].map(x => ({ x, y: x * 2 + (x % 2) }));
  assert.equal(bootstrapPearsonCI(pairs, 'x', 'y').low, null);
  assert.equal(MIN_CI_N, 5);
});

test('bootstrap Pearson CI brackets r and is reproducible', async () => {
  const rows = await readFlexFull();
  const s = stratifiedSummary(rows, { groupBy: ['fuel'], seed: 11, resamples: 400 });
  const { r, ci95 } = s.pooled.association;
  assert.ok(ci95.low <= r && r <= ci95.high);
  assert.deepEqual(stratifiedSummary(rows, { groupBy: ['fuel'], seed: 11, resamples: 400 }), s);
  for (const g of s.groups) assert.ok(g.n >= MIN_CI_N && g.ci95.low !== null);
  const full = stratifiedSummary(rows);
  const small = full.groups.filter(g => g.n < MIN_CI_N);
  assert.ok(small.length > 0, 'PSI-69 has strata with fewer than 5 tests');
  for (const g of small) assert.equal(g.ci95.low, null);
  // A group's interval does not depend on which other groups exist.
  const methanol = stratifiedSummary(filterRows(rows, { fuel: 'Methanol' }), { groupBy: ['fuel'] }).groups[0];
  const byFuel = stratifiedSummary(rows, { groupBy: ['fuel'] }).groups.find(g => g.condition.fuel === 'Methanol');
  assert.deepEqual(methanol.ci95, byFuel.ci95);
  // ...and the filtered pooled row equals the same stratum seen as a group.
  const filtered = stratifiedSummary(filterRows(rows, { fuel: 'Methanol' }), { groupBy: [], condition: { fuel: 'Methanol' } }).pooled;
  assert.equal(filtered.label, 'Methanol'); assert.deepEqual(filtered.ci95, byFuel.ci95); assert.deepEqual(filtered.association.ci95, byFuel.association.ci95);
});

test('filtered analysis recipe carries filter, grouping and bootstrap parameters into replay', async () => {
  const rows = await readFlexFull();
  const analysis = runAnalysis(rows, { filter: { fuel: 'Heptane' }, groupBy: ['pressureBand'], seed: 3, resamples: 300 });
  assert.equal(analysis.result.n, 107); assert.equal(analysis.result.conditionLabel, 'Heptane');
  assert.deepEqual(analysis.recipe.filter, { fuel: 'Heptane' });
  assert.deepEqual(analysis.recipe.groupBy, ['pressureBand']);
  assert.equal(analysis.recipe.bootstrap.seed, 3); assert.equal(analysis.recipe.bootstrap.resamples, 300);
  assert.match(analysis.recipe.parametersSha256, /^[a-f0-9]{64}$/);
  assert.ok(analysis.result.groups.every(g => g.condition.pressureBand));
  assert.equal(replayAnalysis(rows, analysis).matches, true);
  const tamper = recipe => replayAnalysis(rows, { ...analysis, recipe: { ...analysis.recipe, ...recipe } });
  assert.equal(tamper({ bootstrap: { ...analysis.recipe.bootstrap, seed: 4 } }).matches, false);
  assert.equal(tamper({ bootstrap: { ...analysis.recipe.bootstrap, resamples: 301 } }).matches, false);
  assert.equal(tamper({ groupBy: ['fuel'] }).matches, false);
  assert.equal(tamper({ filter: { fuel: 'Heptane', diluent: 'CO2' } }).matches, false);
  assert.throws(() => tamper({ filter: { fuel: 'Methanol' } }), /no experiment records/);
  assert.notEqual(runAnalysis(rows, { seed: 1 }).recipe.resultSha256, runAnalysis(rows, { seed: 2 }).recipe.resultSha256);
  assert.throws(() => runAnalysis(rows, { filter: { fuel: 'Ethanol' } }), /no experiment records/);
});

test('Copilot infers a single named condition per kind', () => {
  assert.deepEqual(inferFilter('Mean burning rate for methanol?'), { fuel: 'Methanol' });
  assert.deepEqual(inferFilter('Compare methanol and heptane burning rate'), {});
  assert.deepEqual(inferFilter('heptane with helium at 0.7 atm'), { fuel: 'Heptane', diluent: 'He', pressureBand: '0.7atm' });
  assert.deepEqual(inferFilter('متوسط معدل الاحتراق للميثانول'), { fuel: 'Methanol' });
});
