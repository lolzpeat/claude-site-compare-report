# site-compare-report

Compares original (www.bangkokbank.com/th-TH) vs migrated (prod-aem.bangkokbank.com/th) pages.
Spec/plan/findings: docs/superpowers/. Input: pages.csv. All output/ is gitignored, resumable.

## Commands

- `npm test` — node:test suite (must stay green; `node --test test/` breaks on newer Node, use `npm test`)
- `node src/run-capture.js [--only <id>]` — capture (opens HEADED system Chrome; skips already-captured pages, so re-run to retry failures)
- `node src/run-compare.js` → `node src/run-report.js` — deterministic diff, then merged HTML report + output/sheet-update.csv

## WAF gotchas (cost us a failed batch run)

- Both sites block non-browser clients — curl/APIRequestContext fail; only headed `channel:'chrome'` works
- Batch runs get rate-limited: keep pacing constants in src/config.js (INTER_PAGE_DELAY_MS, MAX_LINK_CHECKS, LINK_CHECK_BATCH); cool-down ~10 min after a block
- prod-aem throws transient net::ERR_HTTP2_PROTOCOL_ERROR — just re-run run-capture (resume retries only failures)
- Capture runs both sides concurrently in separate contexts (www/prod-aem = independent WAF limits); original-side link status checks are skipped (only migrated statuses are used). Settle waits are bounded (NETWORKIDLE_MS) — bank pages never reach true idle.

## Snapshot invariants (src/capture/snapshot.js)

- extractSnapshot runs via page.evaluate — MUST stay self-contained (no imports/closures). Its thresholds are INLINE literals, not config.js: MIN_MODULE_HEIGHT 40 (capture)/80 (compare in modules.js), COARSE_MODULE_MIN_HEIGHT 1000, ICON_MAX_PX 48.
- snapshot.textBlocks are {text, region} objects (NOT strings) — use `.text`. region ∈ header|nav|footer|main (main = fallback). Content comparators (text/image/module) scope to region==='main'; link comparators stay page-wide.
- Modules: chrome-aware descent excludes header/nav/footer; a coarse blob (≥1000px, ≥2 h2) is split into one module per h2 (h3 are sub-points). Original pages are flat (no <main>); missing-module still has residual false positives from flat-vs-segmented asymmetry — see docs/superpowers/specs/2026-07-02-pilot-findings.md.

## Contracts (exact strings — used across modules, tests, and report)

- Issue categories: broken-link | link-target | image-ratio | text-language | missing-module | layout | capture-failure
  (link-target = an original link's destination, transformed to its expected migrated URL via /th-TH/→/th/ + lowercase, isn't linked on migrated — catches menu items repointed to the wrong page)
- Severities: High | Medium | Low
- Statuses: Passed | Failed | "Capture Failed" | "Not Migrated" (migrated 404) | "Retired on Original" (original 404); never report a failed capture as Passed. Capture Failed / Not Migrated / Retired on Original are sticky in mergeIssues. 404 detection = looksNotFound (NOT_FOUND_PATTERNS) gate in comparePair.
- Issue shape: {category, severity, description, location, original?, migrated?}; comparators set original/migrated to the concrete before/after values, report shows them as columns (— when absent)
- AI visual review: write output/issues/ai/<id>.json as {pairId, issues:[{category,severity,description,location}]}; original/migrated optional; run-report merges it

## Systemic aggregation (run-report)

- aggregateIssues (src/report/systemic.js) splits each page's issues into site-wide (≥ SYSTEMIC_THRESHOLD of comparable Passed/Failed pages, min SYSTEMIC_MIN_PAGES) vs per-page "own". Renders output/report/systemic.html + output/issues/systemic.json; index shows Own/Site-wide split.
- Dedup key = issueKey(issue) = category|original|migrated (or category|normalizeText(description) when no values). GOTCHA: never embed per-page counts/URLs in original/migrated — it breaks cross-page dedup. Use a stable keyHint for summary/cap issues instead.

## Report rendering (src/report/)

- UI is Thai. labels.js maps English contract values (severity/status/category/region) → Thai DISPLAY only; keep contract values + CSS class names English. html.js exports esc + CSS (reused by criteria.js).
- index.html is a client-side dashboard (search/filter/sort/pagination, baked-in vanilla JS). criteria.html documents criteria/thresholds from LIVE config imports. run-report is pure render — re-run it (no re-capture) after compare/report code changes.
- Browser-test the report via `python3 -m http.server` in output/report then drive localhost — file:// is blocked by the Chrome extension AND the Playwright MCP.

## AI visual review

- For homogeneous batches (many pages sharing one template, e.g. the Save & Invest debentures), review a few representatives per template cluster + any outliers, not every page — the systemic defects repeat. Note which pages you did/didn't view.

## Scale-up

- Do NOT run all 1,460 pages before the tuning items in docs/superpowers/specs/2026-07-02-pilot-findings.md land
