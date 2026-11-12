import { explorerShell, mountExplorer } from './explorer.js';
import { mountResearchCore } from './research-v3.js';
import { mountVisionLab } from './vision-lab.js';
import { mountEarthGlobe } from './earth-globe.js';
import { csvCell } from './csv-safe.js';
import { $, esc, toast, safeNasaHref, pageHead, stat, download } from './lib/dom.js';
import { get, post } from './lib/api.js';
import { chartSVG } from './lib/charts.js';
import { strictNumber, parseCSVClient, pearsonLocal } from './lib/csv-client.js';
const nav = [
  ['Research Explorer', 'Interactive Research Explorer', '⌕', 'group'],
  ['Overview', 'Mission overview', '⌂', 'group'],
  ['Combustion Lab', 'Microgravity Combustion Lab', '◉', 'group'],
  ['Dataset Explorer', 'Experiment Dataset Explorer', '▤', 'group'],
  ['Analysis Workbench', 'Scientific Analysis Workbench', '∑', 'group'],
  ['Comparison Studio', 'Experiment Comparison Studio', '◫', 'group'],
  ['Discovery Center', 'Scientific Discovery Center', '✦', 'group'],
  ['Earth Fire', 'Earth Fire Intelligence', '◌', 'group'],
  ['Habitat Research', 'Environmental Research', '⌁', 'group'],
  ['Quantum Lab', 'Quantum Research Lab', '⌬', 'group'],
  ['Agent Operations', 'AI Agent Operations', '⌘', 'group'],
  ['AI Copilot', 'AEGIS AI Copilot', '✧', 'group'],
  ['Sources', 'Scientific Sources Registry', '◎', 'group'],
  ['Provenance', 'Evidence & Provenance', '⛓', 'group'],
  ['Reports', 'Scientific Reports Center', '↗', 'group'],
  ['System Health', 'System Health & APIs', '♥', 'group'],
  ['Research Workspace', 'Research Project Workspace', '▣', 'group'],
  ['Settings', 'Settings & Themes', '⚙', 'group'],
];
let current = 'Overview',
  lang = localStorage.getItem('mors-lang') || 'en',
  theme = localStorage.getItem('mors-theme') || 'arctic',
  dataset = null,
  analysis = null,
  workflow = null,
  fires = [],
  chatThread = [],
  chatBusy = false;
nav.splice(
  -1,
  0,
  ['Scientific Core', 'Scientific Data & Replay', '⌁', 'group'],
  ['Challenge Mode', 'Scientific Challenge Mode', '◈', 'group'],
  ['Computer Vision', 'Computer Vision Laboratory', '▣', 'group'],
  ['Earth 3D', 'Earth 3D Observatory', '◉', 'group'],
);
let viewCleanup = null,
  navigationId = 0,
  fireRequestId = 0;
