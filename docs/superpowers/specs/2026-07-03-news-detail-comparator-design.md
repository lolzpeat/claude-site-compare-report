# News-Detail comparator — design

**Date:** 2026-07-03
**Status:** Draft (awaiting review)
**Context:** Test of 10 News & Media pages showed the generic comparators produce
mostly false positives on News-Detail article pages. This spec adds a dedicated
comparator scoped to the six structural elements of a news article.

## Problem

News & Media pages split into two shapes:

1. **Landing pages** (`AEC-Business-Forum`, `AntiCorruption`, …) — ordinary content
   pages. The generic comparators work acceptably (review via *own* issues).
2. **News-Detail articles** (`News-Detail?id=GUID` → `/news-and-media/2569/<guid>`) —
   the generic comparators break badly:
   - The URL transform (`/th-TH/→/th/` + lowercase) cannot map
     `News-Detail?id=GUID` to `/news-and-media/<year>/<guid>`, so **every** article
     link (114 on `news-detail-3ae3`) is flagged `broken-link` "missing" +
     `link-target` "unmatched". Pure false positives.
   - Original news pages are flat (no `<main>`), so footer/nav text is mis-scoped to
     `region==='main'` and diffed against the migrated article → `text-language` /
     `missing-module` noise.

Meanwhile the migrated articles have **real** defects the generic run buries:

| Element | original | migrated | verdict |
|---|---|---|---|
| Headline | present (Thai) | same | OK on all 3 |
| **Date** | "15 มิถุนายน 2569" | **"Invalid Date"** | broken on all 3 |
| Content body | present | present | OK on all 3 |
| **Breadcrumb** | Thai | "About Us / News And Media" (English) | not localized on all 3 |
| **Share buttons** | Facebook, X, Line | **none** | missing on all 3 |
| Hero image | present | present | OK |

(Confirmed identical across `news-detail-3993`, `news-detail-3ae3`, `news-detail-10d8`.)

## Goals

- A comparator that verifies the six article elements the user named:
  **หัวข้อข่าว, วันที่, รูปประกอบ, เนื้อหาของข่าว, breadcrumb, ปุ่มแชร์**.
- Route News-Detail pages to it and **skip** the generic link/text/module comparators
  that only manufacture false positives there.
- Work off the **existing** snapshot fields (`textBlocks[region==='main']`, `links`,
  `images`, `linkStatuses`) so it is developed and unit-tested against the 10
  snapshots already on disk — **no re-capture** required.

## Non-goals

- No change to `extractSnapshot` (keep the self-contained `page.evaluate` invariant
  untouched). All element detection is inference in the comparator.
- No new capture fields. Landing pages keep the generic comparators unchanged.

## Check semantics (recommended: hybrid)

Per-element definition of "ตรวจ":

| Element | Check | Severity |
|---|---|---|
| Headline | present on migrated **and** matches original (normalized) | High if missing/mismatch |
| Date | migrated date is a valid Thai date; flag literal `"Invalid Date"`, empty, or mismatch vs original | **High** if invalid/missing, Medium if mismatch |
| Content body | migrated has a body block ≥ `CONTENT_MIN_CHARS`; flag missing or drastically shorter | High if missing, Medium if ≪ original |
| Content image | compare the **content** image set (article body only, via `modules[].imageFiles` — chrome logos, header icons, related-news thumbnails excluded); flag when migrated article has none, or its hero file differs from original | Medium if missing/mismatch |
| Breadcrumb | migrated breadcrumb trail present; flag missing, and flag when labels are English while original is Thai | Medium if missing, Low if not-localized |
| Share buttons | migrated has share links when original does; flag missing set | Medium if missing |

Rationale for hybrid: structural elements (image, breadcrumb, share, content) are
presence-checked (robust); identity elements (headline, date) are value-compared
(the high-value signal, e.g. "Invalid Date"). Full body-text diffing is deliberately
avoided — too fragile against whitespace/markup differences.

## Architecture

### New file: `src/compare/news-detail.js`

```
extractArticle(snapshot) -> { headline, date, bodyText, breadcrumb, shareLinks, contentImages }
compareNewsDetail(origEnv, migEnv) -> issue[]
```

`extractArticle` heuristics (all language-agnostic where possible):

