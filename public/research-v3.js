const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const variables = { burning_rate_mm_s:'Burning-rate constant · mm²/s', burn_time_s:'Burn duration · s', initial_droplet_diameter_mm:'Initial diameter · mm', visible_flame_extinction_diameter_mm:'Extinction diameter · mm', pressure_mmHg:'Pressure · mmHg', oxygen_mole_fraction:'Oxygen mole fraction · 1' };
async function request(url, body) {
  const response = await fetch(url, body === undefined ? undefined : {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function exportJson(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href=url; link.download=name; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function mountResearchCore(root, mode='analysis') {
  const [catalog, recordsResponse] = await Promise.all([request('/api/catalog'),request('/api/catalog/experiments')]);
  const records=recordsResponse.records, source=catalog.datasets[0];
  const ids=records.map(row=>row.id);
  root.innerHTML=`<div class="section-title"><div><h2>${escapeHtml(mode==='challenge'?'Scientific Challenge Mode':mode==='replay'?'Provenance Replay':'Scientific Data Explorer')}</h2><p>Verified calculations from the bundled PSI-69 experimental table</p></div><span class="tag obs">LOCAL SCIENTIFIC DATA</span></div>
    <div class="callout warn">Bundled table transcription; source row values have not been independently reverified from NASA. No instrument uncertainty is supplied.</div>
    <div class="grid two"><article class="card"><h3>Dataset and method</h3><p><b>${escapeHtml(source.title)}</b> · ${escapeHtml(source.id)}</p><p>${escapeHtml(source.scope)}</p><p>Version SHA-256: <code>${escapeHtml(source.version_sha256)}</code></p><p>Source: <a href="${escapeHtml(source.source_url)}" target="_blank" rel="noreferrer">NASA PSI-69</a></p><label>Measurement<select id="coreVariable">${Object.entries(variables).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>Scientific question<input id="coreQuestion" maxlength="500" value="What is the descriptive mean for these records?"></label><div class="toolbar"><button id="coreAnalyze" class="primary-btn">Run analysis</button><button id="coreChallenge">Run challenge</button><button id="coreReplay">Replay saved analysis</button></div><p>Only deterministic local calculations produce numbers. An unproven hypothesis remains marked as a hypothesis.</p></article>
    <article class="card"><h3>Experiment suitability</h3><label>First experiment<select id="coreA">${ids.map(id=>`<option>${escapeHtml(id)}</option>`).join('')}</select></label><label>Second experiment<select id="coreB">${ids.map((id,i)=>`<option ${i===1?'selected':''}>${escapeHtml(id)}</option>`).join('')}</select></label><button id="coreCompare">Evaluate comparison</button><p>The engine checks measurement availability and reported conditions. Missing calibration prevents an equivalence claim.</p></article></div>
    <article class="card"><h3>Traceable result</h3><div id="coreStatus" role="status">Select an action to inspect calculations and evidence.</div><pre id="coreResult" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><button id="coreExport" hidden>Export this result JSON</button></article>`;
  const get=id=>root.querySelector('#'+id);
  let result=null;
  const show=(label,value)=>{result=value;get('coreStatus').textContent=label;get('coreResult').textContent=JSON.stringify(value,null,2);get('coreExport').hidden=false;};
  const fail=error=>{get('coreStatus').textContent=`Request failed: ${error.message}`;get('coreResult').textContent='';get('coreExport').hidden=true;result=null;};
  get('coreAnalyze').onclick=async()=>{try{const value=await request('/api/research/analyze',{variable:get('coreVariable').value,question:get('coreQuestion').value});localStorage.setItem('mors-last-analysis-v3',JSON.stringify(value));show('COMPUTED · input and output checksums saved locally',value)}catch(error){fail(error)}};
  get('coreChallenge').onclick=async()=>{try{const question=get('coreQuestion').value;const comparing=/compare|difference|differ|قارن|فرق|مقارن/i.test(question);const value=await request('/api/research/challenge',{variable:get('coreVariable').value,question,selectedIds:comparing?[get('coreA').value,get('coreB').value]:null});show(value.status==='unsupported'?'CHALLENGE · available data cannot answer this question':'CHALLENGE · hypothesis remains unproven',value)}catch(error){fail(error)}};
  get('coreReplay').onclick=async()=>{try{const saved=JSON.parse(localStorage.getItem('mors-last-analysis-v3')||'null');if(!saved)throw Error('Run an analysis first.');show('REPLAY · recomputed and checksum-compared',await request('/api/research/replay',{saved}))}catch(error){fail(error)}};
  get('coreCompare').onclick=async()=>{try{show('COMPARABILITY · inspect status and reasons',await request('/api/research/compare',{a:get('coreA').value,b:get('coreB').value,measurement:get('coreVariable').value}))}catch(error){fail(error)}};
  get('coreExport').onclick=()=>result&&exportJson('mors-scientific-result.json',result);
  return {records:records.length,version:source.version_sha256};
}
