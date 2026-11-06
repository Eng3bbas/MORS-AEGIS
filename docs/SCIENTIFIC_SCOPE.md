# Scientific scope for MORS AEGIS 3.0

## Available evidence

The packaged FLEX subset contains five reported table rows attributed to the NASA Physical Sciences Informatics PSI-69 investigation page (DOI 10.60555/mbq8-0451). The source table could not be independently reread in the previous audit because the public page served a JavaScript shell. The packaged rows and units are therefore treated as a *bundled transcription* with a known original URL, not a newly verified original archive. `src/data/catalog.mjs` preserves this status in the dataset record and stores SHA-256 checksums of the exact CSV bytes and each normalized row.

The local SQLite catalog has `datasets` and `experiments` tables, indexed by date and fuel. It is a portable offline cache, not a substitute for source provenance. No raw imagery, time series, camera calibration, uncertainty estimate, frame-level linkage, instrument model, MODIS observations, space habitat telemetry or research publication full text are included in this subset.

## Supported calculations

- Null-aware arithmetic mean and sample standard deviation for selected reported numeric variables.
- Paired record comparison when both measurements are finite and fuel plus oxygen/nitrogen fractions are reported and equal. Such comparisons are labeled **partial** because equal metadata cannot establish full experimental equivalence. Reported pressure difference is shown; no arbitrary scientific tolerance is imposed.
- Deterministic analysis replay based on selection, method, software version, exact input values and SHA-256 result checksums.
- Challenge workflow that answers a defined question with bounded descriptive analysis and labels candidate explanations as unproven hypotheses.

These operations do not estimate causal effects, thermal properties, sensor uncertainty, model confidence or population intervals. A sample SD describes spread among records, not measurement uncertainty. Comparability is unsupported if conditions differ or measurements are missing. Any later inclusion of raw imagery or other investigations requires independent source, calibration and schema review before physical quantities are computed.

## Reproduction

Run `node --test tests/science-v3.test.mjs` on Node 22.13+ to exercise catalog ingestion, checksum stability, comparison refusal, replay mismatch and hypothesis labeling. Run `npm test` for the complete suite. The default database is `var/mors.sqlite`; it is generated from the packaged CSV and is excluded from source control. `openCatalog(':memory:')` is available for isolated analysis.