- **headline** = first `main` textBlock with length ≥ `HEADLINE_MIN_CHARS`.
- **date** = first `main` textBlock (length < `DATE_MAX_CHARS`, ~40) matching
  `DATE_RE` (Thai month names) **or** the literal `"Invalid Date"`. The length gate
  prevents matching a long body paragraph that happens to contain a month name
  (observed on `news-detail-10d8`).
- **bodyText** = longest `main` textBlock.
- **breadcrumb** = ordered `links` whose pathname is an ancestor of the article path
  (e.g. `/about-us`, `/about-us/news-and-media`). Language-agnostic detection;
  the Thai-vs-English check reads the link `text`.
- **shareLinks** = `links` whose `text` ∈ {Facebook, X, Twitter, Line, LinkedIn}
  (case-insensitive) or `href` matches a social-share pattern.
- **contentImages** = `snapshot.modules[].imageFiles`. (`snapshot.images` does carry a
  `region`, but the related-news thumbnail rail sits in `region==='main'` too, so a
  region filter would still include it.) Module extraction is chrome-aware (excludes
  header/nav/footer) **and** excludes the thumbnail rail (not a tall module), so this
  yields exactly the article's own image(s). Validated: on all three articles both sides resolve to the single hero
  file (`15jun2026_870.png`, …) while `snapshot.images` raw counts are 6 (orig) vs 17
  (mig, thumbnail-polluted). A naive size filter (>`ICON_MAX_PX`) fails here — the mig
  thumbnails are also >48px — so the module set, **not** size, is the correct source.

`compareNewsDetail` emits one issue per failing element (see table). Every issue sets
`original`/`migrated` to the concrete before/after value (e.g. `"15 มิถุนายน 2569"`
vs `"Invalid Date"`) so the report renders before/after columns and systemic dedup
groups the same defect across pages.

### Scoped broken-link reuse

The migrated articles also contain genuinely mangled links
(`/2569/www.bangkoklife.com`, `/2569/https/en/Personal/...`). These surface as HTTP
4xx in `migEnv.linkStatuses`. `compareNewsDetail` reports migrated links whose status
≥ 400 (the HTTP-status half of `compareLinks`), **without** the transform-based
"missing link" comparison that causes the 114-link FP. Implementation reuses the
status logic from `links.js` (extract a shared helper during planning).

### Routing: `src/compare/compare.js`

After the existing 404 gates, before the generic comparator list:

```js
if (isNewsDetail(origEnv, migEnv)) {
  const issues = [...detectRedirects(origEnv, migEnv), ...compareNewsDetail(origEnv, migEnv)];
  return { status: issues.length === 0 ? 'Passed' : 'Failed', issues };
}
```

`isNewsDetail(origEnv, migEnv)`:
- migrated `finalUrl` matches `/news-and-media/\d{4}/[0-9a-f-]{36}` (year + GUID), **or**
- original `requestedUrl` matches `/News-and-Media/News-Detail`.

Landing pages (items 1–7) do **not** match → keep generic comparators. This keeps the
change surgical.

## Contract change (recommended)

Add a new issue category **`news-element`** (recommended over overloading
`text-language`/`missing-module`, which would scatter news defects across unrelated
buckets and hurt report legibility).

Touch points:
- `src/report/labels.js` → `CATEGORY_LABEL['news-element'] = 'องค์ประกอบข่าว'`
- `CLAUDE.md` → add `news-element` to the Issue-categories contract line
- Any category-exhaustive test/fixture

`location` distinguishes the element: `news:headline | news:date | news:content |
news:image | news:breadcrumb | news:share`.

**Alternative (rejected):** reuse existing categories (date/breadcrumb →
`text-language`, share → `broken-link`, image → `image-ratio`). Less code but the
report can no longer show "news article structure" as one coherent group, and
systemic aggregation mixes news defects with chrome noise.

## Data flow & systemic behavior

Because the three real defects (Invalid Date, missing share, English breadcrumb)
repeat on every article, `aggregateIssues` will correctly promote them to **site-wide**
— i.e. "all News-Detail pages share these template defects, fix once." That is the
desired outcome; no special handling needed.

## Error handling

- Missing/empty `main` region → emit a single High `news-element` "article body not
  detected on migrated" rather than six separate element failures.
- `extractArticle` never throws: every field defaults to `null`/`[]` and the checks
  treat `null` as "not present".

