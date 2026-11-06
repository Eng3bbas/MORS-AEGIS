# Backend review and corrective evidence

Reviewed 2026-11-05 against the local Node application. Threat boundaries are browser → local HTTP server → fixed NASA/NOAA/Google endpoints. Credentials remain server-side. No destructive probes or real credential values were used in automated tests.

| Severity | Defect / reproduction | Applied correction | Verification |
|---|---|---|---|
| Medium | POST JSON `null` to workflow/copilot dereferenced null and returned 500; primitives accepted inconsistently | Require a non-null JSON record and exact JSON media type; reject empty row arrays | Isolated API contract tests |
| Medium | HOST could expose unauthenticated server on a network unintentionally | Non-loopback bind now requires explicit `MORS_ALLOW_NETWORK_BIND=1`; Docker deliberately opts in inside container and Compose publishes loopback only | Code inspection; container execution not performed |
| Medium | In-flight slow provider requests could accumulate; NOAA had no rate bound | Cap active requests at 16 and sockets at 64; add NOAA rate limit; retain upstream byte/time bounds | Configuration inspected; load saturation not benchmarked |
| Low | Missing assets surfaced as internal server errors | Missing files/directories return 404 without local path details | Isolated API tests |
| Low | Origin accepted another loopback origin and HTTPS scheme | Require exact origin matching incoming allowed host | Raw HTTP header probes |
| Low | Cache replacement accounting counted old and new value | Remove replaced value before capacity calculation | Code inspection |
| Medium | Upstream redirects could forward request context unexpectedly | Disable redirects on provider requests | Code inspection; external redirect fixture not run |
| Medium | Container used root by default | Use existing Node image non-root account | Dockerfile inspection; container execution not performed |

`node --test tests/backend.test.mjs` passed 9 tests including its containing test; 8 distinct contract scenarios: health/credential suppression and headers, malformed bodies, oversized bodies, origin/Host rejection, static containment, workflow success/rejection, deterministic Copilot fallback and oversized FIRMS region rejection. Server starts on a temporary isolated port with `MORS_DISABLE_CREDENTIALS=1`, suppressing `.env` and credential-file reads. No provider requests are made by these tests. `node --check server.mjs` passed.

The first Host spoofing test used Node fetch, which normalized the Host header and produced a false test failure. The corrected test uses raw `http.get` so the intended Host is actually transmitted; all probes then passed.

## Gemini review

Official documentation at https://ai.google.dev/gemini-api/docs/interactions redirected to https://aistudio.google.com/docs/interactions-overview and was fetched during this review. It documents `gemini-3.8-flash`, execution steps and `model_output`, consistent with current integration. No speculative model/endpoint substitution was made. Previous live provider failures do not establish an invalid key. This review's automated tests verify only offline failure recovery; live provider validity is not claimed.

## Remaining boundaries

No authentication or multi-user isolation exists. Public deployment is not approved by these local checks. `MORS_ALLOW_NETWORK_BIND=1` is an explicit deployment responsibility; host/origin filtering does not authenticate non-browser clients. CSP still allows inline styles for existing UI, while scripts remain self-only. No gitleaks/Trivy/SAST service or container scan was executed. The runtime application declares no third-party npm dependencies; base-image vulnerabilities require deployment-time scanning. Prompt instructions cannot guarantee immunity to prompt injection; the Copilot has no write tools or credential access in its model context.

Independent science review identified and reported possible acceptance of missing statistic fields and nonfinite intermediate computations to the scientific owner for correction. Uploaded records now receive an unverified identity unless their canonical content digest exactly matches the bundled table; a matching digest is not a new upstream source verification.
