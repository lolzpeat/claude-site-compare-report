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

## Module-segmentation verification (A1 chrome-aware descent, 2026-07-03)

Implemented A1 (chrome-aware descent: descend through single content wrappers, skipping `header`/`nav`/`footer` landmark subtrees via `regionOf`) + the dedup fix (drop per-page px from the issue `original`). Re-captured the 20 pages (40/40 round 1). Results:

- **The "หน้าแรกลูกค้าบุคคล" whole-page wrapper false module is eliminated** (0 occurrences, was 18/18). Original pages now segment to ≥2 real content modules with the chrome excluded.
- **The dedup fix is proven on real data.** A generic `arrow-right.svg` icon-identity module recurs on 17 pages but now collapses to **one site-wide row** (was 18 undeduped per-page rows) — `issueKey` is stable now that `original` carries no px.
- **Residual: module comparison still emits ~16 per-page false-positive `missing-module` issues, caused by asymmetric segmentation granularity, not a regression.** Concretely, `bonds-and-debentures`: original = **1 coarse module** `การลงทุน` (3810px, the whole content area — the original bank DOM is a monolithic `div` with no internal section landmarks) + a 203px icon block; migrated = **8 finely-segmented modules** (`จุดเด่นพันธบัตรตลาดแรก`, `พันธบัตรรัฐบาล`, `ช่องทางการซื้อขาย…`, `ข้อมูลเพิ่มเติม`, `เลือกผลิตภัณฑ์…`, `เครื่องมือช่วยเหลือ`). The AEM (migrated) site has clean structure; the original does not. So the original's coarse heading (`การลงทุน`/`หุ้นกู้`/`กองทุนรวม`) matches nothing on the granular migrated side → reported missing. These fall below the 50% systemic threshold, so they stay per-page own.

**Net:** A1 achieved its scoped goal (kill the wrapper false positive, enable dedup) but did **not** make the module comparator trustworthy on these pages, because structural descent cannot break the original site's flat, landmark-free content `div` into sections — exactly the spec's non-goal (readability-grade extraction). The module comparator's value is capped by the original DOM's flatness.

**Follow-ups (out of the A1 plan's scope — need a design decision):**
1. **Heading-based segmentation on the original side**: split the one coarse content module by its internal `h2`/`h3` headings so its granularity matches the migrated side, before comparing. Highest-value next step for real module signal.
2. **Exclude icon-only image identity**: a module identified solely by a shared UI icon (`arrow-right.svg`, small `.svg`) should not count as an identity for `missing-module` — drop tiny/icon images from `imageFiles` or require a heading.
3. **Or reconsider the module comparator on asymmetric pages**: if (1) is not pursued, consider lowering `missing-module` severity or gating it when original-side module count is 1–2 (coarse), to avoid systematic false positives at scale.

## Heading-split + icon-filter verification (follow-ups #1a/#2, 2026-07-03)

Implemented #2 (drop icon-sized images from module identity) and #1a (split a coarse content blob by heading). #1a initially split by h2+h3 and **over-fragmented** on the real nested DOM (bonds-and-debentures: 22 modules, many height 0, duplicate/partial headings, h3 bullet-points split out as pseudo-modules) — `missing-module` went 2→5 on that page. Refined to **h2-only + drop sub-40px sections**: bonds went 22→7 modules (matching the migrated side's 7 clean sections) and 5→1. Re-captured all 20 (40/40 round 1). Full-set results:

- **`missing-module` 33 → 23** across 17 pages. The `arrow-right.svg` icon-identity site-wide row and the coarse `การลงทุน`/`หุ้นกู้`/`กองทุนรวม` per-page false positives are **gone**. The original now exposes its real top-level section headings (จุดเด่นพันธบัตรตลาดแรก, พันธบัตรรัฐบาล, ช่องทางการซื้อขาย, ข้อมูลเพิ่มเติม, เลือกผลิตภัณฑ์) as modules that match the migrated side.
- **Residual (dominant): a trailing "ธนาคารพร้อมให้คำปรึกษา…" section false-flags on ~15 pages.** Root cause is a heading-vs-content asymmetry, not missing content: on the original this CTA band is an `h2` (so it becomes a module heading); on the migrated side the same text is present in main content but NOT as a module heading (migrated's trailing module heading is `เครื่องมือช่วยเหลือ`). Verified: the phrase IS in the migrated main textBlocks. Two whitespace variants of the heading ("ดูแลคุณในทุก" vs "ดูแลคุณ ในทุก") split it into 12+3 rows instead of one. The remaining issues are per-page singletons (สิทธิพิเศษ ปี 2569, ราคาพันธบัตรออมทรัพย์ตลาดรอง, a tax-question heading, etc.) that need spot-checking — some are likely real section differences.

**Strategic note — the module comparator's ceiling on these pages.** After #1a/#2 the residual false positives all stem from the flat-original vs segmented-migrated heading asymmetry: a section that is an `h2` on the original is not a module-heading on the migrated side even when its text is present. Closing this needs one of:
1. **Text-tolerant matching** — treat an original module as present if its heading text appears anywhere in the migrated main text. Kills the residual, but makes `missing-module` largely **redundant with `compareText`** (which already compares main-region text both ways).
2. **Gate/demote** `missing-module` — e.g. suppress or lower severity when the heading text is present in the other side's main text, keeping it only for genuinely-absent sections.
3. **Accept** the current state: `missing-module` is now dominated by one recurring, dedupe-able trailing section plus a few singletons — far cleaner than the pre-follow-up artifacts. Fix the whitespace-variant dedup (normalize the heading harder in `original`) so the trailing section collapses to one site-wide row.

Recommendation: option 3 (accept + fix the dedup) is the pragmatic stop; option 1/2 are only worth it if module-level signal is needed beyond `compareText`. This is a product call for the migration-review owner.

## Scale-up recommendation

The pipeline works end-to-end and the findings are real, but **hold the 1,460-page run** until: (a) the systemic issues above are triaged with the migration team — every page will fail while chrome is English and heroes are missing, so a full run adds little signal today; (b) the 404-fingerprint and module-extraction tuning items land; (c) pacing is validated on a ~50-page batch. With 20s pacing, 1,460 pages ≈ 2-3 days of sequential capture — plan batches, or relax pacing after confirming rate-limit thresholds.
