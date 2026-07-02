# Deeper Comparators: Region Tagging + Content Segmentation — Design

**Date:** 2026-07-02
**Status:** Approved
**Follows:** the merged pipeline (signal-quality + key-tuning). Addresses the "deeper comparators" roadmap direction.

## Problem

The comparators are coarse in two ways that hurt detection quality:

1. **Single-wrapper modules.** `extractSnapshot` takes `modules` as the direct children of `main||body`. When a page's content sits inside one wrapper `<div>` (the original bangkokbank site), it yields `modules=1` — so `compareModules` emits one noisy "หน้าแรกลูกค้าบุคคล module missing" per page and matches weakly.
2. **No chrome/main separation.** `links`, `images`, and `textBlocks` are collected from the whole document, so header/nav/footer chrome is compared as if it were page content. Chrome differences (English nav, footer) surface as page-level content loss; only systemic aggregation keeps them from dominating per-page reports.

Goal: catch real main-content differences, and stop treating shared chrome as page-specific content.

## Scope

Changes `src/capture/snapshot.js` (extraction) and the content comparators. Requires **re-capturing the 20 pages** (on-disk snapshots predate region tagging). Out of scope: parallel-pair capture, Sheets API (sub-project "scale & automation"); per-site config selectors; richer issue sub-typing beyond a `region` field.

## Design

### 1. Region tagging in `extractSnapshot`

Each captured element gains a `region`: `header` | `nav` | `footer` | `main` | `other`.

Determination — walk up from the element to the nearest semantic landmark:
- inside `<header>` or `[role=banner]` → `header`
- inside `<nav>` or `[role=navigation]` → `nav`
- inside `<footer>` or `[role=contentinfo]` → `footer`
- inside `<main>` or `[role=main]` → `main`
- none of the above → `main` (fallback: content that isn't in a chrome landmark is treated as main)

The nearest-ancestor landmark wins (a `<nav>` inside `<header>` → `nav`). Applied to every `link`, `image`, and text block.

`textBlocks` changes shape from `string[]` to `{text, region}[]`. `links` and `images` each gain a `region` field.

### 2. Content segmentation (fix modules=1)

Replace the "direct children of main" logic. Start at the main-region root (the `<main>`/`[role=main]` element, else `document.body`); **descend through single-child wrappers** — while the current node has exactly one element child, step into that child — and stop when the node has zero or ≥2 element children. Take that final node's element children with rendered height > 40px as the modules, each `{tag, className, heading, imageFiles, height, region:'main'}` (same fields as today plus `region`). This unwraps a page nested in one `<div>` down to its real sections without hardcoding site structure. Modules are main-region only by construction. (Guard against pathological nesting with a descent cap, e.g. 20 levels.)

### 3. Comparator changes

- `compareText`, `compareModules`, `compareImages`: restrict their missing/changed checks to `region==='main'` elements. (compareText reads `.text` from the new textBlock objects.)
- `compareLinks`, `compareLinkTargets`: unchanged scope — page-wide (a broken footer/nav link is still a real defect).
- Every issue gains an optional `region` field: the region of the element that produced it, or `page-wide` for whole-page/summary issues. Issue shape becomes `{category, severity, description, location, original?, migrated?, keyHint?, region?}`.
- Systemic aggregation (`issueKey`, `aggregateIssues`) is unchanged. `region` does not enter `issueKey` (keeps existing dedup behavior); it is display/filter metadata.

### 4. Report / CSV

- Report detail + systemic tables show `region` as a small badge/column (additive). CSV is unchanged (region is not added to the sheet columns — keeps the sheet contract stable).

## Data-shape impact

- **Breaking:** `textBlocks: string[]` → `{text, region}[]`. Touches `extractSnapshot`, `compareText`, and their tests. Everything else is additive (`region` on links/images/modules/issues).
- On-disk 20-page snapshots are stale → re-capture required before the verification run.

## Testing & Verification

- `test/snapshot.test.js`: fixture HTML gains `<header><nav>…</nav></header>`, a `<main>` whose content is inside one wrapper `<div>` with multiple sections beneath, and a `<footer>`. Assert: nav links tagged `nav`, footer text tagged `footer`, main content tagged `main`; module descent yields the multiple inner sections (not 1); a nav-inside-header link is `nav` not `header`.
- Comparator tests: a difference that exists only in chrome (e.g. a header text block present on original, absent on migrated) produces NO missing-text issue (main-scoped); a real main-content difference still does; issues carry the expected `region`. `compareText` tests updated for the `{text, region}` shape.
- Verification: re-capture the 20 pages (paced), then `node src/run-compare.js && node src/run-report.js`. Expected: original pages now yield multiple main modules (not 1); the "หน้าแรกลูกค้าบุคคล module missing" per-page noise is gone; per-page main-content issues are the focus; chrome text/image differences no longer appear as page-specific content loss. Spot-check 2-3 detail pages against screenshots to confirm real content differences are still caught and chrome is correctly tagged.
