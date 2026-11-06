# Interactive Research Explorer

The new navigation entry loads a focused research workspace using the bundled PSI-69 table. Existing pages remain available. State is shared between two scatter plots, inspector, filters, data table and deterministic insight calculations. Each test is an independent point; no false time-series line is drawn. Missing values remain missing.

## Control acceptance matrix

| Control | Implemented behavior | Failure/limitation |
|---|---|---|
| X/Y selectors | Update variable and unit labels, linked X axes and summary | Only six documented numeric fields |
| Outcome/date filters | Update both charts, table and statistics | Empty result explicitly displayed |
| Point click/touch/Enter/Space; record selector | Inspect selected source record; highlight in linked views | Missing variable reported rather than plotted |
| VERIFY THIS DATA POINT | Displays exact bundled row and external source link | Local trace only, not independent validation of NASA measurement |
| Legend checkbox | Hide/show that record in both charts | Does not silently change statistical sample |
| Zoom/pan/reset | Change shared X window; reset complete workspace | Finite zoom levels; no wheel interception |
| Fullscreen | Native browser fullscreen with error notification | Browser support/permissions dependent |
| Save/restore | Local schema-checked session, filters, notes and findings | Storage failure produces notification |
| Annotation and finding | Retained in session and report export | Save session needed for persistence |
| CSV/SVG/JSON export | Filtered original rows, primary chart, reproducibility report | No PNG export in this release |
| Copy configuration | Copies full reproducibility JSON | Fallback message directs JSON export |

Scientific summary uses arithmetic mean and sample standard deviation (n−1), excluding non-finite values. SD measures sample spread, not sensor uncertainty. No population confidence interval or causal conclusion is generated from five selected records. No temporal imagery is available, so synchronized video playback is not implemented. Independent datasets are not represented as comparison groups.

Responsive layout collapses to one column below 850px; control targets are at least 44px; record selection provides a semantic alternative to SVG interaction. Controls and point keyboard behavior require runtime browser verification by the integration reviewer. Syntax and pure numerical checks are executed separately and recorded in the main validation report.
