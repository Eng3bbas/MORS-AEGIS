// Flammability Map page: LOI brackets per fuel × pressure band × diluent from GET /api/flammability.
import { esc, pageHead } from './dom.js';
import { get } from './api.js';
import { flammabilitySVG, outcomeMark, OUTCOME_MARKS } from './charts.js';

const DILUENT_NAMES = { none: 'No diluent (O₂/N₂)', CO2: 'CO₂ diluent', He: 'He diluent', mixed: 'CO₂ + He' };
const STATUS_TAG = { bracketed: 'comp', overlapping: 'inf', 'not bracketed': '' };

export function flammabilityShell() {
  return `${pageHead('Flammability Map', 'Limiting oxygen index (LOI) brackets from recorded FLEX test outcomes, by fuel, pressure band and diluent.')}<div class="toolbar" role="group" aria-label="Flammability map filters"><label class="field-label" for="flamFuel">Fuel</label><select id="flamFuel"><option value="">All fuels</option></select><label class="field-label" for="flamDiluent">Diluent</label><select id="flamDiluent"><option value="">All diluents</option></select><label class="field-label" for="flamDisruption">Disruption read as</label><select id="flamDisruption"><option value="excluded">Excluded (default)</option><option value="sustained">Sustained (sensitivity)</option><option value="not-sustained">Not sustained (sensitivity)</option></select><span class="tag obs">POINTS · OBSERVED</span><span class="tag inf">BRACKETS · INFERRED</span></div><div id="flamLegend" class="flam-legend"></div><div id="flamPanels" class="flam-panels"><div class="empty">Loading flammability map…</div></div><article class="card" style="margin-top:15px"><div class="card-head"><div><h3>Bracket summary</h3><p class="sub">Table alternative to the chart · one row per fuel × pressure band × diluent</p></div><span class="tag inf">INFERRED</span></div><div id="flamSummary"></div></article><article class="card" style="margin-top:15px"><div class="card-head"><div><h3>Tests by O₂ fraction and outcome</h3><p class="sub">Every source test, including those the chart cannot place (missing pressure)</p></div><span class="tag obs">OBSERVED</span></div><div id="flamLevels"></div></article><div class="grid two" style="margin-top:15px"><article class="card"><h3>How outcomes are read</h3><div id="flamInterpretation"></div></article><article class="card"><h3>Limitations</h3><div id="flamLimits"></div></article></div>`;
}

function legendHTML() {
  const sw = (reading) =>
    `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${outcomeMark(reading, 7, 7)}</svg>`;
  return `${Object.entries(OUTCOME_MARKS)
    .map(([reading, m]) => `<span>${sw(reading)} ${esc(m.label)}</span>`)
    .join(
      '',
    )}<span><i class="flam-key bracket"></i> LOI bracket (between observed O₂ values)</span><span><i class="flam-key overlap"></i> O₂ range where outcomes overlap</span>`;
}

function panelsHTML(data, fuel, diluent) {
  const groups = data.groups.filter(
    (g) => (!fuel || g.condition.fuel === fuel) && (!diluent || g.condition.diluent === diluent),
  );
  const panels = [];
  for (const f of data.conditions.fuels) {
    if (fuel && f.id !== fuel) continue;
    for (const d of data.conditions.diluents) {
      if (diluent && d.id !== diluent) continue;
      const set = groups.filter(
        (g) => g.condition.fuel === f.id && g.condition.diluent === d.id && g.condition.pressureBand !== 'unknown',
      );
      if (!set.length) continue;
      panels.push(
        `<article class="card"><div class="card-head"><div><h3>${esc(f.label)} · ${esc(DILUENT_NAMES[d.id] || d.id)}</h3><p class="sub">${set.reduce((s, g) => s + g.n, 0)} tests · hover a point for its record</p></div><span class="tag inf">INFERRED BAND</span></div>${flammabilitySVG(set, data.pressureBands, `${f.id}-${d.id}`.replace(/[^a-z0-9-]/gi, ''))}</article>`,
      );
    }
  }
  const unplaced = groups.filter((g) => g.condition.pressureBand === 'unknown').reduce((s, g) => s + g.n, 0);
  return (
    (panels.length
      ? `<div class="grid flam-grid">${panels.join('')}</div>`
      : '<div class="empty">No tests match.</div>') +
    (unplaced
      ? `<div class="callout" style="margin-top:12px">${unplaced} test${unplaced > 1 ? 's have' : ' has'} no recorded pressure, so ${unplaced > 1 ? 'they are' : 'it is'} not plotted. ${unplaced > 1 ? 'They are' : 'It is'} listed in the tables below.</div>`
      : '')
  );
}

