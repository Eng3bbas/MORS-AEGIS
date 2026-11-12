import test from 'node:test';
import assert from 'node:assert/strict';
import { readFlexFull } from '../ms05-analysis/analysis.mjs';
import {
  classifyOutcome, loiBracket, flammabilityMap, normalizeOptions, OUTCOME_INTERPRETATION, ASSUMPTIONS, LIMITATIONS
} from '../ms05-analysis/flammability.mjs';

const pt = (oxygen, reading) => ({ oxygen, reading });
const row = (o2, end, over = {}) => ({
  id: `T${o2}${end}`, fuel: 'Methanol', pressure_mmHg: 760, oxygen_mole_fraction: o2,
  carbon_dioxide_mole_fraction: 0, helium_mole_fraction: 0, test_end: end, ...over
});

test('outcome interpretation is explicit: Completion sustained, Extinction not, Disruption excluded', () => {
  assert.equal(classifyOutcome('Completion'), 'sustained');
  assert.equal(classifyOutcome('Extinction'), 'not-sustained');
  assert.equal(classifyOutcome('Disruption'), 'excluded');
  assert.equal(classifyOutcome(' Completion '), 'sustained');
  assert.equal(classifyOutcome(null), 'excluded');
  assert.equal(classifyOutcome('Ignition failure'), 'excluded');
  assert.deepEqual(Object.keys(OUTCOME_INTERPRETATION), ['Completion', 'Extinction', 'Disruption']);
  assert.ok(ASSUMPTIONS.some(a => /Disruption is excluded/.test(a)));
  assert.ok(LIMITATIONS.some(l => /instrument uncertainty/.test(l)));
  assert.ok(LIMITATIONS.some(l => /fiber-supported/.test(l) && /drift/.test(l)));
});

test('disruptionAs re-reads Disruption for a sensitivity check and is validated', () => {
  assert.equal(classifyOutcome('Disruption', { disruptionAs: 'sustained' }), 'sustained');
  assert.equal(classifyOutcome('Disruption', { disruptionAs: 'not-sustained' }), 'not-sustained');
  assert.equal(classifyOutcome('Extinction', { disruptionAs: 'sustained' }), 'not-sustained');
  assert.throws(() => normalizeOptions({ disruptionAs: 'maybe' }), /disruptionAs/);
  assert.throws(() => normalizeOptions([]), /object/);
  assert.deepEqual(normalizeOptions(), { disruptionAs: 'excluded' });
});

test('a clean separation is bracketed by two observed O2 fractions, never a single value', () => {
  const b = loiBracket([pt(0.15, 'not-sustained'), pt(0.18, 'not-sustained'), pt(0.21, 'sustained'), pt(0.3, 'sustained'), pt(0.25, 'excluded')]);
  assert.equal(b.status, 'bracketed');
  assert.equal(b.evidence, 'INFERRED');
  assert.deepEqual(b.interval, { lower: 0.18, upper: 0.21 });
  assert.equal(b.overlap, null);
  assert.equal(b.decided, 4);
  assert.ok(!('loi' in b) && !('estimate' in b), 'no interpolated LOI value is reported');
  assert.match(b.reason, /No value inside the interval is estimated/);
});

test('overlapping outcomes are reported as overlap, not as a bracket', () => {
  const b = loiBracket([pt(0.15, 'not-sustained'), pt(0.18, 'sustained'), pt(0.21, 'not-sustained')]);
  assert.equal(b.status, 'overlapping');
  assert.equal(b.interval, null);
  assert.deepEqual(b.overlap, { from: 0.18, to: 0.21 });
  // Same O2 with both outcomes also overlaps.
  const same = loiBracket([pt(0.2, 'sustained'), pt(0.2, 'not-sustained')]);
  assert.equal(same.status, 'overlapping'); assert.match(same.reason, /^Outcomes overlap at O₂ 0\.2:/);
  assert.match(b.reason, /between O₂ 0\.18 and 0\.21/);
});

