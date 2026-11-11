import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rmdir, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('catalog recovers after a transient database-open failure', {timeout:20000}, async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'mors-retry-'));
  const blocked=path.join(dir,'mors.sqlite');
  await mkdir(blocked);
  const reserve=net.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const child=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),MORS_DB_PATH:blocked,MORS_DISABLE_CREDENTIALS:'1'},stdio:['ignore','pipe','pipe']});
  try {
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Server exited before ready')})]);
    const url=`http://127.0.0.1:${port}/api/catalog`;
    assert.equal((await fetch(url)).status,500);
    await rmdir(blocked);
    const response=await fetch(url);
    assert.equal(response.status,200);
    assert.equal((await response.json()).datasets[0].id,'PSI-69');
  } finally {
    child.kill();
    if (child.exitCode===null) await once(child,'exit');
    const target=path.resolve(dir), temp=path.resolve(os.tmpdir())+path.sep;
    if (!target.startsWith(temp)) throw new Error('Refusing to clean a directory outside the test temp root.');
    await rm(target,{recursive:true,force:true});
  }
});
