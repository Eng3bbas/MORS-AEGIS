// Flammability map: tests by O₂ fraction and outcome per fuel × pressure band × diluent,
// with INFERRED limiting-oxygen-index brackets. Logic lives in ms05-analysis/flammability.mjs.
import { send } from '../http.mjs';
import { researchDataset } from '../dataset.mjs';
import { normalizeFilter, filterRows, conditionCatalog, conditionLabel, PRESSURE_BANDS } from '../../../ms05-analysis/strata.mjs';
import { flammabilityMap } from '../../../ms05-analysis/flammability.mjs';

export const flammabilityRoutes = {
  // Optional ?fuel=&pressureBand=&diluent= narrow the map; ?disruption=excluded|sustained|not-sustained
  // re-reads Disruption outcomes for a sensitivity check (default: excluded).
  'GET /api/flammability': async (req, res, url) => {
    const { id, version, rows } = await researchDataset();
    const q = url.searchParams;
    let filter, map;
    try {
      filter = normalizeFilter({ fuel: q.get('fuel'), pressureBand: q.get('pressureBand'), diluent: q.get('diluent') });
      map = flammabilityMap(filterRows(rows, filter), { disruptionAs: q.get('disruption') || undefined });
    } catch (error) { return send(res, 400, { error: error.message }); }
    return send(res, 200, {
      dataset: { id, version, records: rows.length, doi: '10.60555/mbq8-0451' },
      evidence: { points: 'OBSERVED', brackets: 'INFERRED' },
      definition: 'Limiting oxygen index (LOI): the lowest ambient O₂ mole fraction that sustains droplet burning. Brackets are inferred from recorded test outcomes; no LOI value is interpolated.',
      filter, conditionLabel: conditionLabel(filter),
      conditions: conditionCatalog(rows),
      pressureBands: PRESSURE_BANDS.map(({ id: band, label, observed }) => ({ id: band, label, observed })),
      ...map
    });
  }
};