## Testing

`test/compare-news-detail.test.js` (node:test), fixtures derived from the 3 captured
News-Detail snapshots under `test/fixtures/`:

1. headline present+matching → no headline issue
2. migrated date `"Invalid Date"` → High `news:date` issue with before/after values
3. migrated share links empty while original non-empty → Medium `news:share`
4. breadcrumb English on migrated vs Thai original → `news:breadcrumb` not-localized
5. body present on both → no content issue; body absent → High
6. mangled migrated link (status ≥ 400) → broken-link issue; clean links → none
7. `extractArticle` date length-gate: a body paragraph containing a month name is
   **not** picked as the date

`test/compare-pair.test.js`: a News-Detail pair routes to `compareNewsDetail` and does
**not** emit `link-target` / generic `text-language` issues; a landing page still runs
the generic comparators.

Regression: full `npm test` stays green.

## Rollout

1. Land comparator + routing + tests (works on existing snapshots).
2. Re-run `run-compare` + `run-report` on the current news `pages.csv` (no re-capture)
   and confirm News-Detail pages drop from ~65 raw issues to a handful of real ones.
3. Restore debentures `pages.csv` from `pages.debentures.bak.csv` when done, or scale
   the news set.

## Decisions (2026-07-03)

- **Check semantics:** hybrid (structural=presence, headline+date=value).
- **Category:** new `news-element` (added to labels.js, CLAUDE.md, criteria.js).
- **Extraction:** ship the inference-from-generic-snapshot comparator now (validated
  100% on the 3 captured News-Detail pages, no re-capture needed). Defer DOM-scoped
  extraction until the News-Detail corpus (~835 pages in the sheet) is actually scaled.

## Spot-check across the corpus (2026-07-03) — inference holds; #6 not needed

Captured a 12-article sample spread across the news list, spanning **all years
2560–2569 (2016–2026)** — i.e. old and new markup. `extractArticle` inference was
correct on every article for **5 of 6 elements**: headline (matched original), date
(real Thai date on original, `"Invalid Date"` on every migrated article since 2016),
share (Facebook/X/Line on original, none on migrated), breadcrumb (Thai vs English),
content image. So the migrated-scoped extraction (#6) is **not required** to scale.

One real false positive surfaced instead: the **content-length** check. The original
is a flat page whose cookie-consent block leaks into region `main` (~2373 chars,
constant across pages) and becomes the longest block, so `bodyText` on the original is
the cookie text, not the article. Comparing migrated-article-length against it fired
"content much shorter" on 8/12 short/old articles. **Fix:** content check is now
presence-only (flag migrated body `< CONTENT_MIN_CHARS`); the origin-length comparison
is dropped. Truncation detection, if ever wanted, needs clean article-body extraction
(the deferred scoped work below). Content-image detection also misses on some older
articles, but symmetrically (both sides) so it produces no false positive.

## Scaling note — migrated-side scoped extraction (deferred, do before the ~835-page run)

A live DOM probe (2026-07-03, both sites via Playwright `channel:'chrome'`) showed the
two templates are **asymmetric**:

- **Migrated (AEM)** has clean, stable, semantic hooks — scope extraction here:
  - date → `p.news-media-detail-date` (held the literal `"Invalid Date"`)
  - breadcrumb → `.breadcrumb-container` / `.breadcrumb-wrapper`
  - body → `.news-media-detail-content`, `.center-content.editor`
  - share → `.share a` (empty on migrated = the real defect, confirmed not a selector miss)
  These class names are uniform across the AEM news template, so they are robust at scale.
- **Original (Sitecore)** lacks hooks — no `<h1>`, no `<time>`, no date/publish class;
  the article container didn't match standard selectors; breadcrumb and share share one
  `div.breadcrumb`. Selecting on the original side is unreliable — keep inference there.

Recommended hardening when scaling: extend `extractSnapshot` to capture a migrated-side
`newsArticle` object using the AEM selectors above (gated to News-Detail URLs so the
shared extractor stays cheap for other pages), and compare those precise values against
the original's inferred values. Most high-value defects (Invalid Date, missing share,
English breadcrumb) are decidable from the migrated side alone, so this asymmetric
approach captures nearly all the robustness benefit without solving Sitecore selectors.
