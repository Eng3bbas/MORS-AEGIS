import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV, validate } from '../../ms05-analysis/analysis.mjs';

const SOURCE = 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-69';
const CSV = fileURLToPath(new URL('../../ms02-connectors/flex-psi69.csv', import.meta.url));
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

export async function ingestBundledFlex(db) {
  const raw = await readFile(CSV, 'utf8');
  const rows = parseCSV(raw);
  const quality = validate(rows);
  if (!quality.valid) throw new Error(`Bundled FLEX extract failed validation: ${quality.errors.join('; ')}`);
  const version = hash(raw);
  const current = db.prepare('SELECT version_sha256 FROM datasets WHERE id = ?').get('PSI-69-subset');
  if (current?.version_sha256 === version) return { datasetId: 'PSI-69-subset', version, records: rows.length, changed: false };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT OR REPLACE INTO datasets VALUES (?,?,?,?,?,?,?,?)').run(
      'PSI-69-subset', 'FLEX table extract', SOURCE, '10.60555/mbq8-0451', version,
      'bundled transcription; upstream row values not independently reverified',
      'Five selected table records; not the full archive', new Date().toISOString()
    );
    db.prepare('DELETE FROM experiments WHERE dataset_id = ?').run('PSI-69-subset');
    const insert = db.prepare('INSERT INTO experiments VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const row of rows) insert.run('PSI-69-subset', row.id, row.date, row.fuel, row.pressure_mmHg,
      row.oxygen_mole_fraction, row.nitrogen_mole_fraction, row.test_end, JSON.stringify(row), hash(JSON.stringify(row)));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { datasetId: 'PSI-69-subset', version, records: rows.length, changed: true };
}

export function listCatalog(db) {
  return db.prepare('SELECT id,title,source_url,doi,version_sha256,provenance_status,scope,ingested_at FROM datasets ORDER BY id').all();
}
export function getExperiments(db, datasetId = 'PSI-69-subset') {
  const records = db.prepare('SELECT raw_json,row_sha256 FROM experiments WHERE dataset_id = ? ORDER BY date,id').all(datasetId);
  return records.map(({raw_json,row_sha256}) => ({...JSON.parse(raw_json), row_sha256}));
}