test('one-sided or empty data are not bracketed', () => {
  const onlyExt = loiBracket([pt(0.15, 'not-sustained'), pt(0.21, 'not-sustained')]);
  assert.equal(onlyExt.status, 'not bracketed'); assert.equal(onlyExt.highestNotSustained, 0.21); assert.equal(onlyExt.interval, null);
  const onlySus = loiBracket([pt(0.21, 'sustained'), pt(0.3, 'sustained')]);
  assert.equal(onlySus.status, 'not bracketed'); assert.equal(onlySus.lowestSustained, 0.21); assert.match(onlySus.reason, /at most 0\.21/);
  const none = loiBracket([pt(0.21, 'excluded'), pt(null, 'sustained')]);
  assert.equal(none.status, 'not bracketed'); assert.equal(none.decided, 0);
});

test('Disruption changes the bracket only when the sensitivity option says so', () => {
  const rows = [row(0.15, 'Extinction'), row(0.25, 'Disruption'), row(0.3, 'Completion')];
  assert.deepEqual(flammabilityMap(rows).groups[0].bracket.interval, { lower: 0.15, upper: 0.3 });
  assert.deepEqual(flammabilityMap(rows, { disruptionAs: 'sustained' }).groups[0].bracket.interval, { lower: 0.15, upper: 0.25 });
  assert.deepEqual(flammabilityMap(rows, { disruptionAs: 'not-sustained' }).groups[0].bracket.interval, { lower: 0.25, upper: 0.3 });
});

test('map groups by fuel, pressure band and diluent and lists points by O2', () => {
  const map = flammabilityMap([
    row(0.21, 'Completion'), row(0.15, 'Extinction'), row(0.18, 'Extinction', { pressure_mmHg: 535 }),
    row(0.2, 'Extinction', { helium_mole_fraction: 0.4 }), row(null, 'Extinction')
  ]);
  assert.deepEqual(map.groups.map(g => g.label), ['Methanol · ~0.7 atm · no diluent', 'Methanol · ~1 atm · no diluent', 'Methanol · ~1 atm · He diluent']);
  const oneAtm = map.groups[1];
  assert.deepEqual(oneAtm.points.map(p => p.oxygen), [0.15, 0.21, null]);
  assert.ok(oneAtm.points.every(p => p.evidence === 'OBSERVED'));
  assert.equal(oneAtm.missingOxygen, 1);
  assert.deepEqual(oneAtm.levels.map(l => [l.oxygen, l.sustained, l.notSustained]), [[0.15, 0, 1], [0.21, 1, 0]]);
  assert.deepEqual(oneAtm.pressureRange, { min: 760, max: 760 });
  assert.equal(map.groups[2].points[0].helium, 0.4);
});

test('bundled PSI-69 table: every test is mapped and brackets follow the stated rules', async () => {
  const rows = await readFlexFull();
  const map = flammabilityMap(rows);
  assert.equal(map.records, 274);
  assert.equal(map.groups.reduce((s, g) => s + g.n, 0), 274);
  const counts = Object.fromEntries(['bracketed', 'overlapping', 'not bracketed'].map(s => [s, map.groups.filter(g => g.bracket.status === s).length]));
  assert.deepEqual(counts, { bracketed: 1, overlapping: 8, 'not bracketed': 6 });
  const bracketed = map.groups.find(g => g.bracket.status === 'bracketed');
  assert.equal(bracketed.label, 'Methanol · ~0.7 atm · no diluent');
  assert.deepEqual(bracketed.bracket.interval, { lower: 0.2, upper: 0.3 });
  for (const g of map.groups) {
    const { bracket: b } = g;
    if (b.status === 'bracketed') assert.ok(b.highestNotSustained < b.lowestSustained, g.label);
    if (b.status === 'overlapping') assert.ok(b.highestNotSustained >= b.lowestSustained, g.label);
    if (b.status === 'not bracketed') assert.ok(b.sustained === 0 || b.notSustained === 0, g.label);
  }
  // Methanol · ~1 atm · He: 14 tests, all Extinction → not bracketed rather than an invented LOI.
  const methHe = map.groups.find(g => g.label === 'Methanol · ~1 atm · He diluent');
  assert.equal(methHe.n, 14); assert.equal(methHe.bracket.status, 'not bracketed'); assert.equal(methHe.bracket.highestNotSustained, 0.2);
});
