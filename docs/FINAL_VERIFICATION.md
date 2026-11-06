# MORS AEGIS 3.0 alpha — engineering verification

This release is an integrated local research build, not a validated flight-safety system or a completed version of every 3.0 requirement. Verification date: 2026-11-05. Runtime used: Node 26 on Windows. The bundled five-row FLEX transcription was the only microgravity numerical dataset used for calculations; its original values could not be independently rechecked from the official dynamic PSI page during this run.

## Implemented and tested

- Existing source and architecture audited; baseline 26 tests passed. Critical input, provenance and numerical defects from prior review remain covered.
- SQLite catalogue ingests the bundled FLEX extract with dataset and row SHA-256; unit tests verify five records and repeat ingestion.
- Descriptive analysis, sample standard deviation, suitability-limited comparison, challenge workflow, and replay with full-row input and output hashes. A source metadata change or numerical change fails replay.
- Browser Scientific Data & Replay view: actual analysis and replay were run in a browser. The result showed mean burning rate `0.556 mm/s`, then `matches: true` on replay. A separate API smoke call showed `comparison: partial` and `challenge: completed-with-limits`.
- Computer Vision Laboratory UI and image-pixel geometry functions, including clear uncalibrated status. Pure geometry tests pass; browser view and controls rendered. Real-image manual upload validation is still pending.
- Earth 3D Observatory draws an orthographic globe and only plots actual FIRMS responses. Projection tests pass; browser view and empty state rendered. Live-load of the new view was not verified in this run.
- Copilot executes the deterministic `runAnalysis` tool before any model request and returns its evidence and result hash. Offline API smoke showed one tool execution and a clearly labeled local fallback.
- Loopback API boundary and defensive tests. `node scripts/check.mjs` verifies JavaScript syntax and a limited set of secret signatures.

## Implemented but not fully verified

- Windows `mors.exe` distribution: launcher self-test and bundled backend were verified on this build machine. Clean Windows machine, antivirus-signature and installer tests remain pending.
- Browser science view export, vision upload, and globe live observation interactions were not exercised end-to-end in this run.
- Docker image source now includes `src/` and writable `var/`; container build was not executed.

## Partial or missing

| Requirement | State and boundary |
|---|---|
| Original NASA row verification | Blocked: official PSI page returned a JavaScript shell. DOI and table attribution are inherited from prior transcription; no new independent source validation claimed. |
| Full NASA combustion asset corpus | Missing: ACME/BASS/SoFIE/Saffire/SAME discovery and raw imagery not ingested. |
| Flame computer vision | Partial: user-supplied warm-pixel segmentation, not a validated flame detector; no physical calibration or ground truth. |
| MODIS/VIIRS harmonization | Missing: current globe uses VIIRS SNPP NRT only. |
| Digital Twin | Missing: no calibrated time series or validated dynamical model. |
| Mission comparison and knowledge graph | Missing: only within-subset experiment comparison exists. |
| Discovery engine | Partial: bounded descriptive candidate question, no literature novelty screening or multiple-testing program. |
| AI Copilot providers | Partial: Gemini and deterministic fallback; local model adapter and response streaming not present. Prior Gemini requests fell back. |
| API Health Center | Partial: configured-key presence and manual NOAA/DONKI checks, no durable provider diagnostic ledger. |
| Report PDF | Partial: browser print-to-PDF, structured JSON and chart exports; no server PDF engine. |
| Fully accessible/responsive 16-view redesign | Partial: existing navigation preserved plus new views; automated WCAG and mobile device testing pending. |

## Verification evidence and limitations

Run `npm test` for unit and isolated API tests, `node scripts/check.mjs` for syntax and limited secret signatures, and `node scripts/benchmark.mjs` for a local five-record microbenchmark. A prior baseline measured validate median 0.0189 ms, summarize median 0.0041 ms and workflow median 0.0266 ms (1,000 iterations, Node 26, Windows). These are tiny-data measurements, not throughput or scale guarantees. Test results are evidence only for exercised conditions. No critical security finding was intentionally left open for the loopback-only build, but dedicated SAST, dependency image scan, external penetration test and production auth review were not performed.

## Demonstration path

Launch `mors.exe`; open the research explorer; inspect one real bundled record; run Scientific Data & Replay; select a measurement and calculate; replay and compare checksums; evaluate a second experiment with suitability reasons; run Challenge Mode and inspect its unsupported hypothesis status; optionally inspect a local image in pixel units and load a bounded FIRMS region on Earth 3D. The analysis remains usable offline. External providers may be unavailable. Never describe a hotspot as a fire perimeter or a pixel area as a physical flame area.
