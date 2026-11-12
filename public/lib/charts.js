import { esc } from './dom.js';
// Dependency-free inline SVG charts.
export function chartSVG(rows, key, label, unit, color = '#258cb4') {
  const vals = rows.map((r) => r[key]).filter(Number.isFinite);
  if (!vals.length) return `<div class="empty">No measured values for ${label}.</div>`;
  const w = 640,
    h = 210,
    p = { l: 48, r: 12, t: 16, b: 38 },
    min = Math.min(0, ...vals),
    max = Math.max(...vals) * 1.12 || 1,
    xx = (i) => p.l + (i * (w - p.l - p.r)) / Math.max(1, rows.length - 1),
    yy = (v) => h - p.b - ((v - min) / (max - min)) * (h - p.t - p.b);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label} in ${unit}"><g stroke="var(--line)" stroke-width="1"><line x1="${p.l}" y1="${h - p.b}" x2="${w - p.r}" y2="${h - p.b}"/><line x1="${p.l}" y1="${p.t}" x2="${p.l}" y2="${h - p.b}"/><line x1="${p.l}" y1="${yy(max * 0.5)}" x2="${w - p.r}" y2="${yy(max * 0.5)}" stroke-dasharray="3 4"/></g><text x="5" y="15" fill="var(--muted)" font-size="9">${esc(label)} (${esc(unit)})</text>${rows.map((r, i) => (Number.isFinite(r[key]) ? `<circle cx="${xx(i)}" cy="${yy(Number(r[key]))}" r="4.2" fill="${color}"><title>${esc(r.id || r.test)} · ${Number(r[key]).toFixed(3)} ${unit}</title></circle>` : '')).join('')}<text x="${p.l}" y="${h - 9}" fill="var(--muted)" font-size="9">${esc(rows[0].id || rows[0].date || 'Record 1')}</text><text x="${w - p.r}" y="${h - 9}" text-anchor="end" fill="var(--muted)" font-size="9">${esc(rows.at(-1).id || rows.at(-1).date || 'Record ' + rows.length)}</text><text x="${p.l - 8}" y="${yy(max * 0.5) + 3}" text-anchor="end" fill="var(--muted)" font-size="9">${(max * 0.5).toFixed(2)}</text><text x="${p.l - 8}" y="${yy(min) + 3}" text-anchor="end" fill="var(--muted)" font-size="9">${min.toFixed(2)}</text></svg>`;
}

