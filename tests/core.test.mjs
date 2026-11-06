import test from 'node:test';
import assert from 'node:assert/strict';
import { readFlex, summarize, validate, pearson, parseCSV } from '../ms05-analysis/analysis.mjs';
import { runWorkflow } from '../ms09-agents/workflow.mjs';

test('NASA PSI FLEX subset parses with five source records and preserves missing value',async()=>{const r=await readFlex();assert.equal(r.length,5);assert.equal(r[3].visible_flame_extinction_diameter_mm,null);assert.equal(r[0].id,'20CAL08')});
test('descriptive mean matches manual source calculation',async()=>{const r=await readFlex(),s=summarize(r);assert.equal(s.stats.burning_rate_mm_s.n,5);assert.ok(Math.abs(s.stats.burning_rate_mm_s.mean-.556)<1e-12);assert.equal(s.stats.visible_flame_extinction_diameter_mm.n,4)});
test('range validation rejects negative measurements',()=>{const r=parseCSV('pressure_mmHg\n-1');assert.equal(validate(r).valid,false)});
test('Pearson association is withheld for fewer than three pairs',()=>{assert.equal(pearson([{a:1,b:1},{a:2,b:2}],'a','b').r,null)});
test('workflow marks missing imagery and quantum work honestly',async()=>{const w=runWorkflow(await readFlex());assert.equal(w.status,'reviewed');assert.equal(w.stages.find(x=>x.agent.startsWith('04')).status,'not-run');assert.equal(w.stages.find(x=>x.agent.startsWith('07')).status,'not-run');assert.equal(w.provenance.doi,'10.60555/mbq8-0451')});
test('CSV parser handles quoted commas, doubled quotes and embedded line breaks',()=>{const rows=parseCSV('id,note,burning_rate_mm_s\nA,"flame, cool",0.4\nB,"said ""stable""\nline two",0.6');assert.equal(rows.length,2);assert.equal(rows[0].note,'flame, cool');assert.equal(rows[1].note,'said "stable"\nline two');assert.equal(rows[1].burning_rate_mm_s,.6)});
test('summary reports the burning-rate unit as mm/s',async()=>{const s=summarize(await readFlex());assert.equal(s.stats.burning_rate_mm_s.unit,'mm/s')});
test('workflow with malformed records rejects analysis instead of throwing',()=>{const w=runWorkflow([null]);assert.equal(w.status,'rejected');assert.equal(w.statistics,null);assert.equal(w.stages.find(x=>x.agent.startsWith('03')).status,'blocked')});
test('validation rejects impossible calendar dates and whitespace-only required values',async()=>{const row=(await readFlex())[0];assert.equal(validate([{...row,date:'2024-02-30'}]).valid,false);assert.equal(validate([{...row,fuel:'   '}]).valid,false)});
