# Signal Quality: Systemic-Issue Dedupe, 404 Verdicts, Rollup Dashboard — Design

**Date:** 2026-07-02
**Status:** Approved
**Follows:** 2026-07-02-site-migration-compare-design.md (pilot pipeline, built and merged)

## Problem

Pilot and 20-page runs show every page reporting 60–90 issues, but most repeat the same site-wide root causes (English chrome: ~17 text-language + ~21 link-target per page; ~30 shared broken nav links). Page-specific defects drown in the repetition, and 404 pages cascade into ~80 meaningless line-items instead of one verdict. The sheet CSV — the artifact the team imports — carries this noise.

## Scope

Sub-project 1 of 3 (chosen decomposition: 1 signal quality, 2 deeper comparators, 3 scale/automation).
- 404 page verdicts with two new statuses.
- Cross-page systemic-issue aggregation; per-page reports show only own issues.
- New site-wide rollup report page.
- Updated index, detail pages, and sheet CSV.
Out of scope: comparator internals (module extraction, chrome scoping), parallel pairs, Sheets API.

## Design

### 1. 404 verdicts (in `comparePair`, per-pair — no cross-page data needed)

New config: `NOT_FOUND_PATTERNS` — regex list matched against snapshot title + first text blocks: `ไม่พบหน้าที่คุณต้องการ` (both sites' Thai 404s) plus an English fallback (`page not found|404`).

Gate order in `comparePair`: capture-failure gate (existing) → 404 gate (new) → comparators.
- Migrated 404 → status **`Not Migrated`**, single High issue `{category:'broken-link', description:'Migrated URL serves a 404 page', original:'page exists', migrated:'404'}`.
- Original 404 (migrated alive) → status **`Retired on Original`**, single High issue (original:'404 (page retired)', migrated:'page exists').
- Both 404 → `Retired on Original`, one issue noting both sides.
No comparators run for these pages.

Status set becomes: `Passed | Failed | Capture Failed | Not Migrated | Retired on Original`. `mergeIssues` treats the two new statuses like `Capture Failed`: sticky, never recomputed from issue counts.

### 2. Systemic aggregation (pure module `src/report/systemic.js`, runs inside run-report)

- Issue key: `category + '|' + original + '|' + migrated`; when both values are absent, fall back to `category + '|' + normalized(description)`.
- Comparable pages: status `Passed`/`Failed` only (404/capture-failed excluded from both numerator and denominator).
- Systemic when the key appears on ≥ `SYSTEMIC_THRESHOLD` (0.6) of comparable pages AND comparable pages ≥ `SYSTEMIC_MIN_PAGES` (3). Below the floor, nothing is systemic.
- `aggregateIssues(pages) -> { systemic: [{issue, pageIds, count}], own: Map<pairId, Issue[]> }` — pure function; AI issues participate identically.
- run-report writes `output/issues/systemic.json` for traceability.

### 3. Report & CSV

- **`output/report/systemic.html`**: rollup dashboard — systemic issues in the existing collapsible category groups with original/migrated columns, each row showing `N/M pages` reach and the affected-page list (links to detail pages), sorted by reach desc then severity.
- **Index**: banner line linking to systemic.html ("38 site-wide issues affect up to 20/20 pages"); table splits Issues into `Own` and `Site-wide` counts; status column shows the five statuses (CSS classes keyed on first word — `Not`, `Retired` added).
- **Detail pages**: own issues only, plus one reference line "+N site-wide issues affect this page — see systemic report" linking to systemic.html.
- **Sheet CSV**: `validationStatus` may now be any of the five statuses; `openIssues` format: `4 own issues: 2 missing-module, 1 layout, 1 image-ratio (+38 site-wide)`; `Not Migrated` rows carry the fixed summary `Migrated URL serves a 404 page`; `Retired on Original` rows carry `Original URL serves a 404 page (offering retired?)` — no issue counts.
- A page with zero own issues but affected by systemic ones remains `Failed` — affected is affected; the summary makes the split visible.

### 4. Testing & verification

- Unit: 404 gate (mig/orig/both/fingerprint-miss), merge stickiness for new statuses, aggregation (threshold boundary, min-page floor, key fallback, AI participation), systemic.html rendering, index/detail/CSV changes.
- Verification: re-run `run-compare` + `run-report` on the existing 20-page snapshots (no re-capture). Expected: mtc-debentures → `Retired on Original`; the ~21 link-target + ~17 text-language chrome issues collapse into systemic entries; per-page own-issue counts drop to single digits for template-identical pages.
