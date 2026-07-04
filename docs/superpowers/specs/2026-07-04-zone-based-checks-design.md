# Zone-based checks & report — design

**Date:** 2026-07-04
**Status:** Implemented (2026-07-04)
**Context:** The generic comparators only look at region `main` for content and
page-wide for links, so shared chrome (header/nav/footer) is either invisible or
a false-positive source, and the report mixes per-page defects with site-wide
ones. This spec splits checking and reporting by page zone, following the
precedent set by the News-Detail element comparator.

## Goals (all three, per brainstorm)

1. Reduce false positives by giving each zone its own targeted criteria.
2. Make the report actionable by grouping issues by zone.
3. Check shared chrome once as a site-wide concern instead of failing 1,460
   pages for one footer defect.

Non-goal: page-type template classification (product/landing/listing). Only the
zone split is in scope; News-Detail keeps its existing dedicated comparator.

## Key decisions

- **Chrome issues do not affect per-page status.** `Passed`/`Failed` reflects
  only that page's own content (hero + main).
- **Mechanism: check every page, aggregate in report.** `run-compare` is an
  offline diff, so per-page chrome checking costs nothing; `run-report` dedups
  with the existing `issueKey` and renders one `chrome.html` per sheet with
  affected-page counts. Full coverage catches section-specific nav variants
  that sampling would miss.
- **No re-capture needed.** Existing snapshots already carry `region` on
  `links`, `images`, and `textBlocks` (verified on both sides).

## Zones

| Zone | Source regions | Scope |
|---|---|---|
| `header-nav` | `header` + `nav` combined | site-wide (chrome) |
| `footer` | `footer` (includes footer links) | site-wide (chrome) |
| `hero` | first module of region `main` | per-page |
| `main` | region `main` (existing comparators, unchanged) | per-page |

`header` and `nav` MUST be treated as one zone: the original site splits nav
(≈115 links) from header (≈32), while migrated AEM classifies everything as
`header` (≈65, no `nav` at all). Comparing them separately would mis-pair.

## Chrome checks (`header-nav` + `footer`)

Match links across sides by URL using the existing link-targets transform
(`/th-TH/` → `/th/` + lowercase), then per zone:

1. **Missing menu link** — an original link with no URL match on migrated.
   Category `link-target`, severity Medium, one issue per missing link naming
   the menu item.
2. **Label still English** — URL matched, original text is Thai
   (`thaiRatio > 0.5`) but migrated text is not (`thaiRatio < 0.2`; same
   thresholds as the News-Detail breadcrumb check). Category `text-language`,
   severity High, with the concrete before/after labels.
3. **Label mismatch** — URL matched, texts differ and it is not the
   English-label case. NEW category `menu-label`, severity Medium.
4. **Zone link-count stats** — rendered as an informational strip per zone
   section ("ลิงก์ในโซน: เดิม 147 → ใหม่ 65 · จับคู่ URL ได้ 61 · หายไป 4"),
   NOT per-issue rows (missing links are already itemized by check 1). Only
   when matched coverage drops below `ZONE_COVERAGE_MIN` (0.5) does one
   High-severity summary issue fire, keyed with a stable `keyHint` (never
   embed counts in `original`/`migrated` — breaks dedup).
5. **Broken links in zone** — existing `linkStatuses`, scoped by region.
   Category `broken-link`, severity High (matches existing behavior).

Raw link-count differences are NOT a defect by themselves (mega-menu capture
differs between sides); URL matching is the ground truth.

## Hero check (per-page, conservative)

Fires only when the original's first `main` module has `imageFiles` (a clear
hero). Then verify on migrated: hero module present, same image file
(case-insensitive filename, as in News-Detail `contentImages`), and
first-module headings equal after `normalizeText`. Category `hero`, severity
Medium. If the
original has no detectable hero, skip silently — never guess. Skipped for
News-Detail pages.

## News-Detail routing

News-Detail pages keep their element comparator and still skip the generic
main-content comparators. Chrome checks DO run on them (chrome is
template-independent), so the known "AEM chrome renders English" defect
surfaces systematically in chrome.html. Hero does not run on them.

## Architecture

- New modules: `src/compare/chrome.js`, `src/compare/hero.js`.
- `comparePair` returns `{ status, issues, chromeIssues }`; status is computed
  from `issues` only. All consumers (run-compare, mergeIssues, tests) updated.
