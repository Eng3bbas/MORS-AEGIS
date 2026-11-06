import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFlex } from '../ms05-analysis/analysis.mjs';
import { openCatalog, ingestBundledFlex, listCatalog, getExperiments } from '../src/data/catalog.mjs';
import { compareExperiments, runAnalysis, replayAnalysis, scientificChallenge } from '../src/science/research.mjs';

test('portable SQLite catalog keeps exact bundled records and checksum',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'mors-catalog-'));
  let db;
  try {
    db=await openCatalog(path.join(dir,'mors.sqlite'));
    const first=await ingestBundledFlex(db), again=await ingestBundledFlex(db);
    assert.equal(first.records,5); assert.equal(again.changed,false);
    assert.match(first.version,/^[a-f0-9]{64}$/);
    const records=getExperiments(db); assert.equal(records.length,5);
    assert.equal(records[3].visible_flame_extinction_diameter_mm,null);
    assert.match(records[0].row_sha256,/^[a-f0-9]{64}$/);
    assert.match(listCatalog(db)[0].provenance_status,/not independently reverified/);
  } finally { db?.close(); await rm(dir,{recursive:true,force:true}); }
});
test('comparability rejects differing fuel, missing values and equivalence claims',async()=>{
  const rows=await readFlex();
  assert.equal(compareExperiments(rows[0],{...rows[1],fuel:'Ethanol'}).status,'unsupported');
  assert.equal(compareExperiments(rows[0],rows[3],'visible_flame_extinction_diameter_mm').status,'unsupported');
  const result=compareExperiments(rows[0],rows[1]);
  assert.equal(result.status,'partial'); assert.equal(result.unit,'mm/s'); assert.ok(Math.abs(result.difference-0.08)<1e-12);
  assert.match(result.reasons.join(' '),/does not establish experimental equivalence/);
});
test('analysis replay reproduces checksum and detects changed source measurements',async()=>{
  const rows=await readFlex(), analysis=runAnalysis(rows);
  assert.equal(analysis.result.mean,0.556); assert.equal(analysis.result.n,5);
  assert.equal(replayAnalysis(rows,analysis).matches,true);
  assert.equal(replayAnalysis(rows.map((r,i)=>i? r:{...r,burning_rate_mm_s:0.53}),analysis).matches,false);
  assert.equal(replayAnalysis(rows.map((r,i)=>i? r:{...r,pressure_mmHg:r.pressure_mmHg+1}),analysis).matches,false);
  assert.equal(replayAnalysis(rows,{...analysis,result:{...analysis.result,mean:999}}).savedResultMatches,false);
  const versioned=runAnalysis(rows,{datasetVersion:'real-version'});
  assert.equal(replayAnalysis(rows,{...versioned,recipe:{...versioned.recipe,datasetVersion:'fake-version'}},'real-version').versionMatches,false);
  assert.equal(replayAnalysis(rows,{...analysis,recipe:{...analysis.recipe,datasetId:'fake-dataset'}}).recipeMatches,false);
  assert.equal(replayAnalysis(rows,{...analysis,question:'A different scientific question'}).questionMatches,false);
  assert.equal(replayAnalysis(rows,{...analysis,recipe:{...analysis.recipe,version:1}}).matches,false);
  assert.throws(()=>runAnalysis(rows,{variable:'__proto__'}),/Unknown/);
});
test('challenge labels hypothesis as unproven and carries replay recipe',async()=>{
  const rows=await readFlex();
  const result=scientificChallenge(rows,{question:'How do selected burning rates differ?',selectedIds:[rows[0].id,rows[1].id]});
  assert.equal(result.hypothesis.supported,false);
  assert.equal(result.comparison.status,'partial');
  assert.match(result.analysis.recipe.inputSha256,/^[a-f0-9]{64}$/);
  assert.equal(result.stages.find(s=>s.stage==='Suitability').status,'partial');
  assert.equal(scientificChallenge(rows,{question:'What is the capital of France?'}).status,'unsupported');
  assert.equal(scientificChallenge(rows,{question:'How do selected burning rates differ?'}).status,'unsupported');
});
