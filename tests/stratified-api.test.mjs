import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('condition-filtered analysis and Copilot endpoints', { timeout: 30000 }, async t => {
  const reserve = net.createServer();
  reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', MORS_DISABLE_CREDENTIALS: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server exited before ready'); })]);
  const base = `http://127.0.0.1:${port}`;
  const postJson = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ask = async (question, extra = {}) => (await postJson('/api/copilot', { question, ...extra })).json();

  await t.test('analyze accepts a filter and returns per-group n with CIs', async () => {
    const r = await postJson('/api/research/analyze', { filter: { fuel: 'Methanol', diluent: 'He' } });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.result.n, 26);
    assert.deepEqual(j.recipe.filter, { fuel: 'Methanol', diluent: 'He' });
    assert.ok(j.result.ci95.low < j.result.mean && j.result.mean < j.result.ci95.high);
    assert.deepEqual(j.result.groups.map(g => [g.condition.pressureBand, g.n]), [['0.7atm', 14], ['1atm', 12]]);
    const replay = await (await postJson('/api/research/replay', { saved: j })).json();
    assert.equal(replay.matches, true); assert.equal(replay.parametersMatch, true);
    const same = await (await postJson('/api/research/analyze', { filter: { fuel: 'Methanol', diluent: 'He' } })).json();
    assert.deepEqual(same.result, j.result);
  });

  await t.test('analyze refuses CIs for groups with n < 5 and rejects bad filters', async () => {
    const j = await (await postJson('/api/research/analyze', { filter: { pressureBand: '>2atm' } })).json();
    assert.equal(j.result.n, 5); assert.equal(j.input.length, 9);
    for (const g of j.result.groups) assert.equal(g.ci95.low === null, g.n < 5, g.label);
    assert.equal((await postJson('/api/research/analyze', { filter: { diluent: 'Argon' } })).status, 400);
    assert.equal((await postJson('/api/research/analyze', { filter: { fuel: 'Ethanol' } })).status, 400);
    assert.equal((await postJson('/api/research/analyze', { resamples: 1e9 })).status, 400);
  });

  await t.test('GET /api/analysis filters by query and lists available conditions', async () => {
    const pooled = await (await fetch(`${base}/api/analysis`)).json();
    assert.equal(pooled.records, 274); assert.equal(pooled.strata.groups.reduce((s, g) => s + g.records, 0), 274);
    assert.deepEqual(pooled.conditions.fuels.map(f => f.id), ['Heptane', 'Methanol']);
    const heptane = await (await fetch(`${base}/api/analysis?fuel=Heptane&pressureBand=1atm`)).json();
    assert.equal(heptane.records, 76); assert.equal(heptane.summary.stats.burning_rate_mm_s.n, 69); assert.equal(heptane.conditionLabel, 'Heptane · ~1 atm');
    assert.ok(heptane.strata.groups.every(g => g.condition.fuel === 'Heptane'));
    assert.equal((await fetch(`${base}/api/analysis?pressureBand=9atm`)).status, 400);
  });

  await t.test('Copilot uses the named fuel stratum instead of the pooled mean', async () => {
    const pooled = await ask('Mean burning rate?');
    assert.match(pooled.answer, /0\.502/); assert.match(pooled.answer, /All tests pooled/);
    assert.match(pooled.answer, /Heptane: 0\.545 mm²\/s, 95% CI/); assert.match(pooled.answer, /n=107/);
    const methanol = await ask('What is the mean burning rate for methanol?');
    assert.match(methanol.answer, /Stratum: Methanol/); assert.match(methanol.answer, /0\.472/); assert.match(methanol.answer, /n=151/);
    assert.doesNotMatch(methanol.answer, /0\.502/);
    assert.deepEqual(methanol.filter, { fuel: 'Methanol' });
    assert.deepEqual(methanol.analysis.recipe.filter, { fuel: 'Methanol' });
    assert.equal(methanol.toolsExecuted[0].tool, 'filterRows'); assert.equal(methanol.toolsExecuted[0].n, 157);
    const explicit = await ask('Mean burning rate?', { filter: { fuel: 'Heptane', pressureBand: '>2atm' } });
    assert.match(explicit.answer, /n=1, no CI \(n < 5\)/);
    assert.equal(explicit.analysis.result.ci95.low, null);
  });

  await t.test('Copilot association, empty strata and invalid filters', async () => {
    const assoc = await ask('Is droplet diameter correlated with burning rate in helium?');
    assert.match(assoc.answer, /Stratum: He diluent/); assert.match(assoc.answer, /n=47, 95% CI/);
    const empty = await ask('Mean burning rate for heptane with no diluent at high pressure?');
    assert.equal(empty.status, 'unsupported'); assert.match(empty.answer, /No bundled test matches/);
    assert.equal((await postJson('/api/copilot', { question: 'Mean burning rate?', filter: { fuel: 3 } })).status, 400);
  });
});
