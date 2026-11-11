import { createHash, randomUUID } from 'node:crypto';
import { readFlex, readFlexFull, summarize, validate } from '../ms05-analysis/analysis.mjs';
import { SOURCES } from '../ms02-connectors/registry.mjs';
// Order-independent: the catalogue returns rows by date, the CSV in source order.
const canonical = rows => JSON.stringify(rows.map(row => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b]) => a.localeCompare(b))))).sort());
const digest = rows => createHash('sha256').update(canonical(rows)).digest('hex');
// Digests of the bundled NASA tables; only exact matches inherit NASA provenance.
const bundledDigests = new Set([digest(await readFlex()), digest(await readFlexFull())]);
const roles = ['Chief orchestrator','Product innovation','Software architecture','Frontend engineering','UI/UX design','Scientific visualization','Scientific data','Computational science','AI/ML research','Scientific peer review','Cybersecurity','Quality engineering','Independent code review','Reliability engineering','Competition experience','Quantum review'];
export const AGENT_ROLES = roles.map((name,id) => ({id:String(id).padStart(2,'0'),name,execution:'role contract; no independent model invoked',permissions:['read supplied public records','produce structured recommendations'],denied:['network access','credential access','filesystem writes','external actions'],reviewer:id===9?'00':'09'}));
export function independentReview(rows, summary) {
  const findings=[];
  const expected=Object.keys(summarize([]).stats).sort();
  if(JSON.stringify(Object.keys(summary?.stats || {}).sort())!==JSON.stringify(expected)) findings.push({severity:'high',issue:'Statistic field set differs from expected schema',action:'Recompute the complete summary.'});
  for(const [key, actual] of Object.entries(summary?.stats || {})) {
    let n=0,total=0,squared=0;
    for(const row of rows) if(Number.isFinite(row[key])) {n++;total+=row[key];squared+=row[key]*row[key];}
    const mean=n?total/n:null;
    const sd=n>1?Math.sqrt(Math.max(0,(squared-total*total/n)/(n-1))):null;
    const close=(a,b)=>(a===null&&b===null) || (Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(b)));
    if(actual.n!==n || !close(actual.mean,mean) || !close(actual.sd,sd)) findings.push({field:key,severity:'high',issue:'Independent arithmetic disagrees with summary',action:'Reject result and recompute from source rows.'});
  }
  if(!summary || !Object.keys(summary.stats || {}).length) findings.push({severity:'high',issue:'Missing statistics',action:'Compute valid descriptive statistics.'});
  return {method:'Separate sum and sum-of-squares calculation; numerical review only, not external source validation.',accepted:findings.length===0,findings};
}
export function runWorkflow(rows) {
  const quality=validate(rows), stats=quality.valid?summarize(rows):null;
  const review=quality.valid?independentReview(rows,stats):{accepted:false,findings:quality.errors.map(issue=>({severity:'high',issue,action:'Correct source record, retain original, rerun workflow.'}))};
  const isBundled=quality.valid && bundledDigests.has(digest(rows));
  const accepted=quality.valid && review.accepted;
  const timestamp=new Date().toISOString();
  return {runId:`AEGIS-${randomUUID()}`,status:accepted?'reviewed':'rejected',executionMode:'deterministic local functions; no autonomous LLM organization executed',roles:AGENT_ROLES,stages:[
    {agent:'01 · Data Acquisition',status:'complete',detail:`Received ${Array.isArray(rows)?rows.length:0} records. ${isBundled?'Exact bundled FLEX table identity matched.':'User-supplied source identity is unverified.'}`},
    {agent:'02 · Data Quality',status:quality.valid?'complete':'failed',detail:`Schema, finite values, dates and ranges checked; ${quality.errors.length} errors, ${quality.warnings.length} warnings.`},
    {agent:'03 · Scientific Analysis',status:quality.valid?'complete':'blocked',detail:quality.valid?'Computed null-aware descriptive statistics.':'Analysis withheld pending data correction.'},
    {agent:'04 · Computer Vision',status:'not-run',detail:'No calibrated imagery supplied.'},
    {agent:'05 · Scientific Review Council',status:accepted?'complete':'blocked',detail:accepted?'Independent arithmetic implementation accepted numerical results. Source accuracy and population inference not certified.':'Review rejected input/results; corrections required.'},
    {agent:'06 · Evidence & Citation',status:isBundled?'complete':'unverified',detail:isBundled?`Bundled extract linked to ${SOURCES[0].doi}; current upstream table not reverified.`:'No source citation assigned to uploaded records.'},
    {agent:'07 · Quantum Research',status:'not-run',detail:'No quantum computation performed or advantage claimed.'},
    {agent:'08 · Research Discovery',status:'complete',detail:'Full experiment assets and calibration metadata needed before inferential research.'},
    {agent:'09 · AEGIS AI Copilot',status:'available-if-configured',detail:'Separate optional model request; not part of numerical acceptance.'},
    {agent:'10 · Scientific Orchestrator',status:accepted?'complete':'blocked',detail:'Acceptance requires schema and independent numerical review.'}
  ],quality,statistics:accepted?stats:null,review,taskBoard:[{id:'validate',owner:'06',status:quality.valid?'accepted':'rejected',evidence:quality},{id:'calculate',owner:'07',status:quality.valid?'implemented':'blocked'},{id:'review',owner:'09',status:accepted?'accepted':'rejected',evidence:review}],reviewHistory:[{phase:'planning',timestamp,decision:'Validate before calculation; reviewer can reject.'},{phase:'validation',timestamp,decision:quality.valid?'accepted':'rejected'},{phase:'independent-review',timestamp,decision:accepted?'accepted':'rejected'},{phase:'correction',timestamp,decision:accepted?'not-required':'awaiting corrected input; no fabricated correction or retest'}],provenance:{sourceId:isBundled?'psi-flex':'user-supplied-unverified',doi:isBundled?SOURCES[0].doi:null,source:isBundled?SOURCES[0].url:null,datasetDigest:quality.valid?digest(rows):null,classification:'COMPUTED from supplied records; source identity verified only against bundled extract',timestamp,processing:'Schema and range validation; descriptive statistics; independent arithmetic review',upstreamVerification:'Not performed by this workflow'}};
}
