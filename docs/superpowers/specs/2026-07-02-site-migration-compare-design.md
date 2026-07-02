# Site Migration Comparison Report — Design

**Date:** 2026-07-02
**Status:** Approved (pilot scope)

## Purpose

Bangkok Bank is migrating ~1,460 Thai-language pages from `www.bangkokbank.com/th-TH/...` to AEM at `prod-aem.bangkokbank.com/th/...`. Each migrated page must be validated against its original for:

- Image ratio / cropping differences
- Missing components or modules
- Broken links
- Incorrect text or language (Thai vs English)
- Incorrect visual layout (primary focus)

The source of truth is a Google Sheet ("TH Pages — Categorized BBL Thai Pages") with columns: original URL, Migrated Prod URL, AEM Path, Category, Sub-Category, Validation Status, Open Issues. All rows are currently "Not Started".

This project builds a repeatable comparison pipeline, validated first on a **10-page pilot**, then scalable to all 1,460 pages.

## Scope

- **Pilot:** 10 pages sampled across distinct categories/templates (see Pilot Sample below).
- **Viewport:** Desktop only, 1440px wide.
- **Out of scope (pilot):** mobile/tablet viewports, English pages, automated write access to the Google Sheet.

## Constraints

- Both sites block plain HTTP clients (curl times out — WAF/bot protection). A real browser engine is required. Both sites open normally in a regular browser without VPN or login.
- Google Drive MCP access is read-only; sheet write-back is delivered as an importable CSV, not direct cell updates.

## Architecture

A local Node.js project (`site-compare-report/`) with a 4-stage pipeline:

### Stage 1 — Input
`pages.csv` with one row per pair: original URL, migrated URL, category, sub-category. Pilot ships with 10 rows; the full 1,460 rows drop into the same file later with no code change.

### Stage 2 — Capture (Playwright)
Playwright using the installed Chrome channel (realistic fingerprint to pass the WAF), 1440px viewport. For each URL:

1. Load page, wait for network-idle, scroll through the page to trigger lazy-loaded images, dismiss cookie banners, freeze CSS animations/carousels.
2. Save a full-page screenshot (`output/shots/<pair-id>-{orig,mig}.png`).
3. Save a JSON page snapshot (`output/snapshots/<pair-id>-{orig,mig}.json`) containing:
   - **Links:** every `<a>` with href, link text, and HTTP status (checked via in-browser fetch to stay behind the WAF).
   - **Images:** every rendered `<img>`/CSS background image with src, natural W×H, rendered W×H, computed aspect ratio.
   - **Text:** headings and paragraphs in document order, with per-block script detection (Thai/Latin) for language checks.
   - **Module inventory:** the page's top-level sections/components identified by DOM structure and class names, in order.
   - Final URL after redirects.

### Stage 3 — Compare (deterministic, code only)
Diff the two snapshots per pair:

- **Broken links:** links on the migrated page with 4xx/5xx status; links present on original but absent on migrated.
- **Missing modules:** module inventory count/order mismatches.
- **Image ratio:** aspect-ratio deviation beyond 2% tolerance for corresponding images; natural-vs-rendered distortion.
- **Text/language:** normalized text diff (whitespace-collapsed); blocks whose detected script differs between original and migrated (e.g., English text where original was Thai). Known-dynamic blocks (dates, rates, counters) are excluded.
- **Redirect anomaly:** either URL landing on an unexpected final URL (404 page, homepage) → High severity.

### Stage 4 — AI visual review (Claude)
Claude reviews each screenshot pair side by side and flags visual layout issues code cannot judge: spacing, alignment, hero image cropping, font/style regressions, section ordering that "looks wrong". Findings merge into the same issue list.

Every issue carries: **category** (image-ratio | missing-module | broken-link | text-language | layout | capture-failure), **severity** (High/Medium/Low), description, and location on the page.

### Fallback
If the WAF blocks Playwright (detected via challenge-page fingerprint: unexpected title/content), the capture stage for affected pages swaps to driving the user's real Chrome via the claude-in-chrome extension. Downstream stages are unchanged.

## Outputs

Generated into `output/`:

### A. HTML report
- **`index.html` dashboard:** table of all pairs with pass/fail status and issue counts by category and severity; links to detail pages.
- **Detail page per pair:** side-by-side full-page screenshots (original left, migrated right, synced scrolling) followed by the issue list. Broken links listed with HTTP status.

### B. Sheet write-back CSV
`sheet-update.csv` with one row per page, joined on original URL:
- **Validation Status:** `Passed` / `Failed` / `Capture Failed`
- **Open Issues:** compact summary, e.g. `3 issues: 1 broken link, 1 image ratio, 1 layout`

User pastes/imports this into the sheet's Validation Status and Open Issues columns.

## Error Handling

- **Load failure/timeout:** retried twice, then marked `Capture Failed` — never silently skipped or reported as Passed.
- **WAF challenge:** detected and routed to the Chrome fallback.
- **Dynamic content noise:** carousels frozen, cookie banners dismissed pre-screenshot, dynamic text blocks excluded from diffs.
- **Redirects:** final URL recorded; unexpected destination flagged High severity.

## Verification

The pilot run is the test:

1. Build, run against the 10 pilot pages.
2. Spot-check at least 2 pairs manually in a browser: confirm reported issues exist and no obvious difference was missed.
3. Tune tolerances (image-ratio %, text normalization, module matching) from pilot results before scale-up.

## Pilot Sample (10 pages)

One page per distinct category/template:

| # | Category | Original path (th-TH) |
|---|----------|----------------------|
| 1 | Personal / Save & Invest | `/Personal/Save-And-Invest/Investment/Bonds-and-Debentures` |
| 2 | Personal / Grow Club | `/Personal/Grow-Club/31Days31Tips` |
| 3 | Personal / My Family & Me | `/Personal/My-Family-and-Me` |
| 4 | Personal / Cards | `/Personal/Cards/BangkokBankM` |
| 5 | Personal / Digital Banking | `/Personal/Digital-Banking/Bualuang-iBanking/IFT` |
| 6 | Personal / My Home | `/Personal/My-Home` |
| 7 | Business / Manage My Business | `/Business-Banking/Manage-My-Business` |
| 8 | About Us / Careers | `/About-Us/Bangkok-Bank-Careers/Tech-People` |
| 9 | International Banking | `/International-Banking/AEC-Connect/AEC-Investment-Clinic` |
| 10 | About Us / News Detail | `/About-Us/News-and-Media/News-Detail?id=3AE3CE57-9512-436B-9F18-BA198E727E2C&tag=New` |

Each migrated URL comes from the corresponding sheet row (#10 exercises the query-string → new AEM path structure edge case).

## Scale-up Path (post-pilot)

- Same pipeline over all 1,460 rows, batched (e.g., 20 concurrent captures) with resumable progress so a crash doesn't restart from zero.
- AI visual review batched by template similarity to control cost.
