import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../public/csv-safe.js';
import { readImageDimensions } from '../public/vision-lab.js';

test('CSV export neutralizes spreadsheet formulas while retaining ordinary numbers',()=>{
  assert.equal(csvCell('=HYPERLINK("https://invalid.example")'),'"\'=HYPERLINK(""https://invalid.example"")"');
  assert.equal(csvCell('  @SUM(1,2)'), '"\'  @SUM(1,2)"');
  assert.equal(csvCell(-3),'"-3"');
  assert.equal(csvCell('NASA'),'"NASA"');
});
test('image dimensions are rejected before bitmap decoding',async()=>{
  const png=new Uint8Array(32);png.set([137,80,78,71,13,10,26,10],0);png.set([73,72,68,82],12);
  png.set([0,0,3,232,0,0,3,232],16);
  assert.deepEqual(await readImageDimensions(new Blob([png],{type:'image/png'})),{width:1000,height:1000});
  png.set([0,0,39,16,0,0,39,16],16);
  await assert.rejects(readImageDimensions(new Blob([png],{type:'image/png'})),/4 million/);
  await assert.rejects(readImageDimensions(new Blob([new Uint8Array(32)],{type:'image/png'})),/could not be verified/);
});
