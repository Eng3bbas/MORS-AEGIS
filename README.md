# MORS AEGIS

MORS AEGIS 3.0 alpha is a local scientific research application centered on the official NASA PSI-69 FLEX experimental table (274 droplet-combustion tests). It combines traceable analysis, a portable SQLite catalogue, image pixel measurements, optional real FIRMS observations and a research chatbot. Scientific and deployment limits are recorded in `docs/FINAL_VERIFICATION.md`.

## Run it

On this Windows machine, run `start.ps1` from PowerShell. It starts the app at <http://127.0.0.1:4173> using settings from `.env` in the project folder: copy `.env.example` to `.env` and set values there. Never commit `.env`. The server parses credentials in memory and never returns their values to the browser.

Requirements: Node.js 22.13+ (Node 26 used for local verification). To start manually: `npm start`. To validate: `npm test`. For Docker, set a random 32+ character `MORS_ACCESS_TOKEN` in a local `.env`, then run `docker compose up --build` and open `http://127.0.0.1:4173`. The browser asks for the token at sign-in; each sign-in gets its own session, which ends after 12 hours idle (`MORS_SESSION_IDLE_SECONDS`), on `POST /api/logout`, or when the server restarts. At most 64 sessions are kept (`MORS_SESSION_MAX`); the least recently used is dropped first. Compose publishes on loopback only; use TLS and access controls before changing that binding.

### Windows LAN distribution

The self-contained Windows x64 package is built with `scripts/build-windows.ps1`; see [Windows distribution instructions](docs/WINDOWS_DISTRIBUTION.md). Run `mors.exe` on the computer that will host the app. It binds to that computer's private LAN address, requires a generated access token, and offers **LAN access details** in its system-tray menu. Use the displayed URL and token from another device on the same trusted network. The Windows Firewall rule is restricted to the Private profile and local subnet. This uses HTTP without encryption, so do not forward the port to the internet or use it on an untrusted network.

## What works

- Full NASA PSI-69 / FLEX experimental table (274 tests, methanol and heptane, varied pressure and O₂/N₂/CO₂/He atmospheres), CSV export and DOI-linked metadata. `npm run data:fetch` re-downloads it from NASA; every correction made during normalization is listed in `ms02-connectors/flex-psi69-quality.json`.
- Schema/range validation, null-aware descriptive statistics, a paired Pearson calculation, and a ten-role typed research workflow.
- Browser charts, source table, comparison view, evidence ledger, local CSV upload, report JSON/CSV export and print-to-PDF.
- Gemini Interactions API Copilot (server-side key handling) with a grounded evidence context; a clearly labeled deterministic offline response if unavailable.
- Chatbot-style Copilot page with starter questions, source context, bounded local conversation history, and a clear new-chat action.
- NASA FIRMS VIIRS SNPP NRT area feed (key-gated, request bounded) and NOAA SWPC Kp JSON feed.
- NASA DONKI Solar Flare observations for space-weather context (key-gated, server-side request).
- Three visual themes, browser-persisted preferences, Arabic RTL shell, responsive layouts, reduced-motion support.
- Explicitly labeled classical statevector demonstration and data-empty habitat research view.

## Scientific scope

The bundled table is the official PSI-69 experimental table, downloaded from the [NASA investigation page](https://psi.nasa.gov/physci/repo/data/investigations/PSI-69) (DOI [10.60555/mbq8-0451](https://doi.org/10.60555/mbq8-0451), CC0-1.0). The unmodified NASA file is kept in `ms02-connectors/raw/`; `ms02-connectors/normalize-psi69.mjs` converts it to the app schema and records 39 documented corrections (placeholder dashes → missing, `~6` → 6 flagged approximate, one zero pressure → missing, one duplicated identifier disambiguated). Interpretation choices: the export's flattened gas headers are read as O₂, N₂, CO₂ and He, and "Burning rate; mm" is the d²-law burning-rate constant in mm²/s. The original five-row extract is kept as a small test fixture (`PSI-69-subset`) and matches the first five rows exactly. Tests pool different fuels, pressures and diluents, so pooled statistics are descriptive only; comparisons are refused when fuel or gas composition differ. Raw imagery and other archive assets are not mirrored.

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

Server code: `server.mjs` (entry, routing table, static files) → `src/server/config.mjs` (env and credentials, read once at startup), `http.mjs` (headers, body limits, origin checks, rate limits, cache), `auth.mjs` (LAN token gate), `dataset.mjs` (catalogue loaded once per process), and `routes/` (`data`, `research`, `feeds`, `copilot`). Restart the server after changing `.env` or the credentials file. Frontend shared helpers live in `public/lib/`.

| MORS module | Responsibility |
|---|---|
| ms01 Core Platform | `server.mjs` + `src/server/`, HTTP routing, validation boundaries, rate limits |
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

**Security note:** `start.ps1` reads provider keys from the project's `.env` only. A separate credentials file is read only if you opt in by setting `MORS_CREDENTIALS_FILE` (in `.env` or the environment) to its path; keep such a file outside the project and protect it with OS account controls. Since provider credentials were shared as attachments during setup, rotate/revoke active keys before relying on them. Gemini chat sends the question, up to eight recent turns, and the bundled public FLEX subset to Google's API. Do not submit secrets or personal data. The default Node/Docker deployment remains loopback-only unless explicitly configured; the Windows LAN launcher enforces a generated access token and restricts firewall access to the private subnet, but its HTTP traffic is not encrypted. Do not expose it to the public internet. See [SECURITY.md](SECURITY.md).

## Known limitations

- The experimental table is complete, but raw imagery, video and other PSI-69 archive files are not mirrored, and no instrument uncertainty is supplied.
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
| NASA PSI-69 experimental table (274 tests) and citations | Implemented; reproducible download, checksummed raw file, documented normalization |
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
| LAN authentication | Implemented for Windows launcher with random per-host access token and per-login HttpOnly sessions (idle expiry, session cap, `POST /api/logout`); no user roles or per-user database isolation |
| Container build / CI | Dockerfile and CI workflow provided; container deployment not run |

## Verification (final build)

`npm test` covers CSV quoting/newlines, source-row parsing, scientific summaries, units, missing-data handling, invalid measurements and dates, and graceful workflow rejection. `node --check server.mjs` and `node --check public/app.js` validate JavaScript syntax. HTTP security-boundary smoke checks are performed against the local server; external provider uptime and key validity remain outside the app's control.
