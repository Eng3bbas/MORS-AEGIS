// DOM helpers shared by every page.
export const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
export function toast(s) {
  const x = $('#toast');
  x.textContent = s;
  x.classList.add('show');
  setTimeout(() => x.classList.remove('show'), 2400);
}
export function safeNasaHref(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      ['api.nasa.gov', 'science.nasa.gov', 'psi.nasa.gov', 'nasa.gov'].includes(u.hostname)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function pageHead(title, desc) {
  return `<div class="section-title" style="margin-top:0"><div><h2>${title}</h2><p>${desc}</p></div></div>`;
}
export function stat(label, value, detail, icon) {
  return `<article class="card metric"><span class="metric-icon">${icon}</span><div class="label">${label}</div><strong>${value}</strong><small>${detail}</small></article>`;
}
export function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
