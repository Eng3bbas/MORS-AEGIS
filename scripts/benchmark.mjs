import { performance } from 'node:perf_hooks';
import { readFlex, summarize, validate } from '../ms05-analysis/analysis.mjs';
import { runWorkflow } from '../ms09-agents/workflow.mjs';
const rows = await readFlex();
const results = [];
for (const [name, fn] of [['validate',()=>validate(rows)],['summarize',()=>summarize(rows)],['workflow',()=>runWorkflow(rows)]]) {
  for(let i=0;i<100;i++) fn();
  const samples=[];
  for(let i=0;i<1000;i++){const start=performance.now();fn();samples.push(performance.now()-start)}
  samples.sort((a,b)=>a-b);
  results.push({operation:name,records:rows.length,iterations:1000,medianMs:samples[500],p95Ms:samples[950]});
}
console.log(JSON.stringify({runtime:process.version,platform:process.platform,results,note:'Local microbenchmark, five bundled records. No scaling or before/after speedup claim.'},null,2));
