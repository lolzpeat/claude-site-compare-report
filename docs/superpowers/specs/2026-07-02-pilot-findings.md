# Pilot Run Findings — Site Migration Comparison (10 pages)

**Date:** 2026-07-02
**Result:** 10/10 pages **Failed** validation. 0 Passed, 0 Capture Failed (all 20 captures eventually succeeded).

## Headline findings (migrated site, prod-aem)

**Systemic — affects every migrated page:**
1. **Site chrome is English, not Thai** (High). Header nav, utility nav, related-links strip, and footer render in English on every migrated page (original: Thai). Footer also shows a placeholder label "Personal 1".
2. **Hero title overlays missing** (High). Every original hero has a title/tagline overlay (e.g. "บ้านและที่อยู่อาศัย"); every migrated hero renders the bare image.
3. **Broken links throughout** (High). Migrated nav/footer links 404 (e.g. `/en/mutual-fund`, `/th/locate-us`) — including a literal **`/test-page`** link left in the shared nav.

**Not migrated at all (404):** 3 of 10 pages — `my-family-and-me`, `grow-club-31tips`, `digital-ibanking-ift` serve a 404 page at their migrated URL. Note: they 404 **without redirecting**, so redirect detection can't catch them (see Tuning below).

**Per-page defects:**
- `cards-bangkokbankm`: severely degraded — hero missing, tab strip renders as a plain bullet list, 6-product card grid + both promo carousels + M Rewards + partner logos all missing.
- `careers-tech-people` and `aec-investment-clinic`: image carousels broken (bare "Image" alt placeholders, controls degrade to numbered bullet lists); careers testimonial cards lost photos and reflowed out of order; AEC article body paragraphs missing.
- `bonds-debentures`: accordion modules, purchase-channel cards, and ข้อมูลเพิ่มเติม accordions missing.
- `news-detail-3ae3`: date renders "**Invalid Date**", article image broken, headline typography demoted.
- `manage-my-business`, `my-home`: content substantially migrated; only the systemic chrome/hero issues plus minor layout changes (my-home feature banner demoted to a card).

## Deliverables

- `output/report/index.html` — dashboard + per-pair side-by-side detail pages (synced scrolling).
- `output/sheet-update.csv` — 10 rows ready to import into the sheet's Validation Status / Open Issues columns.

## Operational learnings (capture)

- Both sites WAF-block non-browser clients; headed system Chrome works.
- The original batch run got **rate-limited mid-run** (WAF blocks on www, HTTP/2 resets on prod-aem). Fixes now in the pipeline: 20s inter-page delay, link checks capped at 50 per page in batches of 2 with 400ms gaps, fresh browser context per pair. After pacing, all captures succeeded across retry rounds (transient prod-aem HTTP/2 resets clear on re-run; resume logic makes re-runs cheap).
- Cookie-banner dismissal did not fire on original-site pages (banner visible in orig screenshots) — capture noise, hides a band of content mid-page.

## Comparator tuning notes (for scale-up)

1. **404-without-redirect detection**: add a check for 404-page fingerprint ('ไม่พบหน้าที่คุณต้องการ') in the migrated snapshot → single High "page not migrated" issue instead of ~80 cascade issues.
2. **Module comparator coarse on original**: www pages render as one giant wrapper module (orig modules=1), producing one noisy "หน้าแรกลูกค้าบุคคล module missing" issue per page and weak module matching. Needs a deeper module-extraction heuristic for the original site's DOM.
3. **Missing-link matching by text** works but counts are inflated by mega-menu links; consider scoping to main-content links at scale.
4. **Original-site in-page link checks all return 0** (CSP/WAF blocks fetch on www) — harmless today (only migrated statuses drive issues) but means orig-side link health is unchecked.
5. Cookie banner: add the original site's specific OneTrust selector so orig screenshots are clean.
6. **Skip link checks on the original side** (final review): only migrated-side statuses drive issues, yet capture spends ~15-30s per original page checking links that all return 0 — at 1,460 pages that's 8-12 wasted hours and extra WAF pressure.
7. **Link-check cap keeps nav links, drops content links** (final review): the 50-link cap takes links in document order, so shared mega-menu links crowd out page-specific main-content links; scope extraction to main content before capping.
8. Smaller hardening for the scale-up pass: validate AI-issue JSON shape on merge, validate pages.csv rows (missing columns, duplicate ids), re-read scrollHeight during lazy-load scroll, align case-sensitivity between link and text matching, remove dead launchContext(), move the image-count `-2` threshold into config.

## Region-tagging verification (deeper-comparators, 20-page Save & Invest batch)

Re-captured 20 Save & Invest pages (debentures + mutual funds) with region tagging + descent segmentation. 40/40 captures succeeded round 1. Results:

- **Region tagging works.** `textBlocks` now split by landmark (e.g. `bonds-and-debentures-orig`: header 29 / nav 99 / main 91 / footer 38, previously all lumped). Links/images/text/link-target issues carry a `region`; content comparators (text/image) now judge `main` only. Across the 20 pages, nearly every issue is region-tagged (only the 3 capture-status issues on the Not-Migrated/Retired pages are region-less, correctly). This resolves the "chrome reported as page-specific content loss" noise for text/images.
- **Descent segmentation still yields `modules=1` on every original page** — unchanged from the pilot. Root cause: these bank pages have **no `<main>` landmark**, so segmentation starts at `<body>`, whose only >40px child is the whole-page `div.page` wrapper (height ~4243px, heading "หน้าแรกลูกค้าบุคคล"). The single-child-descent never reaches the content sections because `div.page` has multiple children (header/content/footer siblings). Region tagging survives this because `main` is the fallback bucket, but module extraction does not.
- **Consequence — 18/18 comparable pages emit a false "หน้าแรกลูกค้าบุคคล" missing-module (own, not site-wide).** It fails to aggregate into one site-wide row because the issue embeds the per-page wrapper height in `original`/`description` (2763px, 3964px, 7453px…) → each `issueKey` differs → dedup misses (the exact CLAUDE.md "never embed per-page values in original/migrated" GOTCHA).

**Follow-ups (do not hand-tune in this task — recorded for the module-extraction pass, ref tuning note #2):**
1. Segment main content without relying on `<main>`: e.g. start descent from the largest non-chrome (region==='main') subtree, or pick the content container by excluding header/nav/footer landmarks, before taking module children.
2. Until (1) lands, stop the module comparator embedding per-page px height in `original`/`description` (use a stable `keyHint`) so the one chrome-wrapper false positive dedupes to a single site-wide row instead of ×18 per-page noise.

## Scale-up recommendation

The pipeline works end-to-end and the findings are real, but **hold the 1,460-page run** until: (a) the systemic issues above are triaged with the migration team — every page will fail while chrome is English and heroes are missing, so a full run adds little signal today; (b) the 404-fingerprint and module-extraction tuning items land; (c) pacing is validated on a ~50-page batch. With 20s pacing, 1,460 pages ≈ 2-3 days of sequential capture — plan batches, or relax pacing after confirming rate-limit thresholds.
