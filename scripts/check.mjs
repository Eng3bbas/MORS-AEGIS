import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
let failed = false, count = 0;
async function scan(dir) {
  for (const item of await readdir(dir,{withFileTypes:true})) {
    if (['node_modules','.git'].includes(item.name) || item.name.startsWith('.env')) continue;
    const file=path.join(dir,item.name);
    if(item.isDirectory()){await scan(file);continue}
    if(/\.(m?js)$/.test(item.name)) {
      const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
      if(result.status!==0){failed=true;console.error(result.stderr)}
      count++;
    }
    if(/\.(m?js|json|html|md|ya?ml|csv|ps1)$/.test(item.name)) {
      const text=await readFile(file,'utf8');
      if(/AIza[0-9A-Za-z_-]{35}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}/.test(text)) {
        failed=true;console.error(`Possible secret in ${file}; value withheld.`);
      }
    }
  }
}
await scan('.');
console.log(`Checked ${count} JavaScript files and known credential signatures. This is not a comprehensive secret scanner.`);
process.exitCode=failed?1:0;