function summaryHTML(groups) {
  return `<div class="table-wrap"><table><caption class="sr-only">LOI bracket per test-condition group</caption><thead><tr><th scope="col">Group</th><th scope="col">n</th><th scope="col">Decided</th><th scope="col">Status</th><th scope="col">Highest O₂ not sustained</th><th scope="col">Lowest O₂ sustained</th><th scope="col">Reading</th></tr></thead><tbody>${groups
    .map(
      (g) =>
        `<tr><th scope="row">${esc(g.label)}</th><td>${g.n}</td><td>${g.bracket.decided}</td><td><span class="tag ${STATUS_TAG[g.bracket.status]}">${esc(g.bracket.status.toUpperCase())}</span></td><td>${g.bracket.highestNotSustained ?? '—'}</td><td>${g.bracket.lowestSustained ?? '—'}</td><td class="flam-reason">${esc(g.bracket.reason)}</td></tr>`,
    )
    .join('')}</tbody></table></div>`;
}

function levelsHTML(groups) {
  const rows = groups.flatMap((g) => {
    const byO2 = new Map();
    for (const p of g.points) {
      const k = p.oxygen ?? 'missing';
      if (!byO2.has(k)) byO2.set(k, []);
      byO2.get(k).push(p);
    }
    return [...byO2.entries()].map(([o2, pts]) => {
      const count = (r) => pts.filter((p) => p.reading === r).length;
      return `<tr><th scope="row">${esc(g.label)}</th><td>${esc(o2)}</td><td>${count('sustained')}</td><td>${count('not-sustained')}</td><td>${count('excluded')}</td><td class="mono flam-ids">${pts.map((p) => `${esc(p.id)} (${esc(p.test_end ?? '—')}, ${esc(p.pressure_mmHg ?? '—')} mmHg)`).join(', ')}</td></tr>`;
    });
  });
  return `<div class="table-wrap"><table><caption class="sr-only">Tests per group and O₂ fraction, with outcome counts</caption><thead><tr><th scope="col">Group</th><th scope="col">O₂ fraction</th><th scope="col">Sustained</th><th scope="col">Not sustained</th><th scope="col">Excluded</th><th scope="col">Tests (outcome, pressure)</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

export async function mountFlammability(root) {
  const $ = (id) => root.querySelector('#' + id);
  let data = null,
    requestId = 0;
  const render = () => {
    if (!data) return;
    const fuel = $('flamFuel').value,
      diluent = $('flamDiluent').value;
    const groups = data.groups.filter(
      (g) => (!fuel || g.condition.fuel === fuel) && (!diluent || g.condition.diluent === diluent),
    );
    $('flamPanels').innerHTML = panelsHTML(data, fuel, diluent);
    $('flamSummary').innerHTML = summaryHTML(groups);
    $('flamLevels').innerHTML = levelsHTML(groups);
  };
  const load = async () => {
    const id = ++requestId;
    const next = await get(`/api/flammability?disruption=${encodeURIComponent($('flamDisruption').value)}`);
    if (id !== requestId) return;
    data = next;
    render();
  };
  $('flamLegend').innerHTML = legendHTML();
  await load();
  $('flamFuel').innerHTML += data.conditions.fuels
    .map((f) => `<option value="${esc(f.id)}">${esc(f.label)} (${f.n})</option>`)
    .join('');
  $('flamDiluent').innerHTML += data.conditions.diluents
    .map((d) => `<option value="${esc(d.id)}">${esc(DILUENT_NAMES[d.id] || d.label)} (${d.n})</option>`)
    .join('');
  $('flamInterpretation').innerHTML = `<p class="sub">${esc(data.definition)}</p>${Object.entries(data.interpretation)
    .map(
      ([label, v]) =>
        `<div class="list-row"><span><b>${esc(label)}</b> → ${esc(v.reading)}</span><small>${esc(v.note)}</small></div>`,
    )
    .join(
      '',
    )}<div class="callout warn" style="margin-top:12px"><b>Assumptions.</b><ul>${data.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
  $('flamLimits').innerHTML =
    `<ul class="flam-list">${data.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><div class="callout" style="margin-top:12px">Source: NASA PSI-69 FLEX experimental table · DOI ${esc(data.dataset.doi)} · ${data.dataset.records} tests. No value on this page is interpolated or fabricated; a bracket is a pair of observed O₂ fractions.</div>`;
  $('flamFuel').onchange = render;
  $('flamDiluent').onchange = render;
  $('flamDisruption').onchange = () =>
    load().catch((e) => ($('flamPanels').innerHTML = `<div class="callout warn">${esc(e.message)}</div>`));
  return { records: data.records };
}
