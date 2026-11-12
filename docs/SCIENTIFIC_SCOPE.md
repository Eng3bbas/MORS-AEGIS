# Scientific scope for MORS AEGIS 3.0

## Available evidence

The packaged FLEX subset contains five reported table rows attributed to the NASA Physical Sciences Informatics PSI-69 investigation page (DOI 10.60555/mbq8-0451). The source table could not be independently reread in the previous audit because the public page served a JavaScript shell. The packaged rows and units are therefore treated as a *bundled transcription* with a known original URL, not a newly verified original archive. `src/data/catalog.mjs` preserves this status in the dataset record and stores SHA-256 checksums of the exact CSV bytes and each normalized row.

The local SQLite catalog has `datasets` and `experiments` tables, indexed by date and fuel. It is a portable offline cache, not a substitute for source provenance. No raw imagery, time series, camera calibration, uncertainty estimate, frame-level linkage, instrument model, MODIS observations, space habitat telemetry or research publication full text are included in this subset.

## Supported calculations

- Null-aware arithmetic mean and sample standard deviation for selected reported numeric variables.
- Paired record comparison when both measurements are finite and fuel plus oxygen/nitrogen fractions are reported and equal. Such comparisons are labeled **partial** because equal metadata cannot establish full experimental equivalence. Reported pressure difference is shown; no arbitrary scientific tolerance is imposed.
- Condition strata (`ms05-analysis/strata.mjs`): fuel; pressure band; diluent. Pressure bands are cut in the empty gaps between the three reported clusters: **~0.7 atm** (< 650 mmHg; observed 526–545, 103 tests), **~1 atm** (650–1000 mmHg; observed 752–774, 161 tests), **>2 atm** (≥ 1000 mmHg; observed 1546–2320, 9 tests). The one test with missing pressure is placed in `unknown`, not imputed. Diluent is `CO2` when the CO₂ fraction is > 0, `He` when the helium fraction is > 0, otherwise `none` (`mixed` is reserved for uploads; it does not occur in PSI-69). Within a stratum, oxygen fraction, diluent fraction and droplet size still vary.
- 95% percentile bootstrap intervals for means and for the diameter–burning-rate Pearson r (`ms05-analysis/bootstrap.mjs`), with a seeded mulberry32 PRNG (default seed 69, 2000 resamples). Each stratum derives its own seed from its label, so filtering never shifts another group's interval. No interval is reported when n < 5. Intervals describe resampling variability of the bundled records, not instrument uncertainty.
- `/api/research/analyze`, `GET /api/analysis` and `/api/copilot` accept an optional `{fuel, pressureBand, diluent}` filter; the Copilot also infers a single named fuel, pressure band or diluent from the question and then reports that stratum instead of the pooled mean.
- Deterministic analysis replay based on selection, condition filter, grouping, bootstrap seed and resample count, method, software version, exact input values and SHA-256 result checksums (recipe version 3; v1/v2 recipes replay but are reported as not matching because they lack these parameters).
- Challenge workflow that answers a defined question with bounded descriptive analysis and labels candidate explanations as unproven hypotheses.

These operations do not estimate causal effects, thermal properties, sensor uncertainty, model confidence or population intervals. A sample SD describes spread among records, not measurement uncertainty. Comparability is unsupported if conditions differ or measurements are missing. Any later inclusion of raw imagery or other investigations requires independent source, calibration and schema review before physical quantities are computed.

## Reproduction

Run `node --test tests/science-v3.test.mjs` on Node 22.13+ to exercise catalog ingestion, checksum stability, comparison refusal, replay mismatch and hypothesis labeling. Run `npm test` for the complete suite. The default database is `var/mors.sqlite`; it is generated from the packaged CSV and is excluded from source control. `openCatalog(':memory:')` is available for isolated analysis.
