// Orthographic spherical projection of genuine FIRMS observations. No synthetic hotspots.
import { csvCell } from './csv-safe.js';
const DEG=Math.PI/180;
export function projectEarth(latitude,longitude,centerLatitude,centerLongitude,radius,cx,cy){
  const lat=latitude*DEG,lon=(longitude-centerLongitude)*DEG,base=centerLatitude*DEG;
  const depth=Math.sin(base)*Math.sin(lat)+Math.cos(base)*Math.cos(lat)*Math.cos(lon);
  return {visible:depth>=0,x:cx+radius*Math.cos(lat)*Math.sin(lon),y:cy-radius*(Math.cos(base)*Math.sin(lat)-Math.sin(base)*Math.cos(lat)*Math.cos(lon)),depth};
}
const regions={California:{bbox:'-125,32,-114,42',lat:37,lon:-119.5},Mediterranean:{bbox:'-10,30,40,47',lat:38.5,lon:15},Australia:{bbox:'113,-40,153,-10',lat:-25,lon:133},Amazon:{bbox:'-75,-15,-50,5',lat:-5,lon:-62.5}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountEarthGlobe(root){
  let rows=[],centerLat=37,centerLon=-119.5,zoom=1,selected=null,points=[],drag=null,requestId=0,disposed=false;
  root.innerHTML=`<section class="globe-lab"><header><h2>Earth 3D Observatory</h2><p>Orthographic Earth projection of real NASA FIRMS VIIRS Suomi-NPP thermal anomaly observations.</p></header><div class="globe-controls"><label>Research region<select id="globeRegion">${Object.keys(regions).map(n=>`<option>${n}</option>`).join('')}</select></label><label>Recent days<select id="globeDays">${[1,2,3,4,5].map(n=>`<option value="${n}">${n}</option>`).join('')}</select></label><button id="globeLoad">Load NASA observations</button><button id="globeReset">Center region</button><button id="globeExport" disabled>Export observations CSV</button></div><p id="globeStatus" role="status">Select a bounded region, then load observations. Drag to rotate the globe and use the wheel to zoom.</p><div class="globe-layout"><div class="globe-canvas-wrap"><canvas id="globeCanvas" width="800" height="650" aria-label="Orthographic globe with real FIRMS observations"></canvas></div><aside class="card globe-inspector"><h3>Observation inspector</h3><div id="globeDetails">Select a plotted observation or choose one from the list after loading.</div><label>Observation list<select id="globeList" disabled><option value="">No observations loaded</option></select></label><p>Satellite thermal anomalies are observations, not confirmed fire perimeters. Sensor measurements must not be equated with microgravity flame experiments.</p><a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">NASA FIRMS source ↗</a></aside></div></section>`;
  const q=s=>root.querySelector(s),canvas=q('#globeCanvas'),ctx=canvas.getContext('2d'),status=q('#globeStatus');
  function draw(){
    if(disposed)return;
    const w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,R=Math.min(w,h)*.43*zoom;
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#061426';ctx.fillRect(0,0,w,h);
    const gradient=ctx.createRadialGradient(cx-R*.34,cy-R*.35,R*.05,cx,cy,R);gradient.addColorStop(0,'#1a5a70');gradient.addColorStop(.65,'#10344b');gradient.addColorStop(1,'#071827');
    ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fillStyle=gradient;ctx.fill();ctx.strokeStyle='#64cee4';ctx.lineWidth=2;ctx.stroke();
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.clip();ctx.strokeStyle='rgba(151,211,225,.3)';ctx.lineWidth=1;
    for(let lat=-75;lat<=75;lat+=15){ctx.beginPath();let open=false;for(let lon=-180;lon<=180;lon+=3){const p=projectEarth(lat,lon,centerLat,centerLon,R,cx,cy);if(p.visible){if(!open)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);open=true}else open=false}ctx.stroke()}
    for(let lon=-180;lon<180;lon+=15){ctx.beginPath();let open=false;for(let lat=-90;lat<=90;lat+=3){const p=projectEarth(lat,lon,centerLat,centerLon,R,cx,cy);if(p.visible){if(!open)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);open=true}else open=false}ctx.stroke()}
    points=[];
    for(let i=0;i<rows.length;i++){const row=rows[i],lat=Number(row.latitude),lon=Number(row.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;const p=projectEarth(lat,lon,centerLat,centerLon,R,cx,cy);if(!p.visible)continue;points.push({...p,index:i});ctx.beginPath();ctx.arc(p.x,p.y,i===selected?6:3,0,Math.PI*2);ctx.fillStyle=i===selected?'#fff2a8':'#ffb45e';ctx.fill()}
    ctx.restore();ctx.fillStyle='#b8d9e5';ctx.font='13px system-ui';ctx.fillText(`${rows.length} source observations · ${points.length} visible on hemisphere`,16,h-18);
  }
  function inspect(index){selected=index;const row=rows[index];if(!row){q('#globeDetails').textContent='No observation selected.';draw();return}
    const keys=['latitude','longitude','acq_date','acq_time','satellite','instrument','confidence','frp','bright_ti4','bright_ti5','scan','track','version'];
    q('#globeDetails').innerHTML=`<dl>${keys.filter(k=>row[k]!==undefined&&row[k]!==null).map(k=>`<dt>${esc(k)}</dt><dd>${esc(row[k])}</dd>`).join('')}</dl><p>OBSERVED: values are from the NASA FIRMS response. No ground verification is implied.</p>`;
    q('#globeList').value=String(index);draw();
  }
  function reset(){const name=q('#globeRegion').value,region=regions[name];centerLat=region.lat;centerLon=region.lon;zoom=1;draw()}
  q('#globeReset').onclick=reset;q('#globeRegion').onchange=reset;
  q('#globeLoad').onclick=async()=>{
    const id=++requestId,region=regions[q('#globeRegion').value],days=q('#globeDays').value;
    q('#globeLoad').disabled=true;status.textContent='Requesting bounded live FIRMS observations…';
    try{const response=await fetch(`/api/firms?bbox=${encodeURIComponent(region.bbox)}&days=${encodeURIComponent(days)}`);const data=await response.json();if(id!==requestId||disposed)return;
      if(!response.ok||data.status!=='live')throw new Error(data.note||data.error||`HTTP ${response.status}`);
      rows=Array.isArray(data.rows)?data.rows.filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)):[];selected=null;q('#globeExport').disabled=rows.length===0;
      q('#globeList').disabled=rows.length===0;q('#globeList').innerHTML=rows.length?`<option value="">Choose observation</option>${rows.map((r,i)=>`<option value="${i}">${esc(r.acq_date||'date unknown')} · ${Number(r.latitude).toFixed(3)}, ${Number(r.longitude).toFixed(3)}</option>`).join('')}`:'<option value="">No observations in selected region</option>';
      q('#globeDetails').textContent=rows.length?'Select a source observation.':'The live response contained zero observations in this region/window.';
      status.textContent=`${data.cached?'CACHED':'LIVE'} NASA FIRMS VIIRS SNPP NRT · ${rows.length} displayed observations · retrieved ${new Date(data.retrievedAt).toLocaleString()}${data.truncated?' · server capped to 1,500 records':''}.`;reset();
    }catch(error){if(id!==requestId||disposed)return;rows=[];selected=null;q('#globeExport').disabled=true;q('#globeList').disabled=true;q('#globeList').innerHTML='<option value="">Unavailable</option>';status.textContent=`FIRMS unavailable: ${error.message}. No observations plotted.`;draw()}
    finally{if(id===requestId&&!disposed)q('#globeLoad').disabled=false}
  };
  q('#globeList').onchange=e=>{if(e.target.value!=='')inspect(Number(e.target.value))};
  q('#globeExport').onclick=()=>{if(!rows.length)return;const keys=Object.keys(rows[0]),csv=[keys.map(csvCell).join(','),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download='mors-firms-observations.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.offsetX,y:e.offsetY,moved:false}};
  canvas.onpointermove=e=>{if(!drag)return;const dx=e.offsetX-drag.x,dy=e.offsetY-drag.y;if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;centerLon=((centerLon-dx*.3+540)%360)-180;centerLat=Math.max(-85,Math.min(85,centerLat+dy*.3));drag.x=e.offsetX;drag.y=e.offsetY;draw()};
  canvas.onpointerup=e=>{if(!drag)return;const moved=drag.moved;drag=null;if(moved)return;const sx=canvas.width/canvas.clientWidth,sy=canvas.height/canvas.clientHeight,x=e.offsetX*sx,y=e.offsetY*sy;let closest=null,dist=12*12;for(const p of points){const d=(p.x-x)**2+(p.y-y)**2;if(d<dist){closest=p.index;dist=d}}if(closest!==null)inspect(closest)};
  canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.55,Math.min(1.5,zoom*(e.deltaY<0?1.08:.92)));draw()};
  reset();return ()=>{disposed=true;requestId++;};
}
