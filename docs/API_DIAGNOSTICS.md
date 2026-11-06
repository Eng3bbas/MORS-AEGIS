# API diagnostic baseline

Prior local tests found configured Gemini, FIRMS, DONKI and Earthdata credentials. Credential presence does not prove validity. A small FIRMS VIIRS area request returned HTTP 200 with zero observations in its test box; a zero count is not a provider failure. Gemini returned a provider fallback and DONKI returned HTTP 502/unavailable. NOAA's public feed previously returned 48 recent records. Earthdata is configured but unused, and no standalone `NASA_API_KEY` was found. These observations are time-specific; current status requires fresh minimal requests. No credential values are recorded here.

Actions: validate mapping and response category without disclosing keys; add per-provider last-test/last-success metadata; preserve local scientific analysis on provider failure. Never infer an invalid key from a timeout or HTTP 502 alone.