// Flammability map panel: O₂ mole fraction (y) against pressure band (x columns) for one fuel × diluent.
// Points are OBSERVED tests; the shaded band is the INFERRED LOI bracket (or the O₂ range where
// outcomes overlap). Tests sharing an O₂ value in one band are spread sideways so none are hidden:
// horizontal offset inside a column is not a pressure difference.
export const OUTCOME_MARKS = {
  sustained: { label: 'Completion · sustained', shape: 'circle', color: 'var(--flam-sus)' },
  'not-sustained': { label: 'Extinction · not sustained', shape: 'square', color: 'var(--flam-ext)' },
  excluded: { label: 'Disruption · excluded from bracket', shape: 'diamond', color: 'var(--muted)' },
};
export function outcomeMark(reading, x, y, r = 4.2) {
  const m = OUTCOME_MARKS[reading] || OUTCOME_MARKS.excluded;
  if (m.shape === 'circle')
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${m.color}" stroke="var(--surface)" stroke-width="1.5"/>`;
  if (m.shape === 'square')
    return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="1" fill="${m.color}" stroke="var(--surface)" stroke-width="1.5"/>`;
  return `<path d="M${x} ${y - r - 0.6}L${x + r + 0.6} ${y}L${x} ${y + r + 0.6}L${x - r - 0.6} ${y}Z" fill="none" stroke="${m.color}" stroke-width="1.6"/>`;
}
const o2fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
export function flammabilitySVG(groups, bands, uid, domain = [0.1, 0.36]) {
  const w = 660,
    h = 320,
    p = { l: 50, r: 10, t: 30, b: 50 },
    colW = (w - p.l - p.r) / bands.length,
    [lo, hi] = domain,
    yy = (v) => h - p.b - ((v - lo) / (hi - lo)) * (h - p.t - p.b),
    ticks = [];
  for (let v = Math.ceil(lo * 20) / 20; v <= hi + 1e-9; v += 0.05) ticks.push(Number(v.toFixed(2)));
  const grid = ticks
    .map(
      (v) =>
        `<line x1="${p.l}" y1="${yy(v)}" x2="${w - p.r}" y2="${yy(v)}" stroke="var(--line)" stroke-dasharray="2 4"/><text x="${p.l - 7}" y="${yy(v) + 3}" text-anchor="end" fill="var(--muted)" font-size="9">${v.toFixed(2)}</text>`,
    )
    .join('');
  const columns = bands
    .map((band, i) => {
      const x0 = p.l + i * colW,
        cx = x0 + colW / 2,
        g = groups.find((x) => x.condition.pressureBand === band.id),
        sep = i ? `<line x1="${x0}" y1="${p.t}" x2="${x0}" y2="${h - p.b}" stroke="var(--line)"/>` : '',
        foot = `<text x="${cx}" y="${h - p.b + 16}" text-anchor="middle" fill="var(--ink)" font-size="10">${esc(band.label)}</text>`;
      if (!g)
        return `${sep}${foot}<text x="${cx}" y="${h - p.b + 29}" text-anchor="middle" fill="var(--muted)" font-size="9">no tests</text>`;
      const pr = g.pressureRange,
        b = g.bracket,
        sub = `<text x="${cx}" y="${h - p.b + 29}" text-anchor="middle" fill="var(--muted)" font-size="9">n=${g.n} · ${pr ? `${Math.round(pr.min)}–${Math.round(pr.max)} mmHg` : 'pressure missing'}</text>`;
      let shade = '',
        status;
      if (b.status === 'bracketed') {
        const y1 = yy(b.interval.upper),
          y2 = yy(b.interval.lower);
        shade = `<rect x="${x0 + 4}" y="${y1}" width="${colW - 8}" height="${y2 - y1}" fill="var(--flam-sus)" fill-opacity=".13"/><line x1="${x0 + 4}" x2="${x0 + colW - 4}" y1="${y1}" y2="${y1}" stroke="var(--flam-sus)" stroke-dasharray="5 3"/><line x1="${x0 + 4}" x2="${x0 + colW - 4}" y1="${y2}" y2="${y2}" stroke="var(--flam-ext)" stroke-dasharray="5 3"/>`;
        status = `LOI bracket (${o2fmt(b.interval.lower)}, ${o2fmt(b.interval.upper)}]`;
      } else if (b.status === 'overlapping') {
        const y1 = yy(b.overlap.to) - 4,
          y2 = yy(b.overlap.from) + 4;
        shade = `<rect x="${x0 + 4}" y="${y1}" width="${colW - 8}" height="${y2 - y1}" fill="url(#hatch-${uid})"/><rect x="${x0 + 4}" y="${y1}" width="${colW - 8}" height="${y2 - y1}" fill="none" stroke="var(--muted)" stroke-opacity=".5"/>`;
        status = `Outcomes overlap ${o2fmt(b.overlap.from)}–${o2fmt(b.overlap.to)}`;
      } else status = 'Not bracketed';
      const head = `<text x="${cx}" y="${p.t - 10}" text-anchor="middle" fill="var(--ink)" font-size="9.5" font-weight="700">${esc(status)}<title>${esc(b.reason)}</title></text>`;
      const rows = new Map();
      for (const pt of g.points)
        if (Number.isFinite(pt.oxygen)) (rows.get(pt.oxygen) || rows.set(pt.oxygen, []).get(pt.oxygen)).push(pt);
      const order = { sustained: 0, 'not-sustained': 1, excluded: 2 };
      const marks = [...rows.values()]
        .map((pts) => {
          pts.sort((a, b) => order[a.reading] - order[b.reading]);
          const step = Math.min(10, (colW - 16) / Math.max(1, pts.length - 1));
          return pts
            .map((pt, k) => {
              const x = cx + (k - (pts.length - 1) / 2) * step,
                y = yy(pt.oxygen);
              const tip = `${pt.id} · ${pt.pressure_mmHg ?? '—'} mmHg · O₂ ${pt.oxygen} · CO₂ ${pt.carbon_dioxide ?? '—'} · He ${pt.helium ?? '—'} · d₀ ${pt.initial_droplet_diameter_mm ?? '—'} mm · ${pt.test_end ?? 'no outcome'} (${pt.reading})`;
              return `<g class="flam-pt"><circle cx="${x}" cy="${y}" r="7" fill="transparent"/>${outcomeMark(pt.reading, x, y)}<title>${esc(tip)}</title></g>`;
            })
            .join('');
        })
        .join('');
      return `${sep}${shade}${marks}${head}${foot}${sub}`;
    })
    .join('');
  const summary = groups.map((g) => `${g.label}: ${g.bracket.status}`).join('; ');
  return `<svg class="chart flam-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(`O₂ mole fraction by pressure band and outcome. ${summary}. A table with the same data follows.`)}"><defs><pattern id="hatch-${uid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted)" stroke-opacity=".45" stroke-width="2"/></pattern></defs>${grid}<line x1="${p.l}" y1="${p.t}" x2="${p.l}" y2="${h - p.b}" stroke="var(--line)"/><line x1="${p.l}" y1="${h - p.b}" x2="${w - p.r}" y2="${h - p.b}" stroke="var(--line)"/><text x="12" y="${(p.t + h - p.b) / 2}" transform="rotate(-90 12 ${(p.t + h - p.b) / 2})" text-anchor="middle" fill="var(--muted)" font-size="9">Ambient O₂ mole fraction</text>${columns}<text x="${(p.l + w - p.r) / 2}" y="${h - 5}" text-anchor="middle" fill="var(--muted)" font-size="9">Ambient pressure band (sideways spread within a band separates tests at the same O₂; it is not a pressure difference)</text></svg>`;
}
