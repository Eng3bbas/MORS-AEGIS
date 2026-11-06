# MORS AEGIS

MORS AEGIS 3.0 alpha is a local scientific research application centered on a five-record FLEX table extract. It combines traceable analysis, a portable SQLite catalogue, image pixel measurements, optional real FIRMS observations and a research chatbot. Scientific and deployment limits are recorded in `docs/FINAL_VERIFICATION.md`.

## Run it

On this Windows machine, run `start.ps1` from PowerShell. It starts the app at <http://127.0.0.1:4173> and points the backend at the supplied Desktop credential file if it exists. The server parses credentials in memory and never returns their values to the browser. You can instead copy `.env.example` to `.env` and set values there. Never commit `.env`.

Requirements: Node.js 22.13+ (Node 26 used for local verification). To start manually: `npm start`. To validate: `npm test`. Container use is available with `docker compose up --build` after creating a local `.env` if credentials are needed.

## What works

- NASA PSI-69 / FLEX source table subset, five publicly displayed rows, CSV export and DOI-linked metadata.
- Schema/range validation, null-aware descriptive statistics, a paired Pearson calculation, and a ten-role typed research workflow.
- Browser charts, source table, comparison view, evidence ledger, local CSV upload, report JSON/CSV export and print-to-PDF.
- Gemini Interactions API Copilot (server-side key handling) with a grounded evidence context; a clearly labeled deterministic offline response if unavailable.
- Chatbot-style Copilot page with starter questions, source context, bounded local conversation history, and a clear new-chat action.
- NASA FIRMS VIIRS SNPP NRT area feed (key-gated, request bounded) and NOAA SWPC Kp JSON feed.
- NASA DONKI Solar Flare observations for space-weather context (key-gated, server-side request).
- Three visual themes, browser-persisted preferences, Arabic RTL shell, responsive layouts, reduced-motion support.
- Explicitly labeled classical statevector demonstration and data-empty habitat research view.

## Scientific scope