try {
  const saved = JSON.parse(localStorage.getItem('mors-chat-v1') || '[]');
  if (Array.isArray(saved))
    chatThread = saved
      .filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .slice(-60)
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, 8000),
        provider: typeof m.provider === 'string' ? m.provider.slice(0, 120) : '',
        citation: m.role === 'assistant' ? '/psi-69' : '',
        toolsExecuted: Array.isArray(m.toolsExecuted)
          ? m.toolsExecuted
              .slice(0, 3)
              .filter(
                (x) =>
                  x &&
                  ['runAnalysis', 'compareExperiments', 'pearson', 'lookupExperiment'].includes(x.tool) &&
                  x.status === 'complete',
              )
              .map((x) => ({
                tool: x.tool,
                status: 'complete',
                evidence: x.tool === 'lookupExperiment' ? 'OBSERVED' : 'COMPUTED',
                resultSha256: typeof x.resultSha256 === 'string' ? x.resultSha256.slice(0, 64) : '',
              }))
          : [],
      }));
} catch {
  chatThread = [];
}
const t = (a, b) => (lang === 'ar' ? b : a);
function setTheme() {
  document.body.className =
    (theme === 'space' ? 'theme-space' : theme === 'observatory' ? 'theme-observatory' : '') +
    (lang === 'ar' ? ' rtl' : '');
  $('#themeBtn').textContent =
    'Theme · ' + { arctic: 'Arctic', space: 'Deep Space', observatory: 'Observatory' }[theme];
}
function renderNav() {
  const n = $('#nav');
  n.innerHTML = nav
    .map(
      ([k, label, ico, grp], i) =>
        `${i === 0 || i === 1 || i === 6 || i === 8 || i === 9 || i === 11 || i === 15 ? `<div class="nav-group">${i === 0 ? 'COMMAND' : i === 1 ? 'FLAME IN FREEFALL' : i === 6 ? 'EARTH & HABITAT' : i === 8 ? 'COMPUTE & INTELLIGENCE' : i === 11 ? 'EVIDENCE & SYSTEM' : 'RESEARCH'}</div>` : ''}<button data-page="${k}" class="${current === k ? 'active' : ''}"><span class="nav-icon">${ico}</span>${label}</button>`,
    )
    .join('');
  n.querySelectorAll('button').forEach((b) => (b.onclick = () => go(b.dataset.page)));
}
function rowsTable(rows) {
  return `<div class="table-wrap"><table><thead><tr><th>Test ID</th><th>Date · UTC</th><th>Fuel</th><th>Pressure · mmHg</th><th>O₂ fraction</th><th>CO₂ fraction</th><th>He fraction</th><th>Droplet · mm</th><th>Extinction · mm</th><th>Burn-rate constant · mm²/s</th><th>Burn · s</th><th>End state</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="mono">${esc(r.id)}</td><td>${esc(r.date)} <span class="mono">${esc(r.time_utc)}</span></td><td>${esc(r.fuel)}</td><td>${esc(r.pressure_mmHg ?? '—')}</td><td>${esc(r.oxygen_mole_fraction ?? '—')}</td><td>${esc(r.carbon_dioxide_mole_fraction ?? '—')}</td><td>${esc(r.helium_mole_fraction ?? '—')}</td><td>${esc(r.initial_droplet_diameter_mm ?? '—')}</td><td>${esc(r.visible_flame_extinction_diameter_mm ?? '—')}</td><td>${esc(r.burning_rate_mm_s ?? '—')}</td><td>${esc(r.burn_time_s ?? '—')}</td><td>${esc(r.test_end)}</td></tr>`).join('')}</tbody></table></div>`;
}
function hero() {
  return `<div class="hero"><div class="hero-copy"><div class="eyebrow">MORS AEGIS · SCIENTIFIC FIRE & SPACE INTELLIGENCE</div><h2>${t('Understanding flame behavior in microgravity, one traceable measurement at a time.', 'فهم سلوك اللهب في الجاذبية الصغرى، بقياسات قابلة للتتبع.')}</h2><p>${t('A research command environment grounded in NASA’s FLEX investigation. Explore source data, reproduce descriptive analysis, and inspect what the current evidence cannot yet tell us.', 'بيئة بحثية تستند إلى تجربة FLEX التابعة لناسا. استكشف البيانات وأعد التحليل الوصفي وتعرّف على حدود الأدلة المتاحة.')}</p><div class="hero-actions"><button class="primary-btn" data-go="Combustion Lab">Open combustion lab →</button><button class="secondary-btn" data-go="Agent Operations">Run evidence workflow</button></div></div><div class="hero-meta">PSI-69 &nbsp;·&nbsp; DOI 10.60555/mbq8-0451<br>DATA SCOPE · ${dataset?.rows?.length ?? '—'} PUBLIC TABLE ROWS</div></div>`;
}
// Missing measurement cells across the summarized variables (computed, not hard-coded).
function missingCells() {
  return Object.values(analysis?.summary?.stats || {}).reduce((sum, s) => sum + s.missing, 0);
}
function overview() {
  return `${hero()}<div class="grid stats">${stat('OBSERVED RECORDS', dataset?.dataset?.records || '—', 'NASA PSI-69 experimental table', '◉')}${stat('MEASURED VARIABLES', '9', 'Different recorded fields', '∑')}${stat('MISSING CELLS', missingCells(), 'Measurements not reported; never imputed', '◌')}${stat('DATA ACCESS', 'PUBLIC', 'CC0-1.0 · source-linked', '↗')}</div><div class="grid two"><article class="card"><div class="card-head"><div><h3>Burning rate by test</h3><p class="sub">Observed table values · no interpolation · mm²/s</p></div><span class="tag obs">OBSERVED</span></div>${chartSVG(dataset.rows, 'burning_rate_mm_s', 'Burning-rate constant', 'mm²/s')}<div class="legend"><span>FLEX table record</span></div></article><article class="card"><div class="card-head"><div><h3>Evidence at a glance</h3><p class="sub">What this extract supports today</p></div><span class="tag comp">COMPUTED</span></div><div class="list-row"><span>Rows with burning rate</span><b>${analysis.summary.stats.burning_rate_mm_s.n} / ${dataset.rows.length}</b></div><div class="list-row"><span>Distinct recorded end states</span><b>${Object.keys(analysis.summary.outcomes).length}</b></div><div class="list-row"><span>Known missing measurement cells</span><b>${missingCells()}</b></div><div class="list-row"><span>Independent investigation DOI</span><b class="mono">10.60555/mbq8-0451</b></div><div class="callout warn" style="margin-top:14px">This is the full PSI-69 experimental table. It pools different fuels, pressures and diluent gases, so do not treat pooled values as one population of all FLEX tests.</div></article></div><div class="section-title"><div><h2>Current investigation</h2><p>Source and experimental context</p></div><button class="outline-btn" data-go="Dataset Explorer">Inspect dataset →</button></div><div class="grid three"><article class="card"><div class="eyebrow">INVESTIGATION</div><h3 style="margin-top:9px">Flame Extinguishment Experiment (FLEX)</h3><p class="sub">Droplet flame behavior and extinguishment under microgravity conditions aboard the International Space Station.</p></article><article class="card"><div class="eyebrow">MEASURED FIELDS</div><h3 style="margin-top:9px">Burning rate · Burn time · Diameter</h3><p class="sub">Source table reports test conditions, gas composition, droplet diameter, burning rate and terminal outcome.</p></article><article class="card"><div class="eyebrow">BOUNDARY</div><h3 style="margin-top:9px">Research context, not operational safety</h3><p class="sub">This prototype is not a certified spacecraft fire-safety or emergency-response system.</p></article></div>`;
}
function combustion() {
  return `${pageHead('Microgravity Combustion Lab', 'Explore measurements published for the NASA FLEX investigation.')}<div class="grid stats">${stat('FUELS', [...new Set(dataset.rows.map((r) => r.fuel))].join(' · '), `${dataset.rows.length} tests; compare within one fuel`, '◉')}${stat('PRESSURE RANGE', `${Math.min(...dataset.rows.map((r) => r.pressure_mmHg).filter(Number.isFinite))}–${Math.max(...dataset.rows.map((r) => r.pressure_mmHg).filter(Number.isFinite))}`, 'mmHg · observed rows', '↕')}${stat('BURN RATE RANGE', `${Math.min(...dataset.rows.map((r) => r.burning_rate_mm_s).filter(Number.isFinite)).toFixed(2)}–${Math.max(...dataset.rows.map((r) => r.burning_rate_mm_s).filter(Number.isFinite)).toFixed(2)}`, 'mm²/s · observed rows', '∑')}${stat('TERMINAL OUTCOMES', `${Object.keys(analysis.summary.outcomes).length}`, 'Labels preserved from source', '◌')}</div><div class="grid two"><article class="card"><div class="card-head"><div><h3>Burning rate sequence</h3><p class="sub">Table order, not a continuous time series</p></div><span class="tag obs">OBSERVED</span></div>${chartSVG(dataset.rows, 'burning_rate_mm_s', 'Burning-rate constant', 'mm²/s')}</article><article class="card"><div class="card-head"><div><h3>Extinction diameter</h3><p class="sub">Source units preserved · blank cell shown as missing</p></div><span class="tag obs">OBSERVED</span></div>${chartSVG(dataset.rows, 'visible_flame_extinction_diameter_mm', 'Flame diameter', 'mm', '#d59f45')}<div class="callout">${analysis.summary.stats.visible_flame_extinction_diameter_mm.missing} source rows have no visible-flame extinction diameter. The chart omits those points without imputing values.</div></article></div><article class="card" style="margin-top:15px"><div class="card-head"><div><h3>Investigation record</h3><p class="sub">PSI-69 · CC0-1.0 · experimental table</p></div><a class="outline-btn" href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-69" target="_blank" rel="noreferrer">NASA PSI source ↗</a></div>${rowsTable(dataset.rows)}</article>`;
}
function datasetPage() {
  return `${pageHead('Experiment Dataset Explorer', 'Browse source values and inspect the record-level metadata.')}<div class="grid two"><article class="card"><div class="card-head"><div><h3>${esc(dataset.dataset.name)}</h3><p class="sub">${esc(dataset.dataset.title)}</p></div><span class="tag obs">OBSERVED</span></div><div class="list-row"><span>Investigation ID</span><b class="mono">${dataset.dataset.id}</b></div><div class="list-row"><span>DOI</span><a href="https://doi.org/${dataset.dataset.doi}" target="_blank" rel="noreferrer" class="mono">${dataset.dataset.doi} ↗</a></div><div class="list-row"><span>License</span><b>${dataset.dataset.license}</b></div><div class="list-row"><span>Visible records</span><b>${dataset.dataset.records}</b></div><div class="list-row"><span>Fuel and environment</span><b>Methanol · ISS microgravity investigation</b></div></article><article class="card"><h3>Data dictionary</h3><p class="sub">Values and units reported by the NASA PSI page’s FLEX table.</p><div class="list-row"><span>pressure_mmHg</span><b>Ambient pressure · mmHg</b></div><div class="list-row"><span>oxygen_mole_fraction</span><b>Initial O₂ composition · unitless</b></div><div class="list-row"><span>initial_droplet_diameter_mm</span><b>Initial diameter · mm</b></div><div class="list-row"><span>burning_rate_mm_s</span><b>Burning-rate constant · mm²/s</b></div><div class="list-row"><span>burn_time_s</span><b>Burn time · s</b></div><div class="list-row"><span>visible_flame_extinction_diameter_mm</span><b>Visible flame extinction diameter · mm</b></div></article></div><article class="card" style="margin-top:15px"><div class="card-head"><div><h3>Source rows</h3><p class="sub">Blank source fields are preserved as missing values.</p></div><span class="tag">${dataset.validation.valid ? 'SCHEMA VALID' : 'SCHEMA ERROR'}</span></div>${rowsTable(dataset.rows)}</article><div class="callout warn" style="margin-top:14px">${esc(dataset.dataset.recordScope)} The full raw and analyzed experiment assets remain available through NASA PSI and may have separate file-level metadata or access conditions.</div>`;
}
const WB_VARIABLES = [
  ['burning_rate_mm_s', 'Burning-rate constant (mm²/s)'],
  ['initial_droplet_diameter_mm', 'Initial droplet diameter (mm)'],
  ['visible_flame_extinction_diameter_mm', 'Flame extinction diameter (mm)'],
  ['burn_time_s', 'Burn time (s)'],
  ['pressure_mmHg', 'Pressure (mmHg)'],
  ['oxygen_mole_fraction', 'Oxygen mole fraction'],
];
const WB_DEFAULT = { fuel: '', pressureBand: '', diluent: '', variable: 'burning_rate_mm_s' };
let wbFilter = { ...WB_DEFAULT };
const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');
function ciCell(ci) {
  if (!ci) return '—';
  if (ci.low === null)
    return `<span style="color:var(--muted)" title="${esc(ci.reason || '')}">${ci.n < 5 ? 'not reported (n &lt; 5)' : 'not reported'}</span>`;
  return `${fmt(ci.low)} – ${fmt(ci.high)}`;
}
function wbSelect(id, label, options, value) {
  return `<label style="font-size:10px;color:var(--muted)">${label} <select id="${id}">${options.map(([v, text]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
}
function wbGroupRow(label, g, bold = false) {
  const a = g.association,
    name = bold ? `<b>${esc(label)}</b>` : esc(label);
  return `<tr><td>${name}</td><td>${g.records}</td><td>${g.n}</td><td><b>${fmt(g.mean)}</b></td><td>${ciCell(g.ci95)}</td><td>${fmt(g.sampleSd)}</td><td>${a.r === null ? '—' : fmt(a.r)} <span style="color:var(--muted)">(n=${a.n})</span></td><td>${a.r === null ? '—' : ciCell(a.ci95)}</td></tr>`;
}
async function analysisPage() {
  const params = new URLSearchParams(Object.entries(wbFilter).filter(([, v]) => v));
  const wb = await get(`/api/analysis?${params}`);
  const c = wb.conditions,
    strata = wb.strata,
    filtered = Object.keys(wb.filter).length > 0,
    varLabel = WB_VARIABLES.find(([k]) => k === wbFilter.variable)?.[1] || wbFilter.variable,
    any = (label) => [['', label]];
  const bar = `<article class="card"><div class="card-head"><div><h3>Test-condition filter</h3><p class="sub">${esc(c.bandDefinition)} Diluent is the added inert gas (CO₂ or He); "no diluent" means O₂/N₂ only.</p></div><span class="tag obs">${wb.records} OF ${dataset.dataset.records} TESTS</span></div><div class="toolbar" style="margin:0">${wbSelect('wbFuel', 'Fuel', any('All fuels').concat(c.fuels.map((f) => [f.id, `${f.label} (${f.n})`])), wbFilter.fuel)}${wbSelect('wbBand', 'Pressure', any('All pressures').concat(c.pressureBands.map((b) => [b.id, `${b.label} · ${b.observed} (${b.n})`])), wbFilter.pressureBand)}${wbSelect('wbDiluent', 'Diluent', any('All diluents').concat(c.diluents.map((d) => [d.id, `${d.label} (${d.n})`])), wbFilter.diluent)}${wbSelect('wbVariable', 'Grouped variable', WB_VARIABLES, wbFilter.variable)}<button class="outline-btn" id="wbReset">Reset</button></div></article>`;
  if (!strata)
    return `${pageHead('Scientific Analysis Workbench', 'Reproducible summary statistics computed from source rows.')}${bar}<div class="callout warn" style="margin-top:15px">No bundled test matches ${esc(wb.conditionLabel)}. Nothing is computed for an empty stratum.</div>`;
  const st = wb.summary.stats,
    pooled = strata.pooled,
    boot = strata.bootstrap,
    highBand = c.pressureBands.find((b) => b.id === '>2atm');
  const metrics = Object.entries(st)
    .map(
      ([k, v]) =>
        `<article class="card metric"><div class="label">${k.replaceAll('_', ' ')}</div><strong>${v.mean === null ? '—' : v.mean.toFixed(3)}</strong><small>Mean · ${v.unit} · n=${v.n} · missing=${v.missing}</small><p class="sub">Sample SD ${v.sd === null ? '—' : v.sd.toFixed(3)} · range ${v.min ?? '—'}–${v.max ?? '—'}</p></article>`,
    )
    .join('');
  const table = `<article class="card" style="margin-top:15px"><div class="card-head"><div><h3>Per-condition results · ${esc(varLabel)}</h3><p class="sub">${esc(wb.conditionLabel)} · grouped by fuel, pressure band and diluent. 95% CIs are seeded percentile bootstrap intervals (seed ${boot.seed}, ${boot.resamples} resamples) and are not reported when n &lt; ${boot.minN}.</p></div><span class="tag comp">COMPUTED</span></div><div class="table-wrap"><table><thead><tr><th>Condition</th><th>Tests</th><th>n</th><th>Mean</th><th>95% CI (mean)</th><th>Sample SD</th><th>Pearson r · diameter vs burning rate</th><th>95% CI (r)</th></tr></thead><tbody>${wbGroupRow(filtered ? `${wb.conditionLabel} (all)` : 'All tests (pooled)', pooled, true)}${strata.groups.map((g) => wbGroupRow(g.label, g)).join('')}</tbody></table></div><div class="callout warn" style="margin-top:12px">${filtered ? 'Within each row, oxygen fraction, diluent fraction and droplet size still vary between tests.' : 'The first row pools different fuels, pressures and diluents; read the per-condition rows instead.'} The &gt;2 atm band spans about 2.0–3.1 atm and holds only ${highBand?.n ?? 0} tests. Intervals describe resampling of these records, not instrument uncertainty.</div></article>`;
  const assoc = `<article class="card"><div class="card-head"><div><h3>Exploratory association</h3><p class="sub">Initial droplet diameter vs. burning rate · ${esc(wb.conditionLabel)}</p></div><span class="tag comp">COMPUTED</span></div><div style="font-size:34px;font-weight:800;margin:18px 0">${wb.associations.r?.toFixed(3) ?? '—'}</div><p class="sub">Pearson r from n = ${wb.associations.n} paired values · 95% CI ${wb.associations.r === null ? '—' : ciCell(pooled.association.ci95)}. ${filtered ? 'Other test conditions still vary within this selection' : 'Tests pool different fuels, pressures and diluents'}, so this is unsuitable for causal claims.</p><div class="callout warn">No hypothesis test is run. Per-condition r values in the table are small-sample and exploratory.</div></article>`;
  const methods = `<article class="card"><h3>Methods & reproducibility</h3><div class="list-row"><span>Mean</span><b>Arithmetic mean</b></div><div class="list-row"><span>Spread</span><b>Sample standard deviation (n − 1)</b></div><div class="list-row"><span>Interval</span><b>95% percentile bootstrap · seed ${boot.seed} · ${boot.resamples} resamples · none if n &lt; ${boot.minN}</b></div><div class="list-row"><span>Grouping</span><b>Fuel · pressure band · diluent</b></div><div class="list-row"><span>Missing values</span><b>Excluded per variable; no imputation</b></div><div class="list-row"><span>Source table</span><b>NASA PSI-69 · official experimental table</b></div><div class="list-row"><span>Software</span><b>MORS AEGIS 3.0 · deterministic JS</b></div></article>`;
  const upload = `<article class="card" style="margin-top:15px"><div class="card-head"><div><h3>Import a CSV for local analysis</h3><p class="sub">Upload is processed in your browser. Required columns: initial_droplet_diameter_mm, burning_rate_mm_s. No file is sent to a server.</p></div></div><div class="upload"><input type="file" id="csvUpload" accept=".csv,text/csv"><span> · CSV, up to 5 MB</span></div><div id="uploadResult"></div></article>`;
  return `${pageHead('Scientific Analysis Workbench', 'Reproducible summary statistics computed from source rows, per test condition. Null values are excluded per variable.')}${bar}<div class="grid three" style="margin-top:15px">${metrics}</div>${table}<div class="grid two" style="margin-top:15px">${assoc}${methods}</div>${upload}`;
}
function comparePage() {
  return `${pageHead('Experiment Comparison Studio', 'Compare two FLEX tests. Differences are computed only when fuel and ambient gas composition match.')}<div class="grid two"><article class="card"><h3>Test A</h3><label class="field-label">Select record</label><select id="compareA" class="field">${dataset.rows.map((r) => `<option value="${esc(r.id)}">${esc(r.id)} · ${r.burning_rate_mm_s ?? '—'} mm²/s</option>`).join('')}</select><div id="compareResultA"></div></article><article class="card"><h3>Test B</h3><label class="field-label">Select record</label><select id="compareB" class="field">${dataset.rows.map((r, i) => `<option value="${esc(r.id)}" ${i === 1 ? 'selected' : ''}>${esc(r.id)} · ${r.burning_rate_mm_s ?? '—'} mm²/s</option>`).join('')}</select><div id="compareResultB"></div></article></div><article class="card" style="margin-top:15px"><div class="card-head"><div><h3>Paired variables</h3><p class="sub">Observed source values side by side</p></div><span class="tag obs">OBSERVED</span></div><div id="compareTable"></div></article><div class="callout warn" style="margin-top:14px">These are individual test records, not controlled matched groups. A displayed difference does not establish a physical effect.</div>`;
}
function renderCompare() {
  const a = dataset.rows.find((r) => r.id === $('#compareA').value),
    b = dataset.rows.find((r) => r.id === $('#compareB').value);
  for (const [id, r] of [
    ['compareResultA', a],
    ['compareResultB', b],
  ])
    $('#' + id).innerHTML =
      `<div style="margin:20px 0 5px;font-size:29px;font-weight:800">${r.burning_rate_mm_s ?? '—'} <small style="font-size:11px;color:var(--muted)">mm²/s</small></div><p class="sub">${r.date} ${r.time_utc ?? '—'} UTC · ${r.test_end}</p>`;
  // Same rule as the server's compareExperiments: differences are only computed between tests
  // with the same fuel and ambient gas composition; observed values are always shown.
  const conditions = [
    'fuel',
    'oxygen_mole_fraction',
    'nitrogen_mole_fraction',
    'carbon_dioxide_mole_fraction',
    'helium_mole_fraction',
  ];
  const mismatched = conditions.filter((k) => a[k] == null || b[k] == null || a[k] !== b[k]);
  const comparable = a.id !== b.id && mismatched.length === 0;
  const keys = [
    ...conditions,
    'pressure_mmHg',
    'initial_droplet_diameter_mm',
    'visible_flame_extinction_diameter_mm',
    'burning_rate_mm_s',
    'burn_time_s',
  ];
  const difference = (k) =>
    !conditions.includes(k) && comparable && Number.isFinite(a[k]) && Number.isFinite(b[k])
      ? (b[k] - a[k]).toFixed(3)
      : '—';
  const notice = comparable
    ? ''
    : `<div class="callout warn" style="margin-bottom:12px">${a.id === b.id ? 'Select two different tests.' : `Differences withheld: these tests differ in ${mismatched.map((k) => k.replaceAll('_', ' ')).join(', ')}. Compare tests run under the same fuel and gas composition.`}</div>`;
  $('#compareTable').innerHTML =
    `${notice}<table><thead><tr><th>Variable</th><th>${esc(a.id)}</th><th>${esc(b.id)}</th><th>Difference · B − A</th></tr></thead><tbody>${keys.map((k) => `<tr${mismatched.includes(k) ? ' class="mismatch"' : ''}><td>${k.replaceAll('_', ' ')}</td><td>${esc(a[k] ?? '—')}</td><td>${esc(b[k] ?? '—')}</td><td>${difference(k)}</td></tr>`).join('')}</tbody></table>`;
}
function discovery() {
  return `${pageHead('Scientific Discovery Center', 'Candidate research questions are labeled as hypotheses; the bundled table does not validate them.')}<div class="grid three"><article class="card"><span class="tag inf">HYPOTHESIS</span><h3 style="margin-top:12px">How does initial droplet size relate to burning rate?</h3><p class="sub">Explore across more FLEX conditions, stratified by fuel, pressure and gas composition. Current n = 5 and all rows are methanol.</p></article><article class="card"><span class="tag inf">HYPOTHESIS</span><h3 style="margin-top:12px">Do terminal outcomes track measured burn duration?</h3><p class="sub">The shown table includes both extinction and disruption labels, but outcomes depend on test conditions that vary across rows.</p></article><article class="card"><span class="tag comp">EVIDENCE GAP</span><h3 style="margin-top:12px">Fetch full dataset with conditions and definitions</h3><p class="sub">Inspect file-level metadata, acquisition methods and processing notes before confirmatory analysis.</p><a href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-69" target="_blank" rel="noreferrer">Open PSI record ↗</a></article></div><article class="card" style="margin-top:15px"><h3>Review checklist</h3><div class="list-row"><span>Observed measurements traceable to investigation?</span><b>Yes · PSI-69 / DOI linked</b></div><div class="list-row"><span>Measurement units retained?</span><b>Yes · field-level labels shown</b></div><div class="list-row"><span>Inference suitable for generalization?</span><b>No · pooled conditions, no uncertainty model</b></div><div class="list-row"><span>Source-data completeness verified?</span><b>No · full archive not ingested</b></div></article>`;
}
function earthPage() {
  return `${pageHead('Earth Fire Intelligence', 'NASA FIRMS satellite hotspot observations. Use bounded regions; detections are not complete fire perimeters.')}<div class="toolbar"><select id="fireRegion"><option value="-125,32,-114,42">California · US</option><option value="-127,48,-116,55">British Columbia · Canada</option><option value="-75,-5,-45,10">Amazon basin</option><option value="95,5,125,25">Southeast Asia</option><option value="" disabled>Global request disabled · source-volume protection</option></select><select id="fireDays"><option value="1">Last 1 day</option><option value="3">Last 3 days</option><option value="5">Last 5 days</option></select><button id="loadFires" class="primary-btn">Load live detections</button><span class="tag" id="fireStatus">NOT LOADED</span></div><div class="grid two"><article class="card"><div class="mapbox"><canvas id="fireMap"></canvas><span class="map-label">VIIRS · ACTIVE FIRE DETECTIONS</span></div><p class="sub" id="mapCaption">No live observations loaded. No fabricated detections are plotted.</p></article><article class="card"><div class="card-head"><div><h3>Observation summary</h3><p class="sub">Filtered NRT records returned by NASA FIRMS</p></div><span class="tag obs">OBSERVED</span></div><div id="fireStats"><div class="empty">Choose an area and request data. A valid NASA FIRMS MAP_KEY is required.</div></div></article></div><article class="card" style="margin-top:15px"><h3>Sensor and interpretation notes</h3><p class="sub">VIIRS SNPP near-real-time product. Confidence category is retained as delivered. Hotspot detections are not direct measurements of a fire’s total extent, heat release, or damage.</p><div class="callout">Data status appears as LIVE only after a successful source response. On error, the map stays empty; no cached or synthetic detections are substituted.</div></article>`;
}
function habitat() {
  return `${pageHead('Habitat Environmental Research', 'Research interface scaffold. No authorized habitat telemetry was supplied in the current dataset.')}<div class="callout warn">No real astronaut or habitat measurements are bundled. Synthetic telemetry is not shown as observed data.</div><article class="card" style="margin-top:15px"><div class="card-head"><div><h3>Space weather context · NASA DONKI Solar Flares</h3><p class="sub">Independent solar observation notices; they do not measure cabin conditions or crew exposure.</p></div><button id="loadDonki" class="outline-btn">Load last 7 days</button></div><div id="donkiResult" class="sub">Not loaded. Request is made only when selected.</div></article><div class="grid three" style="margin-top:15px">${['Cabin pressure', 'CO₂ concentration', 'Particulate matter'].map((x) => `<article class="card"><span class="tag">NO DATA</span><h3 style="margin:12px 0 7px">${x}</h3><p class="sub">Connect a documented, authorized dataset to enable trend and anomaly analysis.</p></article>`).join('')}</div><article class="card" style="margin-top:15px"><h3>Research-only boundary</h3><p class="sub">This interface is not a certified spacecraft monitoring system, clinical product, or emergency-response tool. No astronaut health records are collected or represented.</p></article>`;
}
function quantum() {
  return `${pageHead('AEGIS Quantum Lab', 'Small deterministic statevector simulation for learning; no quantum hardware used.')}<div class="grid two"><article class="card"><div class="card-head"><div><h3>Single-qubit Hadamard experiment</h3><p class="sub">Apply H to initial state |0⟩ with a reproducible classical statevector simulation.</p></div><span class="badge-sim">SIMULATED · CLASSICAL CPU</span></div><div class="circuit"><div class="qbit">|0⟩</div><div class="line"></div><div class="qbit">H</div><div class="line"></div><div class="qbit">${Math.sqrt(0.5).toFixed(3)}|0⟩ + ${Math.sqrt(0.5).toFixed(3)}|1⟩</div></div><div class="list-row"><span>Statevector</span><b class="mono">[0.7071, 0.7071]</b></div><div class="list-row"><span>Measurement probabilities</span><b>P(0)=0.5 · P(1)=0.5</b></div><div class="list-row"><span>Backend</span><b>Built-in complex arithmetic · seed not needed</b></div></article><article class="card"><h3>Interpretation and boundary</h3><p class="sub">The Hadamard transform is an exact textbook result and is computed here from a classical statevector. It is unrelated to FLEX flame analysis and does not establish quantum advantage.</p><div class="callout warn">No Qiskit installation or quantum device is available in this runtime. This compact demonstration is not a Qiskit benchmark.</div><button class="outline-btn" style="margin-top:14px" id="quantumReset">Reset state</button></article></div>`;
}
function agents() {
  return `${pageHead('AI Agent Operations Center', 'Run the typed acquisition, validation, analysis and evidence workflow. Deterministic calculations remain outside the language model.')}<div class="grid two"><article class="card"><div class="card-head"><div><h3>Workflow run</h3><p class="sub">Each role reports what it actually did, including not-run stages.</p></div><button id="runWorkflow" class="primary-btn">Run review workflow</button></div><div id="workflowStages"><div class="empty">No run yet. Start the workflow to process the bundled source rows.</div></div></article><article class="card"><h3>Evidence summary</h3><div id="workflowSummary"><p class="sub">Run ID, checks and source provenance will appear here.</p></div><div class="callout warn" style="margin-top:12px">This is a local orchestrated workflow with deterministic specialists. The AI copilot is the only generative agent; the product does not claim autonomous independent model consensus.</div></article></div>`;
}
function copilot() {
  const ar = lang === 'ar';
  return `${pageHead(ar ? 'مساعد أبحاث MORS AEGIS' : 'AEGIS AI Research Chat', ar ? 'محادثة بحثية مرتبطة ببيانات NASA PSI-69 مع إظهار المصدر والقيود.' : 'Ask about the FLEX evidence, methods, or limitations. Answers distinguish source observations from computed results.')}<article class="card chat-shell"><div class="chat-top"><div class="chat-brand"><div class="chat-avatar">✧</div><div><h3>${ar ? 'مساعد البحث العلمي' : 'AEGIS Research Assistant'}</h3><p class="sub">${ar ? 'NASA PSI-69 · جدول التجارب الكامل · DOI 10.60555/mbq8-0451' : 'NASA PSI-69 · full experimental table · DOI 10.60555/mbq8-0451'}</p></div></div><div class="chat-top-actions"><span class="tag" id="copilotMode">Checking provider…</span><button class="outline-btn" id="newChat" type="button">${ar ? 'محادثة جديدة' : 'New chat'}</button></div></div><div class="chat-context"><span class="tag obs">OBSERVED · PSI-69</span><span class="tag comp">COMPUTED · descriptive statistics</span><span class="tag">${ar ? 'السجل محفوظ محليًا في هذا المتصفح' : 'Chat saved locally in this browser'}</span></div><div class="chat-log" id="chatLog" role="log" aria-live="polite" aria-relevant="additions text"></div><div id="chatTyping" class="chat-typing" hidden>${ar ? 'يفحص الأدلة…' : 'Checking the evidence…'}</div><div class="chat-suggestions" id="chatSuggestions"><button class="suggestion" data-question="What is the mean burning rate, and how was it computed?">Mean burning rate</button><button class="suggestion" data-question="What do these records tell us about droplet diameter and burning rate?">Explore relationship</button><button class="suggestion" data-question="What are the main limitations of this table?">Evidence limits</button></div><div class="chat-compose"><form id="chatForm"><textarea class="field" id="question" rows="2" maxlength="1500" required aria-label="Message AEGIS research assistant" placeholder="${ar ? 'اكتب سؤالك عن الأدلة…' : 'Message AEGIS about the evidence…'}"></textarea><button class="primary-btn chat-send" id="chatSend" type="submit">${ar ? 'إرسال ↑' : 'Send ↑'}</button></form><div class="chat-disclosure">${ar ? 'تُحفظ المحادثة في تخزين المتصفح فقط. لا تدخل معلومات شخصية أو سرية.' : 'Conversation is stored in this browser only. Do not enter personal or confidential information.'} · ${ar ? 'قد يستخدم السؤال Gemini إذا كانت الخدمة متاحة؛ وإلا يظهر ملخص محلي محدد بوضوح.' : 'Questions may be sent to Gemini when configured; otherwise a clearly labeled local summary is shown.'}</div></div></article>`;
}
async function sourcesPage() {
  const { sources } = await get('/api/sources');
  return `${pageHead('Scientific Source Registry', 'Authoritative sources, documented access modes, and current credential availability.')}<article class="card"><div class="table-wrap"><table><thead><tr><th>Source</th><th>Domain</th><th>Access</th><th>Mode</th><th>Credential</th><th></th></tr></thead><tbody>${sources.map((s) => `<tr><td><b>${esc(s.name)}</b><br><span style="color:var(--muted)">${esc(s.note)}</span></td><td>${esc(s.domain)}</td><td>${esc(s.access)}</td><td><span class="status ${s.mode === 'not-used' ? 'off' : s.configured ? '' : 'pending'}">${s.mode.toUpperCase()}</span></td><td>${s.configured ? 'AVAILABLE' : 'NOT DETECTED'}</td><td><a href="${esc(s.url)}" target="_blank" rel="noreferrer">Open ↗</a></td></tr>`).join('')}</tbody></table></div></article><div class="callout warn" style="margin-top:14px">A credential being present does not certify connectivity or authorization. NASA Open API credentials are not used by the current research workflow because the selected PSI source is more relevant.</div>`;
}
function provenance() {
  return `${pageHead('Evidence & Provenance Explorer', 'Follow each value from public source record through calculation and interpretation.')}<div class="grid two"><article class="card"><span class="tag obs">OBSERVED</span><h3 style="margin:12px 0 7px">Source measurement rows</h3><p class="sub">NASA PSI-69 FLEX · DOI 10.60555/mbq8-0451 · public investigation page table</p><a href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-69" target="_blank" rel="noreferrer">Open source record ↗</a></article><article class="card"><span class="tag comp">COMPUTED</span><h3 style="margin:12px 0 7px">Null-aware descriptive statistics</h3><p class="sub">Arithmetic mean and sample standard deviation per variable; rows with missing values excluded for that variable.</p><b>Pipeline: read CSV → validate ranges → summarize</b></article></div><article class="card" style="margin-top:15px"><h3>Traceability ledger</h3><div class="list-row"><span class="mono">DS-PSI69-FLEX-TABLE-V1</span><b>Official PSI-69 experimental table · corrections in flex-psi69-quality.json</b></div><div class="list-row"><span class="mono">CALC-DESC-001</span><b>Summary statistics · reproducible from CSV and formula notes</b></div><div class="list-row"><span class="mono">AI-INTERPRETATION</span><b>Separate from computed data · provider/model disclosed</b></div><div class="list-row"><span class="mono">LIMITATION-001</span><b>Selection context and full archive not yet ingested</b></div></article>${rowsTable(dataset.rows)}`;
}
function reports() {
  return `${pageHead('Scientific Reports Center', 'Export reproducible source rows, analysis results, or a printable research summary.')}<div class="grid three"><article class="card"><div class="eyebrow">DATA</div><h3 style="margin:10px 0">Source table</h3><p class="sub">Observed rows and field names from NASA PSI-69.</p><button class="outline-btn" id="downloadCsv">Download CSV</button></article><article class="card"><div class="eyebrow">REPRODUCIBILITY</div><h3 style="margin:10px 0">Analysis package</h3><p class="sub">JSON with source metadata, summary stats, validation and limitations.</p><button class="outline-btn" id="downloadJson">Download JSON</button></article><article class="card"><div class="eyebrow">PRESENTATION</div><h3 style="margin:10px 0">Scientific summary</h3><p class="sub">Open a clean, printable report and use Save as PDF from your browser.</p><button class="outline-btn" id="printReport">Print / Save PDF</button></article></div><div class="callout" style="margin-top:15px">Exports preserve evidence labels and include the DOI, units, methods and current limitations. AI interpretation is never presented as an experimentally verified result.</div>`;
}
async function health() {
  const h = await get('/api/health');
  $('#dataMode').textContent = h.credentials.firms ? 'FIRMS key detected' : 'Bundled NASA table · offline';
  return h;
}
async function system() {
  const h = await get('/api/health');
  return `${pageHead('System Health & API Monitoring', 'Runtime status, configured secret presence and source connectivity boundaries.')}<div class="grid stats">${stat('APPLICATION', h.status.toUpperCase(), 'Node.js · loopback binding', '✓')}${stat('FIRMS MAP KEY', h.credentials.firms ? 'DETECTED' : 'NOT DETECTED', 'Value never returned to browser', '◉')}${stat('NASA DONKI', h.credentials.donki ? 'DETECTED' : 'NOT DETECTED', 'Solar flare context · server-side key', '☼')}${stat('GEMINI', h.credentials.gemini ? 'DETECTED' : 'NOT DETECTED', 'Interactions API · key server-side', '✧')}</div><article class="card" style="margin-top:15px"><h3>Provider tests</h3><div class="list-row"><span>NASA PSI investigation page</span><b class="status">SOURCE METADATA LOADED</b></div><div class="list-row"><span>NASA FIRMS VIIRS feed</span><b class="status pending">TEST ON REQUEST</b></div><div class="list-row"><span>NOAA SWPC Kp JSON</span><button id="testNoaa" class="outline-btn">Test public feed</button></div><div class="list-row"><span>NASA DONKI Solar Flare</span><button id="testDonki" class="outline-btn">Test live feed</button></div><div class="list-row"><span>Gemini Interactions API</span><b>${h.credentials.gemini ? 'KEY PRESENT · TEST ON CHAT' : 'NO KEY DETECTED'}</b></div><div id="noaaResult" class="sub"></div><div id="donkiTestResult" class="sub"></div></article><article class="card" style="margin-top:15px"><h3>Reliability controls</h3><p class="sub">Loopback-only default · file-size limits · bounded JSON input · rate limits on Gemini/FIRMS/DONKI · no credential values in API responses or logs · no synthetic observations on source failure.</p></article>`;
}
function workspace() {
  return `${pageHead('Research Project Workspace', 'Save a local question, bind it to the PSI-69 table, and create a reproducible analysis run.')}<div class="grid two"><article class="card"><label class="field-label">Project name</label><input id="projectName" class="field" value="FLEX droplet behavior review"><label class="field-label">Research question</label><textarea id="projectQuestion" class="field" rows="3" placeholder="What relationship do you want to explore?">How do initial droplet diameter and burning rate vary across the visible PSI-69 records?</textarea><label class="field-label">Dataset</label><select class="field" disabled><option>NASA PSI-69 FLEX · experimental table</option></select><button id="saveProject" class="primary-btn" style="margin-top:14px">Save local project</button></article><article class="card"><h3>Research steps</h3>${['Question & scope', 'Dataset provenance', 'Data validation', 'Deterministic analysis', 'Limitations review', 'Report export'].map((x, i) => `<div class="workflow-stage"><span class="stepnum">${i + 1}</span><div><b>${x}</b><p>${i === 1 ? 'PSI-69 · DOI 10.60555/mbq8-0451' : i === 3 ? 'Null-aware descriptive summary' : i === 4 ? 'Pooled test conditions; not population-representative' : 'Included in local workflow'}</p></div></div>`).join('')}</article></div><div id="savedProject" style="margin-top:14px"></div>`;
}
function settings() {
  return `${pageHead('Settings & Theme Manager', 'Appearance and language preferences are saved in this browser.')}<div class="grid two"><article class="card"><h3>Visual theme</h3><p class="sub">Three MORS themes preserve the same evidence labels and reading order.</p>${[
    ['arctic', 'MORS Arctic', 'Light research surfaces with blue accents'],
    ['space', 'MORS Deep Space', 'Dark navy mission-control palette'],
    ['observatory', 'MORS Observatory', 'Neutral lab surfaces with dark data panels'],
  ]
    .map(
      ([v, n, d]) =>
        `<div class="list-row"><span><b>${n}</b><br><small>${d}</small></span><button class="outline-btn" data-theme="${v}">${theme === v ? 'Active' : 'Apply'}</button></div>`,
    )
    .join(
      '',
    )}</article><article class="card"><h3>Language</h3><p class="sub">Core interface navigation supports English and Arabic RTL layout.</p><div class="list-row"><span>English</span><button class="outline-btn" data-lang="en">${lang === 'en' ? 'Active' : 'Apply'}</button></div><div class="list-row"><span>العربية</span><button class="outline-btn" data-lang="ar">${lang === 'ar' ? 'نشط' : 'تطبيق'}</button></div><div class="callout" style="margin-top:15px">Some scientific field names and source values remain in their original English names for traceability.</div></article></div>`;
}
const pageMap = {
  'Research Explorer': explorerShell,
  Overview: overview,
  'Combustion Lab': combustion,
  'Dataset Explorer': datasetPage,
  'Analysis Workbench': analysisPage,
  'Comparison Studio': comparePage,
  'Discovery Center': discovery,
  'Earth Fire': earthPage,
  'Habitat Research': habitat,
  'Quantum Lab': quantum,
  'Agent Operations': agents,
  'AI Copilot': copilot,
  Sources: sourcesPage,
  Provenance: provenance,
  Reports: reports,
  'System Health': system,
  'Research Workspace': workspace,
  Settings: settings,
  'Scientific Core': () => '<div id="coreMount"></div>',
  'Challenge Mode': () => '<div id="coreMount"></div>',
  'Computer Vision': () => '<div id="visionMount"></div>',
  'Earth 3D': () => '<div id="earthMount"></div>',
};
async function go(name) {
  const id = ++navigationId;
  if (viewCleanup) {
    viewCleanup();
    viewCleanup = null;
  }
  current = name;
  renderNav();
  $('#pageTitle').textContent = nav.find((n) => n[0] === name)?.[1] || name;
  $('#crumb').textContent = 'MORS AEGIS / ' + name.toUpperCase();
  const c = $('#content');
  c.innerHTML = '<div class="empty">Loading research view…</div>';
  try {
    const html = await pageMap[name]();
    if (id !== navigationId) return;
    c.innerHTML = html;
    bindPage();
    if (name === 'Research Explorer') mountExplorer(c.querySelector('#researchExplorer'), dataset, toast);
    if (name === 'Scientific Core' || name === 'Challenge Mode')
      await mountResearchCore(c.querySelector('#coreMount'), name === 'Challenge Mode' ? 'challenge' : 'analysis');
    if (id !== navigationId) return;
    if (name === 'Computer Vision') viewCleanup = mountVisionLab(c.querySelector('#visionMount'));
    if (name === 'Earth 3D') viewCleanup = mountEarthGlobe(c.querySelector('#earthMount'));
    if (name === 'Comparison Studio') renderCompare();
    if (name === 'AI Copilot') {
      const provider = (await get('/api/health')).credentials.gemini;
      if (id === navigationId)
        $('#copilotMode').textContent = provider ? 'GEMINI CONFIGURED · CHECKED PER REPLY' : 'LOCAL EVIDENCE MODE';
    }
  } catch (e) {
    if (id === navigationId)
      c.innerHTML = `<div class="callout warn">View could not be loaded: ${esc(e.message)}</div>`;
  }
}
function persistChat() {
  try {
    localStorage.setItem('mors-chat-v1', JSON.stringify(chatThread.slice(-60)));
  } catch {
    toast('Local chat history could not be saved in this browser.');
  }
}
function addChatMessage(log, message) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${message.role}`;
  const meta = document.createElement('div');
  meta.className = 'bubble-meta';
  meta.textContent =
    message.role === 'user' ? (lang === 'ar' ? 'أنت' : 'YOU') : message.provider || 'AEGIS · LOCAL EVIDENCE';
  const body = document.createElement('div');
  body.className = 'bubble-body';
  body.textContent = message.content;
  bubble.append(meta, body);
  if (message.role === 'assistant') {
    if (Array.isArray(message.toolsExecuted) && message.toolsExecuted.length) {
      const details = document.createElement('details'),
        summary = document.createElement('summary'),
        pre = document.createElement('pre');
      summary.textContent = lang === 'ar' ? 'أدوات التحليل المنفذة' : 'Executed analysis tools';
      pre.textContent = message.toolsExecuted
        .map(
          (item) =>
            `${item.tool}: ${item.status} · ${item.evidence}${item.resultSha256 ? ` · SHA-256 ${item.resultSha256}` : ''}`,
        )
        .join('\n');
      details.append(summary, pre);
      bubble.append(details);
    }
    const cite = document.createElement('div');
    cite.className = 'bubble-citation';
    cite.textContent =
      lang === 'ar'
        ? 'المصدر: NASA PSI-69 · DOI 10.60555/mbq8-0451 · '
        : 'Source: NASA PSI-69 · DOI 10.60555/mbq8-0451 · ';
    const link = document.createElement('a');
    link.href = 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-69';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = lang === 'ar' ? 'فتح سجل NASA' : 'Open NASA record';
    cite.append(link);
    bubble.append(cite);
  }
  log.append(bubble);
}
function renderChat() {
  const log = $('#chatLog');
  if (!log) return;
  log.replaceChildren();
  if (!chatThread.length) {
    addChatMessage(log, {
      role: 'assistant',
      provider: lang === 'ar' ? 'مساعد الأبحاث' : 'AEGIS · RESEARCH ASSISTANT',
      content:
        lang === 'ar'
          ? 'مرحبًا. اسأل عن قياسات FLEX أو طرق الحساب أو حدود الأدلة. سأوضح إن كانت الإجابة قياسًا مرصودًا أم حسابًا وصفيًا، وسأشير عندما لا تكفي السجلات الخمسة.'
          : 'Hello. Ask about FLEX measurements, calculations, or evidence limits. I will distinguish observations from computed summaries and flag questions this table cannot answer.',
    });
  } else chatThread.forEach((message) => addChatMessage(log, message));
  log.scrollTop = log.scrollHeight;
}
async function submitChat(event) {
  event.preventDefault();
  if (chatBusy) return;
  const input = $('#question'),
    question = input.value.trim();
  if (!question) return;
  const history = chatThread.slice(-8).map(({ role, content }) => ({ role, content }));
  chatThread.push({ role: 'user', content: question });
  persistChat();
  renderChat();
  input.value = '';
  chatBusy = true;
  $('#chatTyping').hidden = false;
  $('#chatSend').disabled = true;
  try {
    const result = await post('/api/copilot', { question, history });
    const provider =
      result.status === 'live'
        ? `AI INTERPRETATION · GEMINI ${result.model || ''}`
        : (result.provider || 'DETERMINISTIC LOCAL SUMMARY').toUpperCase();
    chatThread.push({
      role: 'assistant',
      content: result.answer || 'No text was returned. Please try again.',
      provider,
      citation: true,
      toolsExecuted: result.toolsExecuted || [],
    });
  } catch {
    const mean = analysis?.summary?.stats?.burning_rate_mm_s?.mean;
    chatThread.push({
      role: 'assistant',
      provider: 'DETERMINISTIC LOCAL SUMMARY · REQUEST FAILED',
      citation: true,
      content: `The AI request could not be completed. Local evidence: ${dataset?.dataset?.records ?? 0} PSI-69 table rows; computed mean burning rate ${Number.isFinite(mean) ? mean.toFixed(3) + ' mm²/s' : 'not available'}. These pooled records cannot establish causality or represent every FLEX test. Source DOI: 10.60555/mbq8-0451.`,
    });
  } finally {
    chatBusy = false;
    persistChat();
    if ($('#chatTyping')) $('#chatTyping').hidden = true;
    if ($('#chatSend')) $('#chatSend').disabled = false;
    if ($('#chatLog')) {
      renderChat();
      if ($('#question')) $('#question').focus();
    }
  }
}
function bindPage() {
  document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
  if ($('#compareA')) {
    $('#compareA').onchange = renderCompare;
    $('#compareB').onchange = renderCompare;
  }
  if ($('#runWorkflow'))
    $('#runWorkflow').onclick = async () => {
      const btn = $('#runWorkflow');
      btn.disabled = true;
      btn.textContent = 'Reviewing…';
      try {
        workflow = await post('/api/workflow');
        $('#workflowStages').innerHTML = workflow.stages
          .map(
            (s, i) =>
              `<div class="workflow-stage"><span class="stepnum">${String(i + 1).padStart(2, '0')}</span><div><b>${esc(s.agent)}</b><p>${esc(s.detail)}</p></div><span class="status ${s.status === 'not-run' || s.status === 'available-if-configured' ? 'off' : s.status === 'failed' ? 'pending' : ''}">${esc(s.status.toUpperCase())}</span></div>`,
          )
          .join('');
        $('#workflowSummary').innerHTML =
          `<div class="list-row"><span>Run ID</span><b class="mono">${workflow.runId}</b></div><div class="list-row"><span>Status</span><b>${workflow.status}</b></div><div class="list-row"><span>Rows checked</span><b>${workflow.quality.rows}</b></div><div class="list-row"><span>Provenance</span><b>${workflow.provenance.doi}</b></div>`;
        toast('Evidence workflow complete');
      } catch (e) {
        toast(e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Run review workflow';
      }
    };
  if ($('#chatForm')) {
    renderChat();
    $('#chatForm').onsubmit = submitChat;
    $('#question').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!chatBusy) $('#chatForm').requestSubmit();
      }
    });
    $('#newChat').onclick = () => {
      if (
        chatThread.length &&
        !window.confirm(
          lang === 'ar'
            ? 'بدء محادثة جديدة؟ سيُمسح سجل هذه المحادثة من هذا المتصفح.'
            : 'Start a new chat? This clears this conversation from this browser.',
        )
      )
        return;
      chatThread = [];
      persistChat();
      renderChat();
    };
    document.querySelectorAll('[data-question]').forEach(
      (b) =>
        (b.onclick = () => {
          if (chatBusy) return;
          $('#question').value = b.dataset.question;
          $('#question').focus();
        }),
    );
  }
  for (const [id, key] of [
    ['#wbFuel', 'fuel'],
    ['#wbBand', 'pressureBand'],
    ['#wbDiluent', 'diluent'],
    ['#wbVariable', 'variable'],
  ])
    if ($(id))
      $(id).onchange = (e) => {
        wbFilter = { ...wbFilter, [key]: e.target.value };
        go('Analysis Workbench');
      };
  if ($('#wbReset'))
    $('#wbReset').onclick = () => {
      wbFilter = { ...WB_DEFAULT };
      go('Analysis Workbench');
    };
  if ($('#csvUpload'))
    $('#csvUpload').onchange = async (e) => {
      const f = e.target.files[0],
        out = $('#uploadResult');
      if (!f) return;
      if (f.size > 5_000_000) {
        out.innerHTML = '<p class="sub">File exceeds 5 MB.</p>';
        return;
      }
      try {
        const rows = parseCSVClient(await f.text()),
          required = ['initial_droplet_diameter_mm', 'burning_rate_mm_s'];
        if (rows.length > 5000) throw Error('CSV is limited to 5,000 rows.');
        if (!required.every((k) => Object.hasOwn(rows[0], k))) throw Error('Required measurement columns are missing.');
        const pts = rows
          .map((r) => ({
            ...r,
            [required[0]]: strictNumber(r[required[0]]),
            [required[1]]: strictNumber(r[required[1]]),
          }))
          .filter((r) => Number.isFinite(r[required[0]]) && Number.isFinite(r[required[1]]));
        if (!pts.length) throw Error('No valid numeric measurement pairs found.');
        const corr = pearsonLocal(pts);
        out.innerHTML = `<div class="callout good" style="margin-top:12px">Parsed ${pts.length} valid pairs from ${rows.length} rows in this browser. Exploratory Pearson r: ${Number.isFinite(corr) ? corr.toFixed(3) : 'undefined for constant values'}. The file was not uploaded; verify its source, units and experimental context before interpretation.</div>`;
      } catch (err) {
        out.innerHTML = `<div class="callout warn" style="margin-top:12px">${esc(err.message)}</div>`;
      }
    };
  if ($('#loadFires')) $('#loadFires').onclick = loadFires;
  if ($('#testNoaa'))
    $('#testNoaa').onclick = async () => {
      const x = $('#noaaResult');
      x.textContent = 'Requesting feed…';
      try {
        const j = await get('/api/noaa');
        x.textContent = `${j.status.toUpperCase()} · ${j.data?.length || 0} recent rows from NOAA SWPC`;
      } catch (e) {
        x.textContent = e.message;
      }
    };
  if ($('#loadDonki')) $('#loadDonki').onclick = loadDonki;
  if ($('#testDonki'))
    $('#testDonki').onclick = async () => {
      const x = $('#donkiTestResult');
      x.textContent = 'Testing NASA DONKI…';
      try {
        const j = await get('/api/donki');
        x.textContent = `${j.status.toUpperCase()} · ${j.data.length} solar flare records · ${j.window.start} to ${j.window.end}`;
      } catch (e) {
        x.textContent = e.message;
      }
    };
  async function loadDonki() {
    const x = $('#donkiResult');
    x.textContent = 'Requesting NASA DONKI…';
    try {
      const j = await get('/api/donki');
      x.innerHTML = `<span class="status">LIVE · ${j.data.length} events</span><p>Window ${esc(j.window.start)} – ${esc(j.window.end)} · ${esc(j.source)}</p>${
        j.data.length
          ? `<div class="table-wrap"><table><thead><tr><th>Begin time</th><th>Class</th><th>Instrument</th><th>Source link</th></tr></thead><tbody>${j.data
              .map((e) => {
                const link = safeNasaHref(e.link);
                return `<tr><td>${esc(e.beginTime)}</td><td>${esc(e.classType || '—')}</td><td>${esc(e.instruments?.map((i) => i.displayName).join(', ') || '—')}</td><td>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">DONKI event ↗</a>` : '—'}</td></tr>`;
              })
              .join('')}</tbody></table></div>`
          : '<p>No FLR records returned for this interval.</p>'
      }<div class="callout">These are solar flare notifications, not spacecraft cabin sensor measurements.</div>`;
    } catch (e) {
      x.innerHTML = `<div class="callout warn">${esc(e.message)}. No records are substituted.</div>`;
    }
  }
  if ($('#chatLog')) $('#chatLog').scrollTop = $('#chatLog').scrollHeight;
  if ($('#downloadCsv'))
    $('#downloadCsv').onclick = () => download('mors-aegis-psi69-flex.csv', awaitlessCSV(), 'text/csv');
  if ($('#downloadJson'))
    $('#downloadJson').onclick = () =>
      download('mors-aegis-report.json', JSON.stringify(report(), null, 2), 'application/json');
  if ($('#printReport')) $('#printReport').onclick = printSummary;
  if ($('#quantumReset')) $('#quantumReset').onclick = () => toast('State reset: |0⟩ → H → equal superposition');
  if ($('#saveProject'))
    $('#saveProject').onclick = () => {
      const p = {
        name: $('#projectName').value,
        question: $('#projectQuestion').value,
        dataset: 'PSI-69',
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem('mors-project', JSON.stringify(p));
      $('#savedProject').innerHTML =
        `<div class="callout good">Saved locally in this browser: <b>${esc(p.name)}</b>. No server storage configured.</div>`;
    };
  document.querySelectorAll('[data-theme]').forEach(
    (b) =>
      (b.onclick = () => {
        theme = b.dataset.theme;
        localStorage.setItem('mors-theme', theme);
        setTheme();
        go(current);
      }),
  );
  document.querySelectorAll('[data-lang]').forEach(
    (b) =>
      (b.onclick = () => {
        lang = b.dataset.lang;
        localStorage.setItem('mors-lang', lang);
        setTheme();
        $('#langBtn').textContent = lang === 'ar' ? 'English' : 'عربي';
        renderNav();
        go(current);
      }),
  );
}
function awaitlessCSV() {
  const keys = Object.keys(dataset.rows[0]);
  return (
    [keys, ...dataset.rows.map((r) => keys.map((k) => r[k]))].map((row) => row.map(csvCell).join(',')).join('\r\n') +
    '\r\n'
  );
}
function report() {
  return {
    product: 'MORS AEGIS',
    evidence_classification: 'OBSERVED source rows → COMPUTED summary',
    dataset: dataset.dataset,
    rows: dataset.rows,
    analysis: analysis,
    workflow: workflow,
    limitations: [
      'Official PSI-69 experimental table; raw imagery and archive assets not included.',
      'Descriptive analysis is not causal inference.',
      'No imagery attached to current data extract.',
    ],
    generatedAt: new Date().toISOString(),
  };
}
function printSummary() {
  const d = report(),
    w = window.open('', '_blank');
  if (!w) {
    toast('Allow a popup to print the report');
    return;
  }
  w.document.write(
    `<html><head><title>MORS AEGIS Scientific Summary</title><style>body{font:14px Arial;margin:40px;color:#123}h1{color:#123}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #abc}small{color:#567}</style></head><body><h1>MORS AEGIS · FLEX Evidence Summary</h1><p>NASA PSI-69 · DOI 10.60555/mbq8-0451 · ${new Date().toISOString()}</p><p>Evidence: observed source-table values and computed descriptive statistics.</p><p><b>Scope:</b> all tests in the official PSI-69 experimental table; raw imagery and other archive assets are not included.</p>${rowsTable(dataset.rows)}<h2>Computed summary</h2><pre>${esc(JSON.stringify(analysis.summary, null, 2))}</pre><h2>Limitations</h2><ul>${d.limitations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p>Source: https://psi.nasa.gov/physci/repo/data/investigations/PSI-69</p></body></html>`,
  );
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 400);
}
async function loadFires() {
  const id = ++fireRequestId,
    status = $('#fireStatus'),
    area = $('#fireRegion').value,
    days = $('#fireDays').value;
  status.textContent = 'REQUESTING';
  try {
    const j = await get(`/api/firms?bbox=${encodeURIComponent(area)}&days=${days}`);
    if (id !== fireRequestId || !status.isConnected) return;
    fires = j.rows;
    status.textContent = `${j.cached ? 'CACHED' : 'LIVE'} · ${fires.length}`;
    $('#mapCaption').textContent =
      `NASA FIRMS VIIRS SNPP NRT · retrieved ${new Date(j.retrievedAt).toLocaleString()} · ${j.recordCount} detections`;
    const conf = {};
    for (const f of fires) conf[f.confidence] = (conf[f.confidence] || 0) + 1;
    $('#fireStats').innerHTML =
      `<div style="font-size:32px;font-weight:800">${j.recordCount}</div><p class="sub">Returned hotspot observations in selected area/time window. ${j.truncated ? 'Map capped at 1,500 displayed records.' : ''}</p>${Object.entries(
        conf,
      )
        .map(([k, v]) => `<div class="list-row"><span>Confidence · ${esc(k)}</span><b>${v}</b></div>`)
        .join(
          '',
        )}<div class="callout warn" style="margin-top:12px">A detection is a satellite observation, not a complete fire boundary or ground-verified incident.</div>`;
    drawMap(area);
  } catch (e) {
    if (id !== fireRequestId || !status.isConnected) return;
    fires = [];
    status.textContent = 'UNAVAILABLE';
    $('#fireStats').innerHTML = `<div class="empty">${esc(e.message)}. No observations are plotted.</div>`;
    $('#mapCaption').textContent = 'No live observations loaded.';
    drawMap(area);
  }
}
function drawMap(bbox) {
  const cv = $('#fireMap');
  if (!cv) return;
  const c = cv.getContext('2d'),
    r = cv.getBoundingClientRect(),
    d = window.devicePixelRatio || 1;
  cv.width = r.width * d;
  cv.height = r.height * d;
  c.scale(d, d);
  const w = r.width,
    h = r.height;
  c.fillStyle = '#0b1c2f';
  c.fillRect(0, 0, w, h);
  c.strokeStyle = '#18344a';
  c.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    c.beginPath();
    c.moveTo((i * w) / 6, 0);
    c.lineTo((i * w) / 6, h);
    c.stroke();
    c.beginPath();
    c.moveTo(0, (i * h) / 6);
    c.lineTo(w, (i * h) / 6);
    c.stroke();
  } // schematic graticule; no geographic outline or detections are invented
  const [west, south, east, north] = bbox.split(',').map(Number);
  for (const f of fires) {
    const x = ((Number(f.longitude) - west) / (east - west)) * w,
      y = h - ((Number(f.latitude) - south) / (north - south)) * h;
    if (x < 0 || x > w || y < 0 || y > h) continue;
    c.fillStyle = f.confidence === 'h' ? '#f39c54' : f.confidence === 'n' ? '#ffcb70' : '#74d4eb';
    c.globalAlpha = 0.82;
    c.beginPath();
    c.arc(x, y, 2.5, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  c.fillStyle = '#a6c1d4';
  c.font = '9px monospace';
  c.fillText(`${west}°`, 8, h - 10);
  c.fillText(`${east}°`, w - 40, h - 10);
  c.fillText(`${north}°`, 8, 37);
  c.fillText(`${south}°`, 8, h - 27);
}
$('#reportBtn').onclick = () => go('Reports');
$('#langBtn').textContent = lang === 'ar' ? 'English' : 'عربي';
$('#langBtn').onclick = () => {
  lang = lang === 'en' ? 'ar' : 'en';
  localStorage.setItem('mors-lang', lang);
  setTheme();
  renderNav();
  go(current);
};
$('#themeBtn').onclick = () => {
  theme = { arctic: 'space', space: 'observatory', observatory: 'arctic' }[theme];
  localStorage.setItem('mors-theme', theme);
  setTheme();
  go(current);
};
window.addEventListener(
  'resize',
  () => current === 'Earth Fire' && drawMap($('#fireRegion')?.value || '-125,32,-114,42'),
);
setTheme();
renderNav();
(async () => {
  try {
    dataset = await get('/api/datasets/flex');
    analysis = await get('/api/analysis');
    await health();
    go(current);
  } catch (e) {
    $('#content').innerHTML =
      `<div class="callout warn">Backend not ready. Start this application with <code>npm start</code> in its folder. ${esc(e.message)}</div>`;
  }
})();
