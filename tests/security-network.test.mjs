import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const cwd=fileURLToPath(new URL('../',import.meta.url));
const token='test-only-random-access-token-1234567890';
const form={'content-type':'application/x-www-form-urlencoded'};

// Starts a LAN-mode server on a free port and returns its base URL on a private interface.
async function startLanServer(t,extraEnv={}){
  const reserve=net.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const child=spawn(process.execPath,['server.mjs'],{cwd,env:{...process.env,HOST:'0.0.0.0',PORT:String(port),MORS_ALLOW_NETWORK_BIND:'1',MORS_ACCESS_TOKEN:token,MORS_DISABLE_CREDENTIALS:'1',...extraEnv},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Server exited before ready')})]);
  const lanAddress=Object.values(os.networkInterfaces()).flat().find(item=>item?.family==='IPv4'&&!item.internal)?.address;
  assert.ok(lanAddress,'A private IPv4 interface is required for the LAN authentication test.');
  return `http://${lanAddress}:${port}`;
}
async function login(base){
  const response=await fetch(`${base}/api/auth`,{method:'POST',headers:form,body:new URLSearchParams({token}),redirect:'manual'});
  assert.equal(response.status,303);
  return {response,cookie:response.headers.get('set-cookie').split(';')[0]};
}
const health=(base,cookie)=>fetch(`${base}/api/health`,cookie?{headers:{cookie}}:{}).then(response=>response.status);

test('network binding refuses to start without an access token',()=>{
  const attempt=spawnSync(process.execPath,['server.mjs'],{cwd,env:{...process.env,HOST:'0.0.0.0',MORS_ALLOW_NETWORK_BIND:'1',MORS_ACCESS_TOKEN:'',MORS_DISABLE_CREDENTIALS:'1'},encoding:'utf8',timeout:3000});
  assert.notEqual(attempt.status,0);
  assert.match(attempt.stderr,/MORS_ACCESS_TOKEN/);
});
test('network mode requires a session before static or API access', {timeout:20000}, async t=>{
  const base=await startLanServer(t);
  assert.equal(await health(base),401);
  assert.equal((await fetch(`${base}/`)).status,401);
  const bad=await fetch(`${base}/api/auth`,{method:'POST',headers:form,body:'token=wrong',redirect:'manual'});
  assert.equal(bad.status,401);
  const {response,cookie}=await login(base);
  assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  assert.equal(await health(base,cookie),200);
  assert.equal((await fetch(`${base}/`,{headers:{cookie}})).status,200);
  assert.equal(await health(base,'mors_session=' + '0'.repeat(64)),401);
  assert.equal((await fetch(`${base}/api/copilot`,{method:'POST',headers:{'content-type':'application/json'},body:'{"question":"Mean burning rate?"}'})).status,401);
});
test('each login gets its own session token and logout revokes only that one', {timeout:20000}, async t=>{
  const base=await startLanServer(t);
  const first=await login(base);
  const second=await login(base);
  assert.notEqual(first.cookie,second.cookie);
  assert.equal((await fetch(`${base}/api/logout`)).status,405);
  const out=await fetch(`${base}/api/logout`,{method:'POST',headers:{cookie:first.cookie}});
  assert.equal(out.status,204);
  assert.match(out.headers.get('set-cookie'),/^mors_session=; Max-Age=0; HttpOnly; SameSite=Strict/);
  assert.equal(await health(base,first.cookie),401);
  assert.equal(await health(base,second.cookie),200);
  assert.equal((await fetch(`${base}/api/logout`,{method:'POST'})).status,204);
});
test('sessions expire after the idle timeout', {timeout:20000}, async t=>{
  const base=await startLanServer(t,{MORS_SESSION_IDLE_SECONDS:'1'});
  const {cookie}=await login(base);
  assert.equal(await health(base,cookie),200);
  await delay(1500);
  assert.equal(await health(base,cookie),401);
});
test('the oldest session is dropped when the session cap is reached', {timeout:20000}, async t=>{
  const base=await startLanServer(t,{MORS_SESSION_MAX:'2'});
  const first=await login(base);
  const second=await login(base);
  assert.equal(await health(base,first.cookie),200); // first is now the most recently used
  const third=await login(base);
  assert.equal(await health(base,second.cookie),401);
  assert.equal(await health(base,first.cookie),200);
  assert.equal(await health(base,third.cookie),200);
});
test('invalid session settings stop the server at startup',()=>{
  const attempt=spawnSync(process.execPath,['server.mjs'],{cwd,env:{...process.env,HOST:'0.0.0.0',MORS_ALLOW_NETWORK_BIND:'1',MORS_ACCESS_TOKEN:token,MORS_DISABLE_CREDENTIALS:'1',MORS_SESSION_IDLE_SECONDS:'0'},encoding:'utf8',timeout:3000});
  assert.notEqual(attempt.status,0);
  assert.match(attempt.stderr,/MORS_SESSION_IDLE_SECONDS/);
});
