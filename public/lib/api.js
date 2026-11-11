// JSON API client; throws with the server's message on failure.
export async function get(url) {
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(j.note || j.error || `HTTP ${r.status}`);
  return j;
}
export async function post(url, data = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  const j = await r.json();
  if (!r.ok && r.status !== 424) throw new Error(j.note || j.error || `HTTP ${r.status}`);
  return j;
}
