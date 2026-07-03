# site-compare-report

Compares original (www.bangkokbank.com/th-TH) vs migrated (prod-aem.bangkokbank.com/th) pages.
Spec/plan/findings: docs/superpowers/. Input: pages.csv. All output/ is gitignored, resumable.

## Commands

- `npm test` — node:test suite (must stay green; `node --test test/` breaks on newer Node, use `npm test`)
- `python3 scripts/gen-pages.py > pages.csv` — regenerate pages.csv from the master workbook (input/BBL_pages.xlsx, 2 sheets → 1460 rows). Cols: id,originalUrl,migratedUrl,category,subCategory,sheet. IDs: categorized = migrated path slug (parent-leaf fallback on clash); news = full GUID (news-detail-<guid>).
- `node src/run-capture.js [--only <id>] [--sheet "<name>"]` — capture (HEADED system Chrome; skips already-captured, re-run to retry failures). Auto cool-down on WAF block (WAF_COOLDOWN_MS ×streak, capped ×3).
- `node src/run-compare.js [--sheet "<name>"]` → `node src/run-report.js [--sheet "<name>"]` — deterministic diff, then per-sheet HTML dashboards + output/sheet-update.csv
- Sheets = spreadsheet tabs: `"TH Pages - Categorized"` (632) and `"News & Media Articles"` (828 News-Detail). Use `--sheet` to scope capture/compare/report to one.

## Report structure (per-sheet)

- run-report groups pages by their `sheet` column. Output: `output/report/index.html` = landing (one card per sheet) → `output/report/<slug>/index.html` = that sheet's dashboard, with its own systemic.html, criteria.html, `<id>.html` detail pages, systemic.json. Relative links (index/systemic/criteria/<id>.html) resolve within each subdir — renderIndex/renderDetail/renderSystemic are dir-agnostic; only renderLanding (html.js) is new. Systemic is aggregated per-sheet.

## WAF gotchas (cost us a failed batch run)

- Both sites block non-browser clients — curl/APIRequestContext fail; only headed `channel:'chrome'` works
- Batch runs get rate-limited: pacing constants in src/config.js (INTER_PAGE_DELAY_MS, MAX_LINK_CHECKS, LINK_CHECK_BATCH). run-capture now auto-pauses WAF_COOLDOWN_MS (×streak, cap ×3) on a block; blocks still appear after ~tens of pages, so full-corpus runs are multi-hour.
- Closing the headed Chrome window mid-run kills the process ("Target page, context or browser has been closed"); resume retries only failures — don't close Chrome during a run.
- prod-aem throws transient net::ERR_HTTP2_PROTOCOL_ERROR — just re-run run-capture (resume retries only failures)
- Capture runs both sides concurrently in separate contexts (www/prod-aem = independent WAF limits); original-side link status checks are skipped (only migrated statuses are used). Settle waits are bounded (NETWORKIDLE_MS) — bank pages never reach true idle.

## Snapshot invariants (src/capture/snapshot.js)

- extractSnapshot runs via page.evaluate — MUST stay self-contained (no imports/closures). Its thresholds are INLINE literals, not config.js: MIN_MODULE_HEIGHT 40 (capture)/80 (compare in modules.js), COARSE_MODULE_MIN_HEIGHT 1000, ICON_MAX_PX 48.
- snapshot.textBlocks are {text, region} objects (NOT strings) — use `.text`. region ∈ header|nav|footer|main (main = fallback). Content comparators (text/image/module) scope to region==='main'; link comparators stay page-wide.
- Modules: chrome-aware descent excludes header/nav/footer; a coarse blob (≥1000px, ≥2 h2) is split into one module per h2 (h3 are sub-points). Original pages are flat (no <main>); missing-module still has residual false positives from flat-vs-segmented asymmetry — see docs/superpowers/specs/2026-07-02-pilot-findings.md.
- Original flat pages leak the cookie-consent block (~2373 chars, identical across pages) into region 'main' — any "longest main block" / text-length heuristic will grab it (why the News-Detail content check is presence-only, not a length diff vs original).

## Contracts (exact strings — used across modules, tests, and report)

- Issue categories: broken-link | link-target | image-ratio | text-language | missing-module | layout | capture-failure | news-element
  (link-target = an original link's destination, transformed to its expected migrated URL via /th-TH/→/th/ + lowercase, isn't linked on migrated — catches menu items repointed to the wrong page)
  (news-element = element-level defects on News-Detail articles: headline/date/content/image/breadcrumb/share. src/compare/news-detail.js; comparePair routes News-Detail pages there via isNewsDetail and SKIPS the generic link/text/module comparators — they only false-positive on that template. location = news:headline|news:date|news:content|news:image|news:breadcrumb|news:share)
  (migrated AEM chrome — nav/breadcrumb — renders in English not Thai, a real migration defect that also inflates text-language FPs on the generic comparators; another reason News-Detail routes to its own comparator. Corpus-wide defects confirmed on 200 articles: every migrated news page has date="Invalid Date" + missing share + English breadcrumb)
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
- Browser-test the report via `python3 -m http.server` in **output/** (not output/report) then open localhost:PORT/report/ — screenshots live in output/shots, which detail pages reference as `../../shots/…` (they sit in report/<slug>/); serving from output/report puts shots outside the web root so images 404. file:// is blocked by the Chrome extension AND the Playwright MCP.

## AI visual review

- For homogeneous batches (many pages sharing one template, e.g. the Save & Invest debentures), review a few representatives per template cluster + any outliers, not every page — the systemic defects repeat. Note which pages you did/didn't view.

## Scale-up

- Do NOT run all 1,460 pages before the tuning items in docs/superpowers/specs/2026-07-02-pilot-findings.md land
