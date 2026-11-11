// Traceable analysis, comparison, replay and challenge routes.
import { compareExperiments, runAnalysis, replayAnalysis, scientificChallenge } from '../../science/research.mjs';
import { send, readJson, rateLimit } from '../http.mjs';
import { researchDataset } from '../dataset.mjs';

const handlers = {
  analyze: ({ rows, version }, input) => runAnalysis(rows, { ...input, datasetVersion: version }),
  compare: ({ rows }, input) => compareExperiments(rows.find(r => r.id === input.a), rows.find(r => r.id === input.b), input.measurement),
  replay: ({ id, rows, version }, input) => replayAnalysis(rows, input.saved, version, id),
  challenge: ({ rows }, input) => scientificChallenge(rows, input)
};

export const researchRoutes = Object.fromEntries(Object.entries(handlers).map(([name, compute]) => [
  `POST /api/research/${name}`,
  async (req, res, url, ip) => {
    if (!rateLimit(`${ip}:research`, 30)) return send(res, 429, { error: 'Research request limit reached.' });
    const input = await readJson(req, 30_000);
    const dataset = await researchDataset();
    try { return send(res, 200, compute(dataset, input)); }
    catch { return send(res, 400, { error: 'Research request is invalid or cannot be computed from available records.' }); }
  }
]));
