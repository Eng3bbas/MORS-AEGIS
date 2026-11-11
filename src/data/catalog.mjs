import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV, validate } from '../../ms05-analysis/analysis.mjs';

const SOURCE = 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-69';
const csvPath = name => fileURLToPath(new URL(`../../ms02-connectors/${name}`, import.meta.url));
export const DEFAULT_DATASET = 'PSI-69';
export const BUNDLED_DATASETS = Object.freeze({
  'PSI-69': { file: csvPath('flex-psi69-full.csv'), title: 'FLEX experimental table (full)',
    provenance: 'official PSI-69 experimental table; normalized with documented corrections (ms02-connectors/flex-psi69-quality.json)',
    scope: 'All tests in the official PSI-69 experimental table; heterogeneous fuels, pressures and diluents' },
  'PSI-69-subset': { file: csvPath('flex-psi69.csv'), title: 'FLEX table extract',
    provenance: 'bundled transcription; upstream row values not independently reverified',
    scope: 'Five selected table records; not the full archive' }
});
const DEFAULT_DB = fileURLToPath(new URL('../../var/mors.sqlite', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');

export async function openCatalog(file = DEFAULT_DB) {
  if (file !== ':memory:') await mkdir(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, source_url TEXT NOT NULL,
    doi TEXT, version_sha256 TEXT NOT NULL, provenance_status TEXT NOT NULL,
    scope TEXT NOT NULL, ingested_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS experiments (
    dataset_id TEXT NOT NULL REFERENCES datasets(id), id TEXT NOT NULL,
    date TEXT NOT NULL, fuel TEXT NOT NULL, pressure_mmhg REAL,
    oxygen_fraction REAL, nitrogen_fraction REAL, outcome TEXT,
    raw_json TEXT NOT NULL, row_sha256 TEXT NOT NULL,
    PRIMARY KEY(dataset_id,id)
  );
  CREATE INDEX IF NOT EXISTS experiments_by_date ON experiments(dataset_id,date);
  CREATE INDEX IF NOT EXISTS experiments_by_fuel ON experiments(dataset_id,fuel);`);
  return db;
}

/** Ingest every bundled dataset; unchanged datasets are skipped by checksum. */
export async function ingestBundled(db) {
  const results = [];
  for (const id of Object.keys(BUNDLED_DATASETS)) results.push(await ingestBundledFlex(db, id));
  return results;
}

export async function ingestBundledFlex(db, datasetId = DEFAULT_DATASET) {
  const spec = BUNDLED_DATASETS[datasetId];
  if (!spec) throw new Error(`Unknown bundled dataset ${datasetId}`);
  const raw = await readFile(spec.file, 'utf8');
  const rows = parseCSV(raw);
  const quality = validate(rows);
  if (!quality.valid) throw new Error(`Bundled ${datasetId} failed validation: ${quality.errors.join('; ')}`);
  const version = hash(raw);
  const current = db.prepare('SELECT version_sha256 FROM datasets WHERE id = ?').get(datasetId);
  if (current?.version_sha256 === version) return { datasetId, version, records: rows.length, changed: false };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT OR REPLACE INTO datasets VALUES (?,?,?,?,?,?,?,?)').run(
      datasetId, spec.title, SOURCE, '10.60555/mbq8-0451', version, spec.provenance, spec.scope, new Date().toISOString()
    );
    db.prepare('DELETE FROM experiments WHERE dataset_id = ?').run(datasetId);
    const insert = db.prepare('INSERT INTO experiments VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const row of rows) insert.run(datasetId, row.id, row.date, row.fuel, row.pressure_mmHg,
      row.oxygen_mole_fraction, row.nitrogen_mole_fraction, row.test_end, JSON.stringify(row), hash(JSON.stringify(row)));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { datasetId, version, records: rows.length, changed: true };
}

export function listCatalog(db) {
  return db.prepare('SELECT id,title,source_url,doi,version_sha256,provenance_status,scope,ingested_at FROM datasets ORDER BY id').all();
}
export function getExperiments(db, datasetId = DEFAULT_DATASET) {
  const records = db.prepare(`SELECT raw_json,row_sha256 FROM experiments WHERE dataset_id = ?
    ORDER BY date, json_extract(raw_json, '$.test'), id`)
    .all(datasetId);
  return records.map(({raw_json,row_sha256}) => ({...JSON.parse(raw_json), row_sha256}));
}
