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

## Scale-up recommendation

The pipeline works end-to-end and the findings are real, but **hold the 1,460-page run** until: (a) the systemic issues above are triaged with the migration team — every page will fail while chrome is English and heroes are missing, so a full run adds little signal today; (b) the 404-fingerprint and module-extraction tuning items land; (c) pacing is validated on a ~50-page batch. With 20s pacing, 1,460 pages ≈ 2-3 days of sequential capture — plan batches, or relax pacing after confirming rate-limit thresholds.
