// Live context feeds: NOAA SWPC, NASA DONKI and NASA FIRMS. Keys stay server-side;
// on failure nothing is substituted for real observations.
import { parseCSV } from '../../../ms05-analysis/analysis.mjs';
import { SOURCES } from '../../../ms02-connectors/registry.mjs';
import { secrets } from '../config.mjs';
import { send, rateLimit, cacheGet, cacheSet, readResponseText } from '../http.mjs';

async function noaa(req, res, url, ip) {
  if (!rateLimit(`${ip}:noaa`, 12)) return send(res, 429, { error: 'NOAA request limit reached.' });
  const cached = cacheGet('noaa:last48', 120_000);
  if (cached) return send(res, 200, cached);
  try {
    const response = await fetch(SOURCES.find(source => source.id === 'swpc').url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('NOAA unavailable');
    const records = JSON.parse(await readResponseText(response, 2_000_000));
    if (!Array.isArray(records)) throw new Error('NOAA schema mismatch');
    return send(res, 200, cacheSet('noaa:last48', { status: 'live', source: 'NOAA SWPC', retrievedAt: new Date().toISOString(), data: records.slice(-48) }));
  } catch {
    return send(res, 502, { status: 'unavailable', source: 'NOAA SWPC', note: 'Live feed could not be reached or validated; no measurements are substituted.' });
  }
}

async function donki(req, res, url, ip) {
  if (!rateLimit(`${ip}:donki`, 8)) return send(res, 429, { error: 'DONKI requests are limited to 8 per minute from this app.' });
  const cached = cacheGet('donki:flr:last7d', 300_000);
  if (cached) return send(res, 200, cached);
  const key = secrets.donki() || secrets.nasa();
  if (!key) return send(res, 424, { status: 'not-configured', source: 'NASA DONKI', note: 'Configure DONKI or NASA_API_KEY on the server.' });
  const end = new Date(), start = new Date(end.getTime() - 6 * 86_400_000);
  const date = value => value.toISOString().slice(0, 10);
  const params = new URLSearchParams({ startDate: date(start), endDate: date(end), api_key: key });
  try {
    const response = await fetch(`https://api.nasa.gov/DONKI/FLR?${params}`, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    const result = JSON.parse(await readResponseText(response, 1_000_000));
    if (!response.ok || !Array.isArray(result)) return send(res, 502, { status: 'source-error', source: 'NASA DONKI', note: `NASA DONKI returned HTTP ${response.status}.` });
    const payload = { status: 'live', source: 'NASA DONKI Solar Flare (FLR)', window: { start: date(start), end: date(end) }, retrievedAt: new Date().toISOString(), data: result.slice(0, 100) };
    return send(res, 200, cacheSet('donki:flr:last7d', payload));
  } catch {
    return send(res, 502, { status: 'unavailable', source: 'NASA DONKI', note: 'NASA DONKI request failed or timed out; no observations are substituted.' });
  }
}

function parseBbox(text) {
  const bbox = text.split(',').map(Number);
  if (bbox.length !== 4 || bbox.some(n => !Number.isFinite(n)) || bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90 || bbox[0] >= bbox[2] || bbox[1] >= bbox[3])
    return { error: 'bbox must be west,south,east,north within geographic bounds.' };
  const [west, south, east, north] = bbox;
  if (east - west > 50 || north - south > 30 || (east - west) * (north - south) > 900)
    return { error: 'FIRMS area is too large. Select a bounded research region (maximum 50° by 30° and 900 square degrees).' };
  return { bbox };
}

async function firms(req, res, url, ip) {
  if (!rateLimit(`${ip}:firms`, 8)) return send(res, 429, { error: 'FIRMS is limited to 8 requests per minute from this app.' });
  const { bbox, error } = parseBbox(url.searchParams.get('bbox') || '-125,32,-114,42');
  if (error) return send(res, 400, { error });
  const days = Number(url.searchParams.get('days') || 1);
  if (!Number.isInteger(days) || days < 1 || days > 5) return send(res, 400, { error: 'days must be an integer from 1 to 5.' });
  const key = secrets.firms();
  if (!key) return send(res, 424, { status: 'not-configured', source: 'NASA FIRMS', note: 'A FIRMS MAP_KEY is required on the server.' });
  const area = bbox.join(',');
  const cacheKey = `firms:${area}:${days}`;
  const cached = cacheGet(cacheKey, 300_000);
  if (cached) return send(res, 200, cached);
  const endpoint = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_SNPP_NRT/${area}/${days}`;
  try {
    const response = await fetch(endpoint, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return send(res, 502, { status: 'source-error', source: 'NASA FIRMS', note: `FIRMS returned HTTP ${response.status}. Check the MAP_KEY without sharing it.` });
    const csv = await readResponseText(response, 4_000_000);
    if (/invalid map key|error\s*:/i.test(csv.slice(0, 300))) return send(res, 502, { status: 'source-error', source: 'NASA FIRMS', note: 'FIRMS rejected the key or request. Check the MAP_KEY without sharing it.' });
    const validRows = parseCSV(csv, { allowEmpty: true }).filter(row => Number.isFinite(row.latitude) && Number.isFinite(row.longitude)
      && row.latitude >= -90 && row.latitude <= 90 && row.longitude >= -180 && row.longitude <= 180);
    const payload = {
      status: 'live', source: 'NASA FIRMS VIIRS Suomi-NPP NRT', retrievedAt: new Date().toISOString(),
      recordCount: validRows.length, truncated: validRows.length > 1500, rows: validRows.slice(0, 1500)
    };
    return send(res, 200, cacheSet(cacheKey, payload));
  } catch {
    return send(res, 502, { status: 'unavailable', source: 'NASA FIRMS', note: 'Upstream request failed, exceeded its size limit, or timed out; no detections are substituted.' });
  }
}

export const feedRoutes = { 'GET /api/noaa': noaa, 'GET /api/donki': donki, 'GET /api/firms': firms };
