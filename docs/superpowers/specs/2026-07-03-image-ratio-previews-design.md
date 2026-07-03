# Image-Ratio Previews — Design Spec

**Date:** 2026-07-03
**Status:** Approved, ready for planning

## Problem

An `image-ratio` issue tells the reviewer a filename and two aspect-ratio numbers (e.g. AEC: an SVG that is `1.000` on the original but `4.289` on migrated), but not *what the image looks like*. To confirm which image is wrong and how, the reviewer has to hunt for it in the full-page screenshot. Showing the original and migrated image side by side in the issue row makes the defect obvious at a glance.

## Goal

For each `image-ratio` issue in the per-page detail report, show a small thumbnail of the original and the migrated image (linking to the full image), rendered at their true aspect so a stretched/distorted image visibly looks wrong.

Non-goals: cropping from screenshots; embedding image bytes; thumbnails on the systemic (cross-page) table; thumbnails for non-image issue categories or the page-wide image-count issue.

## Approach — A: live-URL thumbnails

The snapshot's `images` carry absolute `https://` `src` URLs. Pass those onto the issue, and have the report render them as `<img>` thumbnails pointing at the live bank-CDN URLs. When the report is opened in a browser, the browser fetches the images directly. No re-capture is needed — this is a compare + report change over existing snapshots.

### Data (`src/compare/images.js`)

Add two optional fields to the **two `image-ratio` issue objects** (the rendered-ratio issue and the distortion issue): `originalSrc: o.src` and `migratedSrc: m.src` (`o`/`m` are the matched image records already in scope in the `compareImages` loop). The image-count `missing-module` issue is unchanged.

`issueKey` (systemic dedup) uses `category|original|migrated` — the ratio strings — so adding `*Src` fields does not affect dedup.

### Report (`src/report/html.js`)

Add a `thumb(src)` helper and render it inside the existing `issueRows` value cells (the per-page detail rows — where the region badge already lives; the systemic table is untouched):

```js
const thumb = (src) => (src && /^https?:/.test(src))
  ? `<a href="${esc(src)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(src)}" loading="lazy" alt=""></a>`
  : '';
```

In `issueRows`, append the thumbnail after the ratio value in each column:

```js
      <td class="val val-orig">${esc(i.original ?? '—')}${thumb(i.originalSrc)}</td>
      <td class="val val-mig">${esc(i.migrated ?? '—')}${thumb(i.migratedSrc)}</td>
```

Add a CSS rule (next to the other report styles):

```css
  .thumb{display:block;max-height:80px;max-width:100%;margin-top:6px;border:1px solid #ccc}
```

- No forced `width`/`height` on the `<img>` → the image keeps its rendered aspect, so a stretched image looks stretched.
- Only issues that carry `originalSrc`/`migratedSrc` (i.e. `image-ratio`) get thumbnails; every other row is unchanged (`thumb(undefined)` → `''`).
- `^https?:` guard + `esc()` keep the attribute safe against non-http or injection-y srcs.

### Graceful degradation

If the bank WAF/hotlink-blocks an image at view time, the browser shows a broken-image icon; the ratio numbers and the click-through `<a>` link still convey the information.

## Testing

- **`test/compare-images.test.js`**: assert a rendered-ratio issue carries `originalSrc`/`migratedSrc` equal to the matched images' `src`. (The `img(...)` helper already sets `src`.)
- **`test/html.test.js`**: assert a detail row for an `image-ratio` issue with `originalSrc`/`migratedSrc` renders `<img class="thumb"` tags whose `src` is each URL; assert a non-image issue (no `*Src`) renders no `thumb`.

## Files

```
src/compare/images.js         # add originalSrc/migratedSrc to the two image-ratio issues
src/report/html.js            # thumb() helper + .thumb CSS + inject into issueRows value cells
test/compare-images.test.js   # assert the src fields
test/html.test.js             # assert thumbnails render for image-ratio, not for other issues
```

## Validation

Re-run `node src/run-compare.js && node src/run-report.js` (no re-capture). Open a detail page with an `image-ratio` issue (e.g. `aec-investment-clinic`) and confirm the thumbnails appear and the distorted one is visibly wrong. Note whether the bank CDN images load in-browser or WAF-block (if they systematically block, escalate to approach B — inline data URIs — as a follow-up).

## Constraints

- Issue shape gains optional `originalSrc`/`migratedSrc`; all existing fields and the issue contract are otherwise unchanged. Only `image-ratio` issues set them.
- No new dependencies. No re-capture. Built-in `node:test`, `npm test`. Commit format `<type>: <description>`, no attribution footer.
- Thumbnails render only in the per-page detail rows (`issueRows`); `renderSystemic` is not modified.
