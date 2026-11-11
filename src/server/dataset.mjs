// Loads the bundled catalogue once per process. Bundled CSVs are immutable at runtime,
// so rows are cached; a failed open is not cached, so the next request retries.
import { openCatalog, ingestBundled, listCatalog, getExperiments, DEFAULT_DATASET } from '../data/catalog.mjs';

let loading = null;

async function load() {
  const db = await openCatalog(process.env.MORS_DB_PATH || undefined);
  try {
    await ingestBundled(db);
    const catalog = listCatalog(db);
    const datasets = new Map();
    for (const meta of catalog) {
      const records = getExperiments(db, meta.id);
      const rows = Object.freeze(records.map(({ row_sha256, ...row }) => Object.freeze(row)));
      datasets.set(meta.id, Object.freeze({ id: meta.id, version: meta.version_sha256, rows, records }));
    }
    if (!datasets.has(DEFAULT_DATASET)) throw new Error('Scientific dataset is unavailable.');
    return { db, catalog, datasets };
  } catch (error) { db.close(); throw error; }
}

function state() {
  loading ??= load().catch(error => { loading = null; throw error; });
  return loading;
}

export async function catalogList() { return (await state()).catalog; }

/** @returns {Promise<{id:string, version:string, rows:readonly object[], records:object[]}>} */
export async function researchDataset(id = DEFAULT_DATASET) {
  const dataset = (await state()).datasets.get(id);
  if (!dataset) throw Object.assign(new Error('Unknown dataset.'), { status: 404 });
  return dataset;
}