The five CSV rows are from the PSI-69 FLEX table visible on the official [NASA investigation page](https://psi.nasa.gov/physci/repo/data/investigations/PSI-69). The page identifies DOI [10.60555/mbq8-0451](https://doi.org/10.60555/mbq8-0451) and a CC0-1.0 license. The bundled subset is not the full PSI archive and is not representative by design. It is sufficient to demonstrate parsing and descriptive calculations, not confirmatory inference. The full record may include additional assets and file-level metadata that this build has not retrieved.

Evidence tiers are OBSERVED, COMPUTED, INFERRED, HYPOTHESIS, and SIMULATED. The implementation does not label an AI response or quantum toy example as a measurement. A satellite hotspot is not a fire perimeter. Habitat values are not fabricated. Quantum arithmetic uses a classical CPU simulation and is unrelated to the combustion analysis.

## Architecture

```text
Browser SPA (public/)
  ├─ /api/datasets/flex ── ms02-connectors/flex-psi69.csv
  ├─ /api/analysis ─────── ms05-analysis/analysis.mjs
  ├─ /api/workflow ─────── ms09-agents/workflow.mjs
  ├─ /api/firms ────────── NASA FIRMS area CSV, key stays server-side
  ├─ /api/noaa ─────────── NOAA SWPC public JSON
  ├─ /api/donki ────────── NASA DONKI FLR, last seven days; key stays server-side
  └─ /api/copilot ──────── Gemini Interactions API, bounded evidence context
```

| MORS module | Responsibility |
|---|---|
| ms01 Core Platform | `server.mjs`, HTTP routing, validation boundaries, rate limits |
| ms02 Scientific Data Connectors | PSI table and source registry; NASA FIRMS/NOAA adapters |
| ms03 Microgravity Combustion | FLEX lab views in `public/app.js` |
| ms04 Scientific Computer Vision | Status is visible; blocked because no source imagery was ingested |
| ms05 Statistical Analysis | `analysis.mjs`, CSV parsing, validation, summaries, association |
| ms06 Earth Fire Intelligence | FIRMS integration and area map view |
| ms07 Habitat Research | Honest no-data research state |
| ms08 Quantum Lab | Classical single-qubit statevector teaching example |
| ms09 Multi-Agent Intelligence | Typed deterministic workflow stages and provenance |
| ms10 AI Copilot | Gemini grounded prompt and deterministic local fallback |
| ms11 Scientific Visualization | Inline SVG plots and observation map canvas |
| ms12 Reports & Provenance | JSON/CSV/print outputs and evidence ledger |
| ms13 Design System | Three CSS themes, responsive and RTL shell |
| ms14 Testing & Validation | Node built-in tests and GitHub Actions workflow |
| ms15 Infrastructure & Deployment | PowerShell launcher and Dockerfile |

## Previous MORS project comparison

Audited repository: [ASI-HACK Space Analytics Engine](https://github.com/Laythraad/ASI-HACK-Space-Analytics-Engine), commit `64fa630` (“Review remediation: honest data bindings, a11y/lang pass, MIT license, Arabic pitch video”). It has a useful command-center shell, source-labelled outputs, four-agent pipeline, data-health UI, and explicitly labeled offline fallback. Its science focus and data model are astronomy / space-weather centric, so its endpoints and analytical assumptions do not transfer to combustion. The prior app also has a static-snapshot architecture; this build replaces that with a focused source subset and exact computations, while preserving visible degraded modes and provenance. We did not reuse its data, numerical claims, or UI assets.

## Credential setup

Supported server-side settings: `GEMINI_API_KEY`, `NASA_FIRMS_MAP_KEY`, `NASA_API_KEY`, `EARTHDATA_TOKEN`, and `DONKI`. A supplied nonstandard text file can be pointed to with `MORS_CREDENTIALS_FILE`; the parser accepts the labels in the provided file and keeps values in process memory. Availability means only “a non-empty value was found”; it does not establish validity. Gemini is sent only for Copilot requests. FIRMS is contacted only after the user requests a region. Earthdata and NASA Open APIs are not used by the FLEX workflow; the public PSI extract needs neither. The app intentionally avoids calling an unrelated NASA endpoint simply to exercise a key.

NASA FIRMS area API bounds source requests to VIIRS_SNPP_NRT, 1–5 days, caller-selected coordinates, and local rate limiting. The upstream quota and returned-record cap apply. NOAA and FIRMS connectivity may fail independently without affecting the bundled FLEX analysis.

**Security note:** `start.ps1` can read `New Text Document (2).txt` from the current user's Desktop. That file is not copied into the project or ZIP. Since provider credentials were shared as attachments during setup, rotate/revoke active keys and update the local credential file before relying on them. Gemini chat sends the question, up to eight recent turns, and the bundled public FLEX subset to Google's API. Do not submit secrets or personal data. The server is localhost-only and has no user authentication; do not expose it to a network as-is. See [SECURITY.md](SECURITY.md).

## Known limitations

- The source extract contains five displayed table rows, not a complete PSI experiment dataset. Full raw/analyzed data retrieval and file-level metadata remain pending.
- No FLEX imagery was downloaded; computer vision is not implemented.
- The workflow is one local orchestrator calling deterministic stage functions. The copilot is generative; this is not a distributed team of autonomous model agents or a model-voting scientific council.
- Browser plots are lightweight SVG/canvas, not ECharts/Plotly. No 3D content is needed for this evidence scope.
- Arabic RTL layout is available, while scientific details and some page copy remain English.
- There is no user account, database, multi-user authorization, or server-side project persistence.
- Habitat research has no connected authorized telemetry.
- Quantum demo is a one-qubit classical statevector calculation; Qiskit, quantum hardware, model training, and quantum benchmarks are not included.
- PDF is produced by browser print, not a server-side PDF engine.
- Node.js was available in the supplied runtime; the Python launcher/runtime was not. The new local backend therefore uses built-in Node modules instead of FastAPI and Python scientific packages.

## Demo script

1. Open **Dataset Explorer** and show the PSI-69 record, CC0 license, DOI, and row-scope caveat.
2. Open **Combustion Lab** to inspect the source values, missing diameter, and measured burning rates.
3. Open **Analysis Workbench** and reproduce the 0.556 mm/s sample mean; explain per-variable null handling.
4. Run **Agent Operations** to show range checks, deterministic analysis, and skipped imagery/quantum roles.
5. Ask Copilot why the observed association cannot establish causality; inspect the model/offline status and DOI.
6. Export the report and explain that satellite fire detections are contextual observations, not direct measures of microgravity combustion.

## Verification matrix

| Feature | Status |
|---|---|
| Local web app and API | Implemented; verified by smoke test |
| Five-row NASA PSI-69 source extract and citations | Implemented; source page and DOI identified; full archive not retrieved |
| Descriptive science and null handling | Implemented and tested |
| Computer vision | Not implemented; imagery unavailable |
| Gemini chat Copilot | Chatbot UI and server connector implemented; credential detected; initial provider request returned HTTP 503; deterministic fallback verified |
| NASA FIRMS connector | Implemented; MAP_KEY detected; live request succeeded with zero detections in the tested California box/day |
| NASA DONKI solar flares | Implemented; credential detected; request returned unavailable in this run |
| NOAA SWPC feed | Implemented; live request returned 48 recent records |
| Multi-agent scientific workflow | Deterministic typed local stages implemented; no autonomous independent agents |
| Report exports | JSON/CSV/print summary implemented |
| Themes and responsive shell | Implemented |
| Arabic interface | Partially implemented (RTL shell and controls; scientific copy remains English) |
| Habitat module | No-data research boundary implemented; telemetry integration not implemented |
| Quantum research | Small classical statevector demonstration only |
| Authentication/database/multi-user access | Not implemented |
| Container build / CI | Dockerfile and CI workflow provided; container deployment not run |

## Verification (final build)

`npm test` covers CSV quoting/newlines, source-row parsing, scientific summaries, units, missing-data handling, invalid measurements and dates, and graceful workflow rejection. `node --check server.mjs` and `node --check public/app.js` validate JavaScript syntax. HTTP security-boundary smoke checks are performed against the local server; external provider uptime and key validity remain outside the app's control.
