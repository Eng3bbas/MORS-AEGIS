// Health, source registry, catalogue, dataset, summary analysis and workflow routes.
import { summarize, validate, pearson } from '../../../ms05-analysis/analysis.mjs';
import { runWorkflow } from '../../../ms09-agents/workflow.mjs';
import { SOURCES } from '../../../ms02-connectors/registry.mjs';
import { HOST, secrets } from '../config.mjs';
import { send, readJson, rateLimit } from '../http.mjs';
import { researchDataset, catalogList } from '../dataset.mjs';

function sourceList() {
  const configured = {
    firms: () => Boolean(secrets.firms()),
    donki: () => Boolean(secrets.donki() || secrets.nasa()),
    earthdata: () => Boolean(secrets.earthdata()),
    'nasa-open': () => Boolean(secrets.nasa())
  };
  return SOURCES.map(source => ({ ...source, configured: configured[source.id]?.() ?? true }));
}

export const dataRoutes = {
  'GET /api/health': (req, res) => send(res, 200, {
    status: 'ok', product: 'MORS AEGIS', timestamp: new Date().toISOString(),
    credentials: Object.fromEntries(Object.entries(secrets).map(([name, get]) => [name, Boolean(get())])),
    runtime: 'Node.js', binding: HOST
  }),

  'GET /api/sources': (req, res) => send(res, 200, { sources: sourceList() }),

  'GET /api/catalog': async (req, res) => send(res, 200, { datasets: await catalogList() }),

  'GET /api/catalog/experiments': async (req, res, url) => {
    const { id, records } = await researchDataset(url.searchParams.get('dataset') || undefined);
    return send(res, 200, { datasetId: id, records });
  },

  'GET /api/datasets/flex': async (req, res) => {
    const { rows } = await researchDataset();
    return send(res, 200, {
      dataset: {
        id: 'PSI-69', name: 'Flame Extinguishment Experiment (FLEX)',
        doi: '10.60555/mbq8-0451', title: 'Droplet Flame Extinguishment in Microgravity',
        license: 'CC0-1.0', source: SOURCES[0].url, subset: false, records: rows.length,
        recordScope: `All ${rows.length} tests in the official PSI-69 experimental table. Fuels, pressures and diluent gases vary between tests.`,
        qualityReport: 'ms02-connectors/flex-psi69-quality.json',
        evidence: 'OBSERVED'
      },
      rows, validation: validate(rows)
    });
  },

  'GET /api/analysis': async (req, res) => {
    const { rows } = await researchDataset();
    return send(res, 200, { summary: summarize(rows), associations: pearson(rows, 'initial_droplet_diameter_mm', 'burning_rate_mm_s') });
  },

  'POST /api/workflow': async (req, res, url, ip) => {
    if (!rateLimit(`${ip}:workflow`, 15)) return send(res, 429, { error: 'Local request limit reached; retry in one minute.' });
    const input = await readJson(req);
    const rows = input.rows === undefined ? (await researchDataset()).rows : input.rows;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 5000) return send(res, 400, { error: 'Provide between 1 and 5,000 parsed records.' });
    return send(res, 200, runWorkflow(rows));
  }
};
