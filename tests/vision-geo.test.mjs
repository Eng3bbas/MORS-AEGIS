import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentWarmPixels, measureLargestRegion } from '../public/vision-lab.js';
import { projectEarth } from '../public/earth-globe.js';

test('warm-color mask and connected pixel geometry are reproducible',()=>{
  const pixels=new Uint8ClampedArray(3*3*4);
  for(const index of [0,1,3,4]) pixels.set([240,150,20,255],index*4);
  const mask=segmentWarmPixels(pixels,3,3,90);
  const region=measureLargestRegion(mask,3,3);
  assert.equal(region.area,4);
  assert.equal(region.perimeter,8);
  assert.deepEqual(region.bounds,{x:0,y:0,width:2,height:2});
  assert.deepEqual(region.centroid,{x:.5,y:.5});
  assert.equal(mask[8],0);
});
test('transparent and cold pixels are excluded; invalid dimensions rejected',()=>{
  const pixels=new Uint8ClampedArray([255,180,20,0,30,80,240,255]);
  assert.deepEqual([...segmentWarmPixels(pixels,2,1,90)],[0,0]);
  assert.equal(measureLargestRegion(new Uint8Array([0,0]),2,1),null);
  assert.throws(()=>segmentWarmPixels(pixels,3,1,90));
});
test('orthographic globe reveals near hemisphere and hides opposite hemisphere',()=>{
  const near=projectEarth(0,0,0,0,100,100,100),far=projectEarth(0,180,0,0,100,100,100);
  assert.equal(near.visible,true);assert.equal(far.visible,false);
  assert.ok(Math.abs(near.x-100)<1e-10);assert.ok(Math.abs(near.y-100)<1e-10);
});
