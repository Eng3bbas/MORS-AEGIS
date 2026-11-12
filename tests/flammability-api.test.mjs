import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('GET /api/flammability', { timeout: 30000 }, async t => {
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

  await t.test('returns every test as an OBSERVED point and brackets as INFERRED', async () => {
    const r = await fetch(`${base}/api/flammability`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(j.evidence, { points: 'OBSERVED', brackets: 'INFERRED' });
    assert.equal(j.records, 274);
    assert.equal(j.groups.reduce((s, g) => s + g.points.length, 0), 274);
    assert.ok(j.groups.every(g => g.bracket.evidence === 'INFERRED' && g.points.every(p => p.evidence === 'OBSERVED')));
    assert.equal(j.options.disruptionAs, 'excluded');
    assert.ok(j.assumptions.length >= 3 && j.limitations.length >= 3);
    assert.equal(j.interpretation.Disruption.reading, 'excluded');
    assert.match(j.definition, /no LOI value is interpolated/);
  });

  await t.test('filters by condition and supports the Disruption sensitivity option', async () => {
    const j = await (await fetch(`${base}/api/flammability?fuel=Methanol&pressureBand=0.7atm&diluent=none`)).json();
    assert.equal(j.groups.length, 1); assert.equal(j.groups[0].n, 12);
    assert.deepEqual(j.groups[0].bracket.interval, { lower: 0.2, upper: 0.3 });
    assert.equal(j.conditionLabel, 'Methanol · ~0.7 atm · no diluent');
    const s = await (await fetch(`${base}/api/flammability?fuel=Methanol&pressureBand=0.7atm&diluent=none&disruption=sustained`)).json();
    assert.equal(s.options.disruptionAs, 'sustained');
    assert.equal(s.groups[0].bracket.status, 'overlapping'); // a Disruption at O2 0.2 now counts as sustained
  });

  await t.test('rejects invalid parameters', async () => {
    assert.equal((await fetch(`${base}/api/flammability?disruption=maybe`)).status, 400);
    assert.equal((await fetch(`${base}/api/flammability?diluent=Argon`)).status, 400);
    assert.equal((await fetch(`${base}/api/flammability`, { method: 'POST' })).status, 405);
  });
});
