// Process configuration and credentials. Everything here is read once at startup;
// restart the server after changing .env or the credentials file.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PUBLIC_ROOT = path.resolve(ROOT, 'public');
const LOOPBACK = ['127.0.0.1', '::1', 'localhost'];

function loadEnvFile() {
  if (process.env.MORS_DISABLE_CREDENTIALS === '1') return;
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnvFile();

export const PORT = Number(process.env.PORT || 4173);
export const HOST = process.env.HOST || '127.0.0.1';
export const NETWORK_MODE = !LOOPBACK.includes(HOST);
if (NETWORK_MODE && process.env.MORS_ALLOW_NETWORK_BIND !== '1') throw new Error('Non-loopback binding requires explicit MORS_ALLOW_NETWORK_BIND=1 and protected network configuration.');
export const ACCESS_TOKEN = process.env.MORS_ACCESS_TOKEN || '';
if (NETWORK_MODE && ACCESS_TOKEN.length < 32) throw new Error('Network binding requires MORS_ACCESS_TOKEN with at least 32 characters.');
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
export const SESSION_TOKEN = randomBytes(32).toString('hex');
export const COOKIE_SECURE = process.env.MORS_COOKIE_SECURE === '1';

const localIPv4 = Object.values(os.networkInterfaces()).flat()
  .filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address);
export const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`,
  ...(NETWORK_MODE ? localIPv4.map(address => `${address}:${PORT}`) : [])]);

export const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The optional credentials file uses a free-text "label ( value )" format; it is parsed once.
const credentialText = (() => {
  const file = process.env.MORS_CREDENTIALS_FILE;
  if (!file || process.env.MORS_DISABLE_CREDENTIALS === '1') return '';
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
})();
function credential(name, aliases = []) {
  if (process.env.MORS_DISABLE_CREDENTIALS === '1') return '';
  if (process.env[name]?.trim()) return process.env[name].trim();
  for (const label of [name, ...aliases]) {
    const match = credentialText.match(new RegExp(`${escapeRegex(label)}\\s*\\(\\s*([\\s\\S]*?)\\s*\\)`, 'i'));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return '';
}
const resolved = Object.freeze({
  gemini: credential('GEMINI_API_KEY', ['gemini']),
  firms: credential('NASA_FIRMS_MAP_KEY', ['nasa firms api key']),
  nasa: credential('NASA_API_KEY'),
  earthdata: credential('EARTHDATA_TOKEN', ['earthdata']),
  donki: credential('DONKI'),
  noaa: credential('NOAA SWPC API')
});
/** Credential accessors; values never leave the server. */
export const secrets = Object.freeze(Object.fromEntries(Object.entries(resolved).map(([key, value]) => [key, () => value])));

export const GEMINI_MODEL = /^[A-Za-z0-9.-]{1,80}$/.test(process.env.GEMINI_MODEL || '') ? process.env.GEMINI_MODEL : 'gemini-3-flash-preview';