- Every issue gains an optional `zone` field:
  `header-nav | footer | hero | main` (default `main`). Existing comparators
  are implicitly `main`.
- `run-report` aggregates `chromeIssues` across a sheet's pages by `issueKey`,
  tracking affected-page counts and 2–3 example page ids, writing
  `report/<slug>/chrome.json` (next to systemic.json) and
  `report/<slug>/chrome.html`.
- The generic link comparators (`compareLinks`, `compareLinkTargets`,
  `migLinkStatusIssues`) are scoped to non-chrome regions (`main` /
  `page-wide` / missing region); the chrome comparator owns `header`, `nav`,
  and `footer` links. Otherwise the same footer 404 would appear in both
  `issues` (failing the page) and `chromeIssues`, contradicting the status
  rule — and this scoping also removes existing English-nav false positives
  from the generic comparators.
- New config in `src/config.js`: `ZONE_COVERAGE_MIN` (0.5); Thai-ratio
  thresholds reuse the existing values.

## Report changes (validated via mockups)

Mockups reviewed and approved in the brainstorm session:
`.superpowers/brainstorm/8844-1783139612/content/report-zones-mockup-v3.html`.

- **`chrome.html` per sheet** — same skeleton as systemic.html. Two sections
  (Header/Main Navigation, Footer/Footer Links), each with the link-count stat
  strip, then a deduped issue table: zone · category · severity · description ·
  original · migrated · affected-page count (e.g. 1,428/1,460) · example page
  links.
- **Sheet index** — new "โซนส่วนกลาง (Chrome)" summary card (accent border)
  next to the existing Own/Site-wide cards, linking to chrome.html. The
  per-page table and status semantics are unchanged.
- **Detail pages** — issues grouped by zone: Hero Banner → Main. At the bottom,
  a native `<details>` block (collapsed by default in production; no JS)
  titled "โซนส่วนกลาง (Chrome) — พบ N ประเด็นบนหน้านี้ (ไม่นับรวมในสถานะ)"
  listing that page's chrome issues with zone chips, visually muted
  (dashed left border / tinted background) to signal informational-only, plus
  a link to chrome.html. News-Detail detail pages get the same chrome block.
- **criteria.html** — new section documenting zone criteria from live config
  imports.
- **labels.js** — zone display mapping: `header-nav` → ส่วนหัว/เมนูหลัก,
  `footer` → ส่วนท้าย, `hero` → แบนเนอร์หลัก, `main` → เนื้อหาหลัก; new
  category labels: `menu-label` → ชื่อเมนูไม่ตรงกัน, `hero` → แบนเนอร์หลัก.
  Contract values and CSS class names stay English.

## Contract changes (update CLAUDE.md when implemented)

- Issue categories gain `hero` and `menu-label`.
- Issue shape gains optional `zone` field (default `main`).
- `comparePair` return shape: `{ status, issues, chromeIssues }`.
- New output artifacts: `report/<slug>/chrome.json` + `report/<slug>/chrome.html`.
- Generic link comparators become main-scoped (chrome regions belong to the
  chrome comparator).
- Dedup gotcha still applies: never embed per-page counts/URLs in
  `original`/`migrated` of chrome issues; affected-page counts live only in
  the aggregation layer.

## Testing

1. Unit tests (node:test, fixture snapshots for both sides): missing chrome
   link, English label, label mismatch (`menu-label`), header+nav zone
   merging, coverage summary issue at the threshold, hero present / absent /
   different file, News-Detail receives chrome checks but not hero, status
   unaffected by chromeIssues.
2. Full `npm test` stays green — the `comparePair` shape change ripples into
   existing tests.
3. Real-data validation: re-run `run-compare` + `run-report` on existing
   snapshots (both offline), browse via `python3 -m http.server` in `output/`.
   Acceptance: chrome.html surfaces the known English-nav defect with a
   near-full page count, and hero false positives on a sample of detail pages
   are low enough to keep severity Medium.

## Risks

- **Hero heuristics on flat original pages** — mitigated by the conservative
  gate (only fire when the original clearly has a hero); tune on a pilot batch
  before trusting corpus-wide.
- **Chrome label noise from mega-menu capture asymmetry** — mitigated by
  URL-matching first and reporting counts as stats, not issues.
