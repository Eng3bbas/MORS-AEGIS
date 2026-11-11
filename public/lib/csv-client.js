// Browser-side CSV parsing and statistics for user uploads (never sent to NASA provenance).
export function strictNumber(value) {
  if (value === null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function parseCSVClient(text) {
  const input = String(text).replace(/^\uFEFF/, ''),
    matrix = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') {
      if (cell.length) throw Error(`Unexpected quote at ${i + 1}`);
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      matrix.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (quoted) throw Error('CSV ends inside a quoted field.');
  if (cell.length || row.length) {
    row.push(cell);
    matrix.push(row);
  }
  while (matrix.length && matrix.at(-1).every((v) => v === '')) matrix.pop();
  if (matrix.length < 2) throw Error('CSV contains no data rows.');
  const headers = matrix.shift().map((v) => v.trim());
  if (headers.some((v) => !v) || new Set(headers).size !== headers.length)
    throw Error('CSV headers must be nonempty and unique.');
  return matrix.map((values, i) => {
    if (values.length !== headers.length) throw Error(`Malformed CSV row ${i + 2}.`);
    return Object.fromEntries(headers.map((key, j) => [key, values[j].trim() === '' ? null : values[j].trim()]));
  });
}
export function pearsonLocal(p) {
  if (p.length < 3) return null;
  const x = p.map((r) => r.initial_droplet_diameter_mm),
    y = p.map((r) => r.burning_rate_mm_s),
    mx = x.reduce((a, b) => a + b, 0) / x.length,
    my = y.reduce((a, b) => a + b, 0) / y.length,
    n = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0),
    dx = x.reduce((s, v) => s + (v - mx) ** 2, 0),
    dy = y.reduce((s, v) => s + (v - my) ** 2, 0);
  return dx && dy ? n / Math.sqrt(dx * dy) : null;
}
