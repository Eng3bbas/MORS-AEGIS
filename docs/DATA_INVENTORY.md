# Data inventory

| Resource | Availability | Scope and provenance | Handling |
|---|---|---|---|
| Bundled FLEX PSI-69 CSV | Local | Five selected reported records; exact upstream table could not be independently reread in the previous audit | Parsed, validated, checksum versioned, indexed in SQLite |
| NASA PSI-69 investigation URL | External metadata link | `https://psi.nasa.gov/physci/repo/data/investigations/PSI-69`; DOI recorded as `10.60555/mbq8-0451` | Linked, not treated as downloaded full archive |
| NASA FIRMS VIIRS SNPP NRT | On request, online, key gated | Satellite thermal anomaly observations and metadata for bounded area/time | Separate Earth context; no equivalence with microgravity flame tests |
| NOAA SWPC Kp | On request, online | Space weather context | Separate module |
| NASA DONKI solar flares | On request, online, key gated | Provider availability varies | Failure reported, no synthetic observations |
| ACME, BASS, SoFIE, Saffire, SAME assets | Not cataloged locally | Relevant investigation families named in requirements; data availability and licensing require source-by-source audit | No records invented |
| MODIS FIRMS products | Not ingested locally | Requires sensor-specific fields, collection version and harmonization method | No combined MODIS/VIIRS statistics yet |
| Combustion images, video, temporal sensor series | Not present | Calibration and data-level provenance unavailable | No physical flame geometry or validated digital twin claimed |

The catalog's `provenance_status` records the verification boundary. A source URL or DOI is a traceable lead, not evidence that the bundled numeric transcription has been reverified. Dataset hashes establish local integrity after ingestion; they do not authenticate NASA content.
