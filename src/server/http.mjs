// HTTP primitives: response headers, bounded body readers, origin checks, rate limits and a small cache.
import { ALLOWED_HOSTS, NETWORK_MODE } from './config.mjs';

export function safeHeaders(type) {
  return {
    'content-type': type,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'cache-control': 'no-store'
  };
}

export function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, safeHeaders(type));
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export async function readJson(req, limitBytes = 300_000) {
  if (String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim() !== 'application/json')
    throw httpError(415, 'Content-Type must be application/json.');
  if (Number(req.headers['content-length']) > limitBytes) throw httpError(413, 'Request body is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw httpError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Object required');
    return value;
  } catch { throw httpError(400, 'Request body must contain valid JSON.'); }
}

export async function readResponseText(response, maxBytes) {
  if (!response.body) throw new Error('Empty response stream');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error('Upstream response exceeded size limit'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function isLoopbackOrPrivate(address = '') {
  const ip = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b] = octets;
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

export function requestIsLocal(req) {
  const host = String(req.headers.host || '').toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return false;
  if (NETWORK_MODE && !isLoopbackOrPrivate(req.socket.remoteAddress)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (!origin) return true; // CLI clients and same-origin navigations may omit Origin.
  try { return new URL(origin).origin === `http://${host}`; } catch { return false; }
}

function trimMap(map, limit) {
  if (map.size <= limit) return;
  for (const key of map.keys()) { map.delete(key); if (map.size <= limit) break; }
}

const RATE_WINDOW_MS = 60_000;
const rateWindows = new Map();
export function rateLimit(key, max) {
  const now = Date.now();
  const times = (rateWindows.get(key) || []).filter(time => now - time < RATE_WINDOW_MS);
  if (times.length >= max) return false;
  times.push(now);
  rateWindows.set(key, times);
  trimMap(rateWindows, 512);
  return true;
}

const MAX_CACHE_BYTES = 8_000_000;
const cache = new Map();
export function cacheGet(key, ttlMs) {
  const item = cache.get(key);
  if (!item || Date.now() - item.savedAt > ttlMs) { cache.delete(key); return null; }
  return { ...item.value, cached: true, cacheAgeSeconds: Math.max(0, Math.round((Date.now() - item.savedAt) / 1000)) };
}
export function cacheSet(key, value) {
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes > MAX_CACHE_BYTES) return value;
  cache.delete(key);
  let total = [...cache.values()].reduce((sum, item) => sum + item.bytes, 0);
  while (cache.size && total + bytes > MAX_CACHE_BYTES) {
    const oldestKey = cache.keys().next().value;
    total -= cache.get(oldestKey).bytes;
    cache.delete(oldestKey);
  }
  cache.set(key, { savedAt: Date.now(), value, bytes });
  trimMap(cache, 32);
  return value;
}
