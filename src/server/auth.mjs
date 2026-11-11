// Access-token gate used only when the server is bound to a network interface.
import { timingSafeEqual } from 'node:crypto';
import { NETWORK_MODE, ACCESS_TOKEN, SESSION_TOKEN, COOKIE_SECURE } from './config.mjs';
import { send, safeHeaders, rateLimit } from './http.mjs';

function equalSecret(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hasSession(req) {
  if (!NETWORK_MODE) return true;
  const cookie = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('mors_session='));
  return cookie ? equalSecret(cookie.slice('mors_session='.length), SESSION_TOKEN) : false;
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
  res.writeHead(303, { ...safeHeaders('text/html; charset=utf-8'), location: '/', 'set-cookie': `mors_session=${SESSION_TOKEN}; HttpOnly; SameSite=Strict; Path=/${COOKIE_SECURE ? '; Secure' : ''}` });
  res.end();
}
