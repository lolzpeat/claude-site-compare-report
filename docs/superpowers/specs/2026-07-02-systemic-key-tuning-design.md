# Systemic Key Stabilization + Threshold Tuning — Design

**Date:** 2026-07-02
**Status:** Approved
**Follows:** 2026-07-02-signal-quality-design.md (merged). Addresses that feature's deferred follow-up ticket.

## Problem

After the signal-quality feature merged, per-page "own" issue counts dropped from ~74-93 to 12-31 — better, but short of the goal (genuinely page-specific issues only). Two root causes, both identified in the final review:

1. **Count-embedding summary issues.** The cap/summary issues in `src/compare/links.js`, `src/compare/text.js`, and `src/compare/link-targets.js` put per-page counts into their `original`/`migrated` values (e.g. `original: "114 original links"`, `migrated: "114 missing"`). Since `issueKey = category|original|migrated`, the same summary on two pages with different counts produces different keys and never dedupes — so it stays "own" on every page.
2. **Near-threshold shared issues.** Some genuinely-shared chrome issues appear on 9-10 of 17 comparable pages — just under the 0.6 systemic threshold — so they aren't promoted to site-wide.

## Scope

Small, additive tuning. No change to capture, report rendering, or CSV. Files: `src/report/systemic.js` (issueKey), the three comparators (add keyHint to their summary issues), `src/config.js` (threshold). Out of scope: deeper module extraction, main-content scoping, parallel capture, Sheets API (separate sub-projects).

## Design

### 1. Optional `keyHint` on the Issue shape

Issue shape gains an optional field: `{category, severity, description, location, original?, migrated?, keyHint?}`. Purely additive — issues without `keyHint` are unaffected.

`issueKey(i)` in `src/report/systemic.js` gains a leading branch:
```
if keyHint present  -> `${category}|${keyHint}`
else if original/migrated non-empty -> `${category}|${original}|${migrated}`   (unchanged)
else -> `${category}|${normalizeText(description)}`                            (unchanged)
```
Every existing issue (no keyHint) keys exactly as today, so all current systemic classification is preserved. `keyHint` is a dedup key only — it never appears in any rendered output; `description`/`original`/`migrated` continue to carry the human-readable per-page detail (including the live count).

### 2. Stable keyHints on the three summary issues

The "> cap, N total" summary issues get a fixed `keyHint`:
- `src/compare/links.js` missing-links summary → `keyHint: 'orig-links-missing-summary'`
- `src/compare/text.js` missing-text-blocks summary → `keyHint: 'text-blocks-missing-summary'`
- `src/compare/link-targets.js` missing-targets summary → `keyHint: 'link-targets-missing-summary'`

Only these three summary issues change; the per-item issues (each carrying a genuinely page-specific link/text value) are untouched — they should stay per-page unless the value itself recurs.

### 3. Threshold 0.6 → 0.5

`SYSTEMIC_THRESHOLD` in `src/config.js` changes from `0.6` to `0.5`. An issue on ≥50% of comparable pages is systemic. Rationale: a nav/footer element present on half the template-identical pages is almost certainly shared chrome. `SYSTEMIC_MIN_PAGES` (3) is unchanged, so tiny runs still can't over-promote.

## Testing & Verification

- Unit (`test/systemic.test.js`): keyHint precedence (two issues with different original/migrated but the same keyHint dedupe to one systemic entry; keyHint wins over values); 0.5 boundary (an issue on exactly half of comparable pages is systemic, one below half is not).
- Comparator tests: the existing cap-summary tests in `test/compare-links.test.js`, `test/compare-text.test.js`, `test/compare-link-targets.test.js` gain an assertion that the summary issue carries the expected `keyHint`.
- Verification: re-run `node src/run-compare.js && node src/run-report.js` on the existing 20-page snapshots. The success signal is **per-page own counts dropping below the prior 12-31** (the 3 summary issues collapse from per-page to systemic, and the 0.5 threshold promotes the 9-10/17 near-misses). The total systemic-entry count may move either direction (keyHint collapses some entries; the lower threshold promotes others) — that number is not the metric. Spot-check that no obviously page-specific issue (e.g. a page's unique body text) is now mis-promoted to systemic; if one is, note it — do not raise the threshold back without evidence.
