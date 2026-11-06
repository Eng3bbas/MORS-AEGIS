# System architecture

Browser client (`public/`) calls a local Node HTTP server (`server.mjs`) over loopback. The server serves bundled data (`ms02-connectors/`), deterministic calculations (`ms05-analysis/`), review workflow (`ms09-agents/`), and bounded NASA/NOAA/Gemini adapters. Credential values remain in the local process. Uploaded CSV is parsed client-side; server workflows validate supplied records and suppress NASA attribution unless content exactly matches the bundled extract.

3.0 direction: portable local data catalogue with checksums; pure scientific analysis functions; replay records that hash inputs and outputs; bounded analytical tool endpoints; optional image pixel measurements; independent Earth observations. Browser views consume these contracts. Static research data works offline; cloud provider queries are optional. The launcher starts the existing server and default browser, without requiring a database service.

Trust boundaries: browser input → local API, bundled/source data → calculations, local server → upstream providers, launcher → OS browser. Browser input is untrusted. Upstream records are data, never instructions. No Internet-facing authentication is implemented; loopback binding is the operational boundary.
