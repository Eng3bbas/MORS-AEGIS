import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('isolated backend contract and defensive boundaries', { timeout: 20000 }, async t => {
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
  const post = (body, type = 'application/json') => fetch(`${base}/api/workflow`, { method: 'POST', headers: { 'content-type': type }, body });
  await t.test('health reports booleans, security headers and no configured credentials', async () => {
    const r = await fetch(`${base}/api/health`), j = await r.json();
    assert.equal(r.status, 200); assert.ok(r.headers.get('content-security-policy').includes("script-src 'self'"));
    assert.ok(Object.values(j.credentials).every(v => v === false));
  });
  await t.test('JSON primitive, null, array and malformed input rejected', async () => {
    for (const input of ['null', '1', '[]', '"text"', '{broken']) assert.equal((await post(input)).status, 400);
    assert.equal((await post('{}', 'application/json-evil')).status, 415);
    assert.equal((await post(JSON.stringify({ rows: [] }))).status, 400);
  });
  await t.test('oversized input is rejected before processing', async () => {
    assert.equal((await post(JSON.stringify({ data: 'x'.repeat(310000) }))).status, 413);
  });
  await t.test('cross-origin and Host spoofing are refused', async () => {
    for (const headers of [{ origin: 'https://evil.example' }, { origin: `https://127.0.0.1:${port}` }, { host: 'evil.example' }, { 'sec-fetch-site': 'cross-site' }]) {
      const status = await new Promise((resolve, reject) => {
        http.get(`${base}/api/health`, { headers }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
      });
      assert.equal(status, 403, JSON.stringify(headers));
    }
  });
  await t.test('missing assets return 404 and traversal is forbidden', async () => {
    assert.equal((await fetch(`${base}/missing-test-file.js`)).status, 404);
    assert.equal((await fetch(`${base}/%2e%2e%2fserver.mjs`)).status, 403);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
  });
  await t.test('valid workflow and invalid scientific record remain distinct', async () => {
    const good = await (await post('{}')).json(); assert.equal(good.status, 'reviewed');
    const bad = await (await post('{"rows":[null]}')).json(); assert.equal(bad.status, 'rejected'); assert.equal(bad.statistics, null);
  });
  await t.test('Copilot has honest deterministic fallback without credentials', async () => {
    const r = await fetch(`${base}/api/copilot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"question":"Mean burning rate?"}' });
    const j = await r.json(); assert.equal(j.status, 'offline-fallback'); assert.match(j.answer, /0\.556/); assert.match(j.citation, /psi\.nasa\.gov/);
    const record = await (await fetch(`${base}/api/copilot`, { method:'POST', headers:{'content-type':'application/json'}, body:'{"question":"What was the pressure in 20CAL08?"}' })).json();
    assert.equal(record.toolsExecuted[0].tool,'lookupExperiment'); assert.match(record.answer,/20CAL08/); assert.equal(record.analysis,null);
    const unrelated = await (await fetch(`${base}/api/copilot`, { method:'POST', headers:{'content-type':'application/json'}, body:'{"question":"What is the capital of France?"}' })).json();
    assert.equal(unrelated.status,'unsupported'); assert.equal(unrelated.toolsExecuted.length,0);
  });
  await t.test('API replay detects altered saved result and dataset version', async () => {
    const submit = body => fetch(`${base}/api/research/replay`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({saved:body})});
    const analysis=await (await fetch(`${base}/api/research/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json();
    assert.equal((await (await submit(analysis)).json()).matches,true);
    assert.equal((await (await submit({...analysis,result:{...analysis.result,mean:999}})).json()).matches,false);
    assert.equal((await (await submit({...analysis,recipe:{...analysis.recipe,datasetVersion:'fake-version'}})).json()).versionMatches,false);
  });
  await t.test('FIRMS rejects global area before contacting provider', async () => {
    assert.equal((await fetch(`${base}/api/firms?bbox=-180,-80,180,80`)).status, 400);
  });
});
