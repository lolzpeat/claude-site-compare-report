# site-compare-report

Compares original (`www.bangkokbank.com/th-TH`) vs migrated (`prod-aem.bangkokbank.com/th`) pages
and produces a Thai HTML report of the differences.

Input is `pages.csv` (one `id,originalUrl,migratedUrl,category,subCategory` row per page).
Everything under `output/` is **gitignored and regenerable** — clone the repo, then rebuild it locally.

## Regenerating the report

Run the three stages in order from the repo root:

```bash
# 1. Capture — opens HEADED system Chrome, screenshots + snapshots both sites.
#    Resumable: it skips already-captured pages, so just re-run to retry failures.
node src/run-capture.js            # all pages in pages.csv
node src/run-capture.js --only bonds-and-debentures   # a single page

# 2. Compare — deterministic diff of the captured snapshots into per-page issues.
node src/run-compare.js

# 3. Report — build the HTML report + output/sheet-update.csv.
node src/run-report.js
```

Then open **`output/report/index.html`** in a browser.

- **`index.html`** — audit-ledger dashboard: search, filter (status / category / stat-chips), sortable columns, pagination.
- **`criteria.html`** — the check criteria, thresholds, detection methods, and statuses (Thai).
- **`systemic.html`** — issues that recur across the site (site-wide).
- per-page detail pages with side-by-side screenshots.

If you only changed comparison or report code (not the capture), you can skip step 1 and re-run
steps 2–3 against the existing snapshots — no re-capture needed.

## Why capture needs a real browser (WAF)

Both sites block non-browser clients, so capture must use headed system Chrome
(`channel:'chrome'`); `curl`/API clients fail. Batch runs get rate-limited — the pacing constants
live in `src/config.js` (`INTER_PAGE_DELAY_MS`, `MAX_LINK_CHECKS`, `LINK_CHECK_BATCH`); cool down
~10 minutes after a block. `prod-aem` occasionally throws a transient `net::ERR_HTTP2_PROTOCOL_ERROR`
— just re-run `run-capture` (resume retries only the failures).

## Tests

```bash
npm test
```

Uses the built-in `node:test` runner. (Run `npm test`, not `node --test test/`, which breaks on newer Node.)

## Docs

Design specs and implementation plans live in `docs/superpowers/`. Contracts and gotchas are in `CLAUDE.md`.
