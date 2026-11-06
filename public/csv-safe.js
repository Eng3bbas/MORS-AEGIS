// Keep JSON exports exact; neutralize formula-like text only when creating spreadsheet CSV.
export function csvCell(value) {
  const raw = value == null ? '' : String(value);
  const safe = typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
