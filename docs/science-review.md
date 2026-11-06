# Scientific validation and accountable workflow

Reviewed 2026-11-05. Scope: bundled five-row FLEX extract and deterministic numerical workflow.

## Source verification boundary

Official source: https://psi.nasa.gov/physci/repo/data/investigations/PSI-69 ; recorded DOI: 10.60555/mbq8-0451. The current HTTP fetch returned a 954-byte JavaScript shell; the research browser extractor returned no readable table. Therefore this review did not independently reverify the original table values, units or license. Bundled metadata retains the prior transcription claims. Reaching the URL is not verification of measurements. Full archive, imagery calibration, instrument uncertainty and file-level provenance remain unavailable.

## Independently reproduced arithmetic

Burning rates supplied: 0.52, 0.60, 0.58, 0.60, 0.48. Sum = 2.78; mean = 2.78 / 5 = 0.556 in the bundled field's reported mm/s unit. Sample SD = 0.05366563146 using denominator n-1. This is between-record variability, not instrument uncertainty, and does not establish a population confidence interval.

Extinction diameter: 0.89, 0.94, 0.92, null, 0.81 mm. Four nonmissing values; mean 0.89 mm; sample SD 0.05715476066 mm. Missing measurements are excluded per variable and are never replaced with zero.

Initial diameter versus burning-rate Pearson r = 0.1127169191 for five pairs. This selected tiny subset, with differing test conditions, does not support causal attribution or population inference. No statistical significance claim is made.

## Defects repaired

| Defect | Severity | Correction | Evidence |
|---|---|---|---|
| Any uploaded records falsely cited as NASA PSI-69 | High scientific integrity | Canonical SHA-256 identity check against bundled records; unmatched input marked unverified with null DOI | Custom-record provenance regression test |
| Reviewer stage accepted without independently checking arithmetic | Medium | Separate sum/sum-of-squares implementation can reject manipulated statistics | Tampered-mean rejection test |
| Null workflow input crashed | Medium | Validate before accessing rows | Null-input rejection test |
| Duplicate experiment IDs passed validation | Medium | Duplicate identifiers rejected | Duplicate ID test |
| CSV accepted garbage after closing quote or invalid header-only files | Medium | Closing-quote state and header validation enforced | Malformed CSV tests |
| Outcome strings collided with object prototype | Medium | Null-prototype frequency map | __proto__ regression test |

## Role organization

The response now exposes 16 role contracts, explicit allowed/denied capabilities, a task board, a numerical review artifact, a review history and unique run IDs. They are declarative responsibilities within a deterministic local orchestrator; they are not 16 independent model calls. The validator and arithmetic reviewer actually execute. The reviewer can reject results; bad records produce blocked calculation and correction-required history. Corrections require corrected input and a new run; no fake regression or approval events are generated. These functions have no tool executor, credential access, network permissions or filesystem mutation hooks. Role permissions describe that boundary; a future model/tool executor must enforce permissions separately.

The original stages array is retained for UI compatibility. Exact bundled identity confirms local consistency, not independent verification at NASA. Inferred source identity is withheld for custom uploads.

## Executed checks

`node --test tests/core.test.mjs tests/science.test.mjs`: 17 passed, 0 failed. Test scope includes independent numerical rejection, custom provenance, malformed input, duplicate identity, CSV quoting, invalid dates, units and null handling. No computer-vision, quantum-hardware, distributed-agent or full NASA-archive capability is claimed. No benchmark or external source verification is inferred from these unit checks.

Independent backend review identified omitted-statistic and finite-input overflow acceptance. The reviewer now requires the exact statistic field set and rejects nonfinite arithmetic; the new regression test passes.

