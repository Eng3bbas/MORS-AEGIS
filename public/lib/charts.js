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
