# site-compare-report

Compares original (www.bangkokbank.com/th-TH) vs migrated (prod-aem.bangkokbank.com/th) pages.
Spec/plan/findings: docs/superpowers/. Execution ledger + open product decisions: .superpowers/sdd/progress.md (gitignored). Input: pages.csv. All output/ is gitignored, resumable.

## Commands

- `npm test` — node:test suite (must stay green; `node --test test/` breaks on newer Node, use `npm test`)
- `python3 scripts/gen-pages.py > pages.csv` — regenerate pages.csv from the master workbook (input/BBL_pages.xlsx, 2 sheets → 1460 rows). Cols: id,originalUrl,migratedUrl,category,subCategory,sheet. IDs: categorized = migrated path slug (parent-leaf fallback on clash); news = full GUID (news-detail-<guid>).
- `node src/run-capture.js [--only <id>] [--sheet "<name>"]` — capture (HEADED system Chrome; skips already-captured, re-run to retry failures). Auto cool-down on WAF block (WAF_COOLDOWN_MS ×streak, capped ×3).
- `node src/run-compare.js [--sheet "<name>"]` → `node src/run-report.js [--sheet "<name>"]` — deterministic diff, then per-sheet HTML dashboards + output/sheet-update.csv
- Sheets = spreadsheet tabs: `"TH Pages - Categorized"` (632) and `"News & Media Articles"` (828 News-Detail). Use `--sheet` to scope capture/compare/report to one. GOTCHA: a --sheet-scoped run-report rewrites the landing page and the sheet-nav strip from the filtered set only (cross-sheet links vanish) — finish with a full `node src/run-report.js`.
- `bash scripts/deploy-report.sh [team]` — deploy the static report to Vercel (run `npx vercel login` once first). output/ is gitignored so this is a direct folder deploy of output/ (not git-connected, can't rebuild on Vercel — regeneration needs uncommitted snapshots); entry is /report/. run-report auto-writes output/index.html (redirect) + output/.vercelignore (trims snapshots/, issues/). `--scope`/team is REQUIRED (account has 2 teams, no non-interactive default; script defaults praponts-projects). Deploy is PUBLIC (no auth) and ~380MB/1995 files at 200 news pages — watch Vercel size as page count grows. Live: output-coral-six.vercel.app.

## Report structure (per-sheet)

- run-report groups pages by their `sheet` column. Output: `output/report/index.html` = landing (one card per sheet) → `output/report/<slug>/index.html` = that sheet's dashboard, with its own systemic.html, criteria.html, chrome.html, `<id>.html` detail pages, systemic.json, chrome.json. Relative links (index/systemic/criteria/<id>.html) resolve within each subdir — renderIndex/renderDetail/renderSystemic are dir-agnostic; only renderLanding (html.js) is new. Systemic is aggregated per-sheet.
- Sheet dashboards carry a nav strip (← หน้ารวม + cross-sheet links, current sheet bold) via renderIndex's 4th param sheetNav [{name, slug, current}] — built in run-report from the groups map; default [] renders nothing.
- rtk hook rewrites `find` → `rtk find`, which rejects compound predicates (`!`, `-delete`, `-exec`) — use a shell loop or `command find` instead.

## WAF gotchas (cost us a failed batch run)

- Both sites block non-browser clients — curl/APIRequestContext fail; only headed `channel:'chrome'` works
- Batch runs get rate-limited: pacing constants in src/config.js (INTER_PAGE_DELAY_MS, MAX_LINK_CHECKS, LINK_CHECK_BATCH). run-capture now auto-pauses WAF_COOLDOWN_MS (×streak, cap ×3) on a block; blocks still appear after ~tens of pages, so full-corpus runs are multi-hour.
- Closing the headed Chrome window mid-run kills the process ("Target page, context or browser has been closed"); resume retries only failures — don't close Chrome during a run.
- prod-aem throws transient net::ERR_HTTP2_PROTOCOL_ERROR — just re-run run-capture (resume retries only failures)
- Capture runs both sides concurrently in separate contexts (www/prod-aem = independent WAF limits); original-side link status checks are skipped (only migrated statuses are used). Settle waits are bounded (NETWORKIDLE_MS) — bank pages never reach true idle.

## Snapshot invariants (src/capture/snapshot.js)

- extractSnapshot runs via page.evaluate — MUST stay self-contained (no imports/closures). Its thresholds are INLINE literals, not config.js: MIN_MODULE_HEIGHT 40 (capture)/80 (compare in modules.js), COARSE_MODULE_MIN_HEIGHT 1000, ICON_MAX_PX 48.
- snapshot.textBlocks are {text, region} objects (NOT strings) — use `.text`. region ∈ header|nav|footer|main (main = fallback). Content comparators (text/image/module) scope to region==='main'; generic link comparators scope to CONTENT_REGIONS (main/page-wide) — chrome regions (header/nav/footer) belong to src/compare/chrome.js.
- Modules: chrome-aware descent excludes header/nav/footer; a coarse blob (≥1000px, ≥2 h2) is split into one module per h2 (h3 are sub-points). Original pages are flat (no <main>); missing-module still has residual false positives from flat-vs-segmented asymmetry — see docs/superpowers/specs/2026-07-02-pilot-findings.md.
- Original flat pages leak the cookie-consent block (~2373 chars, identical across pages) into region 'main' — any "longest main block" / text-length heuristic will grab it (why the News-Detail content check is presence-only, not a length diff vs original).

## Contracts (exact strings — used across modules, tests, and report)

- Issue categories: broken-link | link-target | image-ratio | text-language | missing-module | layout | capture-failure | news-element | hero | menu-label
  (link-target = an original link's destination, transformed to its expected migrated URL via /th-TH/→/th/ + lowercase, isn't linked on migrated — catches menu items repointed to the wrong page)
  (news-element = element-level defects on News-Detail articles: headline/date/content/image/breadcrumb/share. src/compare/news-detail.js; comparePair routes News-Detail pages there via isNewsDetail and SKIPS the generic link/text/module comparators — they only false-positive on that template. location = news:headline|news:date|news:content|news:image|news:breadcrumb|news:share)
  (migrated AEM chrome — nav/breadcrumb — renders in English not Thai, a real migration defect that also inflates text-language FPs on the generic comparators; another reason News-Detail routes to its own comparator. Corpus-wide defects confirmed on 200 articles: every migrated news page has date="Invalid Date" + missing share + English breadcrumb)
  (hero = first main-region module image/heading mismatch, conservative, per-page)
  (menu-label = chrome link matched by URL but labelled differently; chrome-zone issues live in chromeIssues, never affect page status)
- Severities: High | Medium | Low
- Statuses: Passed | Failed | "Capture Failed" | "Not Migrated" (migrated 404) | "Retired on Original" (original 404); never report a failed capture as Passed. Capture Failed / Not Migrated / Retired on Original are sticky in mergeIssues. 404 detection = looksNotFound (NOT_FOUND_PATTERNS) gate in comparePair.
- Issue shape: {category, severity, description, location, original?, migrated?}; comparators set original/migrated to the concrete before/after values, report shows them as columns (— when absent); zone?: header-nav|footer|hero|main (absent = main)
- comparePair returns { status, issues, chromeIssues, chromeStats }; status from issues only. Generic link comparators are scoped to CONTENT_REGIONS (main/page-wide); chrome regions (header/nav/footer) belong to src/compare/chrome.js.
- AI visual review: write output/issues/ai/<id>.json as {pairId, issues:[{category,severity,description,location}]}; original/migrated optional; run-report merges it

## Zone checks (chrome/hero) gotchas

- Chrome link matching: migrated AEM chrome links point to /en/... (not /th/...), so URL-key pairing matches ~1/147 — chrome per-link label checks (text-language/menu-label) are mostly dormant on real data; the English-chrome defect surfaces as the link-target zone-coverage summary at full reach instead. Pending decision: language-agnostic fallback match (see .superpowers/sdd/progress.md).
- Chrome aggregation scale: News sheet chrome.json ≈ 846 per-URL broken-link entries + full pageIds arrays (~2.7MB/sheet in the public deploy) — cap pageIds before the corpus grows; rendering groups nothing yet (846-row table).
- Hero check: fires only when orig's first main module has imageFiles (15 hits corpus-wide); observed ~20% FP — bogus "image missing" on pages where the image exists (module-boundary quirk).

## Systemic aggregation (run-report)

- aggregateIssues (src/report/systemic.js) splits each page's issues into site-wide (≥ SYSTEMIC_THRESHOLD of comparable Passed/Failed pages, min SYSTEMIC_MIN_PAGES) vs per-page "own". Renders output/report/systemic.html + output/issues/systemic.json; index shows Own/Site-wide split.
- Dedup key = issueKey(issue) = category|original|migrated (or category|normalizeText(description) when no values). GOTCHA: never embed per-page counts/URLs in original/migrated — it breaks cross-page dedup. Use a stable keyHint for summary/cap issues instead.

## Report rendering (src/report/)

- UI is Thai. labels.js maps English contract values (severity/status/category/region) → Thai DISPLAY only; keep contract values + CSS class names English. html.js exports esc + CSS (reused by criteria.js).
- index.html is a client-side dashboard (search/filter/sort/pagination, baked-in vanilla JS). criteria.html documents criteria/thresholds from LIVE config imports. run-report is pure render — re-run it (no re-capture) after compare/report code changes.
- Browser-test the report via `python3 -m http.server` in **output/** (not output/report) then open localhost:PORT/report/ — screenshots live in output/shots, which detail pages reference as `../../shots/…` (they sit in report/<slug>/); serving from output/report puts shots outside the web root so images 404. file:// is blocked by the Chrome extension AND the Playwright MCP.
- Issue descriptions are translated to Thai at RENDER time by src/report/describe.js (regex rules over the comparators' English strings; unmatched → English fallback) — comparators MUST keep emitting English: descriptions feed issueKey's fallback and stored det JSON. When adding a comparator check, add a describe.js rule + test; python3 scripts/describe-coverage.py measures real-data coverage. Value columns shorten known-host URLs via displayValue (html.js) — it returns HTML, never re-esc it.
- chrome.html broken-link grouping parses `→ HTTP <n>` / `→ unreachable` from issue.migrated — links.js's migrated-value format is a display contract; changing it silently degrades grouping to "อื่น ๆ".

## AI visual review

- For homogeneous batches (many pages sharing one template, e.g. the Save & Invest debentures), review a few representatives per template cluster + any outliers, not every page — the systemic defects repeat. Note which pages you did/didn't view.

## Scale-up

- Do NOT run all 1,460 pages before the tuning items in docs/superpowers/specs/2026-07-02-pilot-findings.md land
