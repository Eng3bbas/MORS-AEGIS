// Pixel-domain analysis of a user-provided still image. No physical calibration is implied.
export async function readImageDimensions(file) {
  const bytes = new Uint8Array(await file.slice(0, file.type === 'image/jpeg' ? file.size : 64).arrayBuffer());
  const be32 = at => ((bytes[at] * 2 ** 24) + (bytes[at+1] << 16) + (bytes[at+2] << 8) + bytes[at+3]);
  let width, height;
  if (file.type === 'image/png' && bytes.length >= 24 && bytes.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i]) && String.fromCharCode(...bytes.slice(12,16)) === 'IHDR') {
    width=be32(16); height=be32(20);
  } else if (file.type === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at=2;
    while (at+3 < bytes.length) {
      if (bytes[at++] !== 0xff) break;
      while (bytes[at] === 0xff) at++;
      const marker=bytes[at++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length=(bytes[at] << 8) | bytes[at+1];
      if (length < 2 || at + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) {
        height=(bytes[at+3] << 8) | bytes[at+4]; width=(bytes[at+5] << 8) | bytes[at+6]; break;
      }
      at += length;
    }
  } else if (file.type === 'image/webp' && bytes.length >= 30 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') {
    const format=String.fromCharCode(...bytes.slice(12,16));
    if (format === 'VP8X') {
      width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);
      height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);
    } else if (format === 'VP8L' && bytes[20] === 0x2f) {
      width=1+bytes[21]+((bytes[22]&0x3f)<<8);
      height=1+((bytes[22]>>6)&3)+(bytes[23]<<2)+((bytes[24]&0x0f)<<10);
    } else if (format === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      width=((bytes[27]<<8)|bytes[26])&0x3fff;
      height=((bytes[29]<<8)|bytes[28])&0x3fff;
    }
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('Image dimensions could not be verified before decoding.');
  if (width * height > 4_000_000) throw new Error('Image exceeds 4 million pixels.');
  return { width, height };
}
export function segmentWarmPixels(rgba, width, height, threshold = 90) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 4_000_000 || rgba.length < width * height * 4) throw new Error('Invalid image dimensions');
  const mask = new Uint8Array(width * height);
  const floor = Math.max(0, Math.min(255, Number(threshold) || 0));
  for (let i = 0; i < mask.length; i++) {
    const p=i*4, r=rgba[p], g=rgba[p+1], b=rgba[p+2], a=rgba[p+3];
    mask[i] = +(a >= 128 && r >= floor && r > b * 1.25 && g > b * 1.08 && r >= g * .88);
  }
  return mask;
}
export function measureLargestRegion(mask,width,height) {
  const seen=new Uint8Array(mask.length), queue=new Int32Array(mask.length);
  let best=null;
  for(let start=0;start<mask.length;start++){
    if(!mask[start]||seen[start])continue;
    let head=0,tail=1,area=0,perimeter=0,sumX=0,sumY=0,minX=width,minY=height,maxX=0,maxY=0;
    queue[0]=start;seen[start]=1;
    while(head<tail){
      const index=queue[head++],x=index%width,y=Math.floor(index/width);area++;sumX+=x;sumY+=y;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
        if(nx<0||nx>=width||ny<0||ny>=height||!mask[ny*width+nx]){perimeter++;continue}
        const next=ny*width+nx;if(!seen[next]){seen[next]=1;queue[tail++]=next}
      }
    }
    if(!best||area>best.area)best={area,perimeter,bounds:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},centroid:{x:sumX/area,y:sumY/area},pixelIndices:queue.slice(0,tail)};
  }
  return best;
}
const escapeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountVisionLab(root){
  let bitmap=null, filename='', result=null, width=0,height=0;
  root.innerHTML=`<section class="vision-lab"><header><h2>Computer Vision Laboratory</h2><p>Local still-image segmentation and pixel geometry. Uploads remain in this browser session.</p></header><div class="vision-controls"><label>Image (PNG, JPEG, WebP; up to 12 MB)<input id="visionFile" type="file" accept="image/png,image/jpeg,image/webp"></label><label>Warm-pixel threshold <output id="visionThresholdValue">90</output><input id="visionThreshold" type="range" min="0" max="255" value="90"></label><button id="visionAnalyze" disabled>Analyze image</button><button id="visionExport" disabled>Export result JSON</button></div><p id="visionStatus" role="status">Choose an image to begin.</p><div class="vision-canvases"><figure><canvas id="visionOriginal"></canvas><figcaption>Uploaded source image</figcaption></figure><figure><canvas id="visionOverlay"></canvas><figcaption>Largest connected warm-pixel region highlighted in cyan</figcaption></figure></div><div id="visionResults" class="card"></div><p class="vision-limit">This color rule is exploratory, not a validated flame detector. It can include warm-colored background objects. Pixel counts and lengths are not millimeters, temperature or physical flame area. No NASA source identity or camera calibration is inferred from an uploaded image.</p></section>`;
  const q=s=>root.querySelector(s),status=q('#visionStatus'),file=q('#visionFile'),threshold=q('#visionThreshold');
  threshold.oninput=()=>q('#visionThresholdValue').textContent=threshold.value;
  file.onchange=async()=>{
    bitmap?.close?.();bitmap=null;result=null;q('#visionAnalyze').disabled=true;q('#visionExport').disabled=true;
    const item=file.files?.[0];if(!item)return;
    if(!['image/png','image/jpeg','image/webp'].includes(item.type)||item.size>12_000_000){status.textContent='Unsupported image or file larger than 12 MB.';return}
    try{const dimensions=await readImageDimensions(item);bitmap=await createImageBitmap(item);if(bitmap.width!==dimensions.width||bitmap.height!==dimensions.height||bitmap.width*bitmap.height>4_000_000){bitmap.close();bitmap=null;throw new Error('Decoded image dimensions differ from verified header or exceed the pixel limit')}
      filename=item.name;width=bitmap.width;height=bitmap.height;
      for(const id of ['#visionOriginal','#visionOverlay']){const canvas=q(id);canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(bitmap,0,0)}
      status.textContent=`Loaded ${width} × ${height} pixels. Adjust threshold and analyze.`;q('#visionAnalyze').disabled=false;
    }catch(error){status.textContent=`Image could not be decoded: ${error.message}`}
  };
  q('#visionAnalyze').onclick=()=>{
    if(!bitmap)return;const source=q('#visionOriginal').getContext('2d').getImageData(0,0,width,height);
    const mask=segmentWarmPixels(source.data,width,height,Number(threshold.value));const region=measureLargestRegion(mask,width,height);
    const overlay=q('#visionOverlay'),context=overlay.getContext('2d');context.clearRect(0,0,width,height);context.drawImage(bitmap,0,0);
    result={classification:'COMPUTED pixel geometry from USER-SUPPLIED UNVERIFIED image',fileName:filename,image:{width,height},method:'Warm-color threshold; 4-connected largest component; four-neighbor perimeter',parameters:{threshold:Number(threshold.value)},measurements:region?{area_px2:region.area,perimeter_px:region.perimeter,bounds_px:region.bounds,centroid_px:region.centroid}:null,limitations:['Color segmentation is unvalidated; warm backgrounds may be detected','No physical calibration, temperature inference, or NASA source attribution'],processedAt:new Date().toISOString()};
    if(region){const tint=context.getImageData(0,0,width,height);for(const i of region.pixelIndices){const p=i*4;tint.data[p]=25;tint.data[p+1]=220;tint.data[p+2]=238;tint.data[p+3]=210}context.putImageData(tint,0,0);
      q('#visionResults').innerHTML=`<h3>Pixel measurements</h3><dl><dt>Region area</dt><dd>${region.area} px²</dd><dt>Perimeter</dt><dd>${region.perimeter} px</dd><dt>Bounding box</dt><dd>${region.bounds.width} × ${region.bounds.height} px</dd><dt>Centroid</dt><dd>(${region.centroid.x.toFixed(1)}, ${region.centroid.y.toFixed(1)}) px</dd></dl>`;
      status.textContent=`Found one largest connected region with ${region.area} pixels. Inspect the overlay for false detections.`;
    }else{q('#visionResults').textContent='No warm connected pixels found at this threshold.';status.textContent='No candidate region detected. Adjust threshold or use another image.'}
    q('#visionExport').disabled=false;
  };
  q('#visionExport').onclick=()=>{if(!result)return;const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download='mors-vision-pixels.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  return ()=>{bitmap?.close?.()};
}
