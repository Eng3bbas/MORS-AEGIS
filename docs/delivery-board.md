# MORS delivery board

Objective: a reproducible competition demonstration using the available NASA FLEX subset. Preserve the existing application and prioritize inspect → verify → compare → explain → export.

| Priority | Owner | Work | Acceptance | Status |
|---|---|---|---|---|
| P0 | Backend specialist | Input validation, security boundaries, provider errors | Isolated API contract tests; secrets absent from responses | In progress |
| P0 | Scientific specialist | Numerical audit and accountable review workflow | Independent recalculation; rejection on invalid input | In progress |
| P1 | Visualization specialist | Linked exploration and point inspector | Selection, filters, provenance, exports, session restoration | In progress |
| P1 | Orchestrator | Integration, independent review, regression evidence | Tests executed and limitations documented | In progress |

Review protocol: implement → independent review → reproduce defects → correct → regression → accept. A failed scientific gate blocks acceptance. Model text cannot validate a measurement. Engineering specialists in this delivery are independent agents; runtime workflow roles must disclose which steps are deterministic and which call a model.

Architecture decision: retain the working vanilla JavaScript/Node application. A framework migration is deferred to avoid consuming the demonstration budget without improving scientific functionality. Temporal playback and image-derived measurements require actual time series, imagery and calibration; the current five-row extract does not supply these.

Innovation backlog: (1) traceable point verification and linked comparison, high user value/low scientific risk, implementing; (2) reproducible session and annotations, high demonstration value, implementing; (3) full PSI archive ingestion and calibrated imagery, high scientific value, blocked on verified assets; (4) quantum benchmarks, deferred until a justified computational question and classical baseline exist.

Published competition judging criteria and event edition were not provided. Demonstration mapping uses evidence quality, scientific usefulness, usability and reliability as provisional evaluation dimensions, not claimed official criteria.
