import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const cwd=fileURLToPath(new URL('../',import.meta.url));
test('network binding refuses to start without an access token',()=>{
  const attempt=spawnSync(process.execPath,['server.mjs'],{cwd,env:{...process.env,HOST:'0.0.0.0',MORS_ALLOW_NETWORK_BIND:'1',MORS_ACCESS_TOKEN:'',MORS_DISABLE_CREDENTIALS:'1'},encoding:'utf8',timeout:3000});
  assert.notEqual(attempt.status,0);
  assert.match(attempt.stderr,/MORS_ACCESS_TOKEN/);
});
test('network mode requires a session before static or API access', {timeout:20000}, async t=>{
  const reserve=net.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const token='test-only-random-access-token-1234567890';
  const child=spawn(process.execPath,['server.mjs'],{cwd,env:{...process.env,HOST:'0.0.0.0',PORT:String(port),MORS_ALLOW_NETWORK_BIND:'1',MORS_ACCESS_TOKEN:token,MORS_DISABLE_CREDENTIALS:'1'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Server exited before ready')})]);
  const base=`http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/api/health`)).status,401);
  assert.equal((await fetch(`${base}/`)).status,401);
  const bad=await fetch(`${base}/api/auth`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'token=wrong',redirect:'manual'});
  assert.equal(bad.status,401);
  const login=await fetch(`${base}/api/auth`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}),redirect:'manual'});
  assert.equal(login.status,303);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  assert.equal((await fetch(`${base}/api/health`,{headers:{cookie}})).status,200);
  assert.equal((await fetch(`${base}/`,{headers:{cookie}})).status,200);
  assert.equal((await fetch(`${base}/api/copilot`,{method:'POST',headers:{'content-type':'application/json'},body:'{"question":"Mean burning rate?"}'})).status,401);
});
