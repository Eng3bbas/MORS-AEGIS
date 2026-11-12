// Access-token gate used only when the server is bound to a network interface.
// Each successful login gets its own random session token. Tokens live in memory only
// (a restart signs everyone out), expire after SESSION_IDLE_MS without use, and are capped
// at SESSION_MAX; when full, the least recently used session is dropped.
import { timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import { NETWORK_MODE, ACCESS_TOKEN, COOKIE_SECURE, SESSION_IDLE_MS, SESSION_MAX } from './config.mjs';
import { send, safeHeaders, rateLimit } from './http.mjs';

const COOKIE_NAME = 'mors_session';
const COOKIE_ATTRIBUTES = `HttpOnly; SameSite=Strict; Path=/${COOKIE_SECURE ? '; Secure' : ''}`;

function equalSecret(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

// Sessions are keyed by the SHA-256 digest of the token, so lookup time does not depend on
// how much of a guessed token matches, and the raw tokens are never kept in memory.
// Map order is least- to most-recently used.
const sessions = new Map();
const digest = token => createHash('sha256').update(token).digest('hex');

function sessionCookie(req) {
  const part = String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE_NAME}=`));
  const value = part ? part.slice(COOKIE_NAME.length + 1) : '';
  return /^[0-9a-f]{64}$/.test(value) ? value : '';
}

function pruneExpired(now) {
  for (const [key, lastSeen] of sessions) {
    if (now - lastSeen < SESSION_IDLE_MS) break; // remaining entries were used more recently
    sessions.delete(key);
  }
}

function createSession() {
  const now = Date.now();
  pruneExpired(now);
  while (sessions.size >= SESSION_MAX) sessions.delete(sessions.keys().next().value);
  const token = randomBytes(32).toString('hex');
  sessions.set(digest(token), now);
  return token;
}

export function hasSession(req) {
  if (!NETWORK_MODE) return true;
  const token = sessionCookie(req);
  if (!token) return false;
  const now = Date.now();
  pruneExpired(now);
  const key = digest(token);
  if (!sessions.has(key)) return false;
  sessions.delete(key); // re-insert to mark as most recently used
  sessions.set(key, now);
  return true;
}

export function loginPage(failed = false) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MORS AEGIS access</title><main><h1>MORS AEGIS</h1><p>Enter the access token configured for this deployment.</p>${failed ? '<p role="alert">Access token was not accepted.</p>' : ''}<form method="post" action="/api/auth"><label>Access token <input name="token" type="password" required autocomplete="off"></label><button type="submit">Open application</button></form></main></html>`;
}

export async function authenticate(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`${ip}:auth`, 5)) return send(res, 429, { error: 'Too many access attempts.' });
  if (String(req.headers['content-type'] || '').split(';')[0] !== 'application/x-www-form-urlencoded') return send(res, 415, { error: 'Form encoding required.' });
  let size = 0, body = '';
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) return send(res, 413, { error: 'Access request is too large.' });
    body += chunk.toString('utf8');
  }
  const supplied = new URLSearchParams(body).get('token') || '';
  if (!equalSecret(supplied, ACCESS_TOKEN)) return send(res, 401, loginPage(true), 'text/html; charset=utf-8');
  // Browser-session cookie (no Max-Age): the server enforces the sliding idle timeout.
  res.writeHead(303, { ...safeHeaders('text/html; charset=utf-8'), location: '/', 'set-cookie': `${COOKIE_NAME}=${createSession()}; ${COOKIE_ATTRIBUTES}` });
  res.end();
}

/** POST /api/logout: forget the caller's session (if any) and clear the cookie. */
export function logout(req, res) {
  const token = sessionCookie(req);
  if (token) sessions.delete(digest(token));
  res.writeHead(204, { ...safeHeaders('text/plain; charset=utf-8'), 'set-cookie': `${COOKIE_NAME}=; Max-Age=0; ${COOKIE_ATTRIBUTES}` });
  res.end();
}
