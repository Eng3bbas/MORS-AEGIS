// MORS AEGIS entry point: access checks, API routing and static files.
// Route handlers live in src/server/routes/; configuration in src/server/config.mjs.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { HOST, PORT, NETWORK_MODE, PUBLIC_ROOT } from './src/server/config.mjs';
import { send, safeHeaders, requestIsLocal } from './src/server/http.mjs';
import { hasSession, loginPage, authenticate } from './src/server/auth.mjs';
import { dataRoutes } from './src/server/routes/data.mjs';
import { researchRoutes } from './src/server/routes/research.mjs';
import { feedRoutes } from './src/server/routes/feeds.mjs';
import { copilotRoutes } from './src/server/routes/copilot.mjs';

const ROUTES = new Map(Object.entries({ ...dataRoutes, ...researchRoutes, ...feedRoutes, ...copilotRoutes }));
const API_PATHS = new Set([...ROUTES.keys()].map(key => key.split(' ')[1]));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
};
const ERROR_MESSAGES = {
  400: 'Request body must contain a valid JSON object.',
  404: 'Resource not found.',
  413: 'Request body is too large.',
  415: 'Content-Type must be application/json.'
};

async function serveStatic(req, res, url) {
  if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'Malformed URL path.' }); }
  if (pathname.includes('\\') || pathname.includes('\0')) return send(res, 400, { error: 'Invalid URL path.' });
  const file = path.resolve(PUBLIC_ROOT, `.${pathname === '/' ? '/index.html' : pathname}`);
  const relative = path.relative(PUBLIC_ROOT, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return send(res, 403, { error: 'Forbidden.' });
  const data = await readFile(file);
  res.writeHead(200, safeHeaders(MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'));
  res.end(req.method === 'HEAD' ? undefined : data);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (NETWORK_MODE && !hasSession(req)) {
    if (url.pathname === '/api/auth' && req.method === 'POST') return authenticate(req, res);
    if (url.pathname.startsWith('/api/')) return send(res, 401, { error: 'Access token required.' });
    return send(res, 401, loginPage(), 'text/html; charset=utf-8');
  }
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
  const route = ROUTES.get(`${req.method} ${url.pathname}`);
  if (route) return route(req, res, url, req.socket.remoteAddress || 'local');
  return API_PATHS.has(url.pathname)
    ? send(res, 405, { error: 'Method not allowed.' })
    : send(res, 404, { error: 'Unknown API endpoint.' });
}

let activeRequests = 0;
const server = http.createServer(async (req, res) => {
  if (!requestIsLocal(req)) return send(res, 403, { error: 'Local same-origin access only.' });
  if (activeRequests >= 16) return send(res, 503, { error: 'Server busy; retry shortly.' });
  activeRequests++;
  try {
    await handle(req, res);
  } catch (error) {
    const status = ['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error?.code) ? 404 : ERROR_MESSAGES[error?.status] ? error.status : 500;
    if (!res.headersSent) send(res, status, { error: ERROR_MESSAGES[status] || 'Request failed. No sensitive details were logged.' });
    else res.destroy();
  } finally { activeRequests--; }
});

server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxConnections = 64;
server.listen(PORT, HOST, () => console.log(`MORS AEGIS listening at http://${HOST}:${PORT} (credentials loaded server-side only)`));
