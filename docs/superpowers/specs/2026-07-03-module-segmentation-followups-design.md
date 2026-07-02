# Module Segmentation Follow-ups — Design Spec

**Date:** 2026-07-03
**Status:** Approved, ready for planning
**Depends on:** module-extraction-quality (A1 chrome-aware descent) — already landed on `feat/deeper-comparators`.

## Problem

After A1 chrome-aware descent (see `2026-07-02-pilot-findings.md` → "Module-segmentation verification"), the whole-page wrapper false module is gone, but the module comparator still emits ~16 per-page false-positive `missing-module` issues plus a site-wide `arrow-right.svg` row. Root cause is **not** missing content — it is granularity mismatch and weak identity:

1. **Asymmetric granularity.** The original bank pages are a flat monolithic content `div` (one coarse module, e.g. `การลงทุน` at 3810px) while the migrated (AEM) site segments cleanly into per-section modules (`จุดเด่นพันธบัตรตลาดแรก`, `พันธบัตรรัฐบาล`, `ข้อมูลเพิ่มเติม`, …). The real sections exist inside the original's coarse block — all their headings are present in the original's main-region text — but are not exposed as separate modules, so the coarse `การลงทุน` heading matches nothing on the migrated side and is reported missing. (`compareText` correctly stays silent because the section text matches on both sides.)
2. **Icon-only identity.** A 203px block whose only image is a shared UI icon `arrow-right.svg` is treated as a module with image identity, and since the icon isn't a module image on the migrated side, it is reported missing on 17 pages.

## Goal

Make the module comparator's `missing-module` signal trustworthy on these pages:
- the original's internal sections are exposed as individual modules so they match the migrated modules by heading (the `การลงทุน`/`หุ้นกู้`/`กองทุนรวม` false positives disappear);
- a module identified only by a UI icon is not a comparable module (the `arrow-right.svg` false positive disappears);
- a genuinely-missing section is still caught.

Non-goals: readability-grade content extraction; changing `compareText`/`compareLinks`/`compareImages`; changing `compareModules` matching logic (heading-OR-image identity stays).

## Approach

Both changes are inside `extractSnapshot` (`src/capture/snapshot.js`), which runs in the browser via `page.evaluate` and must stay self-contained (no imports; thresholds are inline literals, like the existing `MIN_MODULE_HEIGHT`). A re-capture covers both.

### #1a — Heading-based segmentation of a coarse module

After the A1 chrome-aware descent produces the module elements (`contentChildren(node)`), pass each element `M` through a splitter before mapping to the module object:

- **Trigger (targeted):** split `M` only when it is a monolithic blob — `M.getBoundingClientRect().height >= COARSE_MODULE_MIN_HEIGHT` (inline literal, `1000`) **and** `M.querySelectorAll('h2, h3').length >= 2`. On the real data this fires only on the original's coarse blob; migrated modules (≤698px, one heading each) do not meet the height gate, so the migrated segmentation is unchanged.
- **Split mechanism:** iterate `M.querySelectorAll('h2, h3, img')` (document order). Each `h2`/`h3` opens a new section; each `img` is bucketed into the current open section (imgs before the first heading are dropped). For each section emit a module object:
  - `heading`: `norm(headingEl.textContent)`
  - `imageFiles`: the section's imgs, filename-normalized, passed through the #2 icon filter, `slice(0, 10)`
  - `height`: `max(0, round(nextHeadingTop - thisHeadingTop))`, where `nextHeadingTop` is the next section heading's `getBoundingClientRect().top` or `M`'s `getBoundingClientRect().bottom` for the last section
  - `tag`: `M.tagName.toLowerCase()`; `className`: `M`'s className (normalized, sliced 200); `region: 'main'`
- **Non-blob modules** (fail the trigger) are emitted as a single module exactly as today.

`compareModules` already filters modules by `height >= MIN_MODULE_HEIGHT` (80) and requires identity (heading or imageFiles) — unchanged. Split sections below 80px are naturally skipped from comparison.

### #2 — Exclude icon-only image identity

In `extractSnapshot`'s image-filename extraction (used both for whole-module `imageFiles` and for the split sections above), keep only images that render large enough to be content: filter to `Math.min(rect.width, rect.height) >= ICON_MAX_PX` (inline literal, `48`) before taking the filename. A ~20px `arrow-right.svg` is dropped; a module whose only image was that icon then has empty `imageFiles` and (for the arrow block) no heading → `compareModules` skips it (no identity). Hero/content images (hundreds of px) are kept.

Factor the filename extraction into a single self-contained helper inside `extractSnapshot` so both the whole-module path and the split-section path share the icon filter (DRY).

## Testing

`test/snapshot.test.js`, using `page.setContent` on fresh pages (no real image loads needed — size via inline `style`):
- **Split:** a tall wrapper (no `<main>`, height ≥ 1000px) containing 2 `h2` sections → `modules` has one entry per heading, headings in document order, each `region: 'main'`.
- **No over-split:** a short well-formed module (one heading, below the height gate) → stays one module (guards the trigger so migrated segmentation is preserved).
- **Icon exclusion:** a module with a 20px img and a 200px img → `imageFiles` contains only the 200px image's filename.

Keep all existing snapshot tests green (the `<main>` fixture and the no-`<main>` A1 test must still pass — neither hits the coarse-blob trigger).

## Validation (operational)

Re-capture the 20 pages (module shape is DOM-derived). Then `run-compare` + `run-report` and verify:
- the `การลงทุน`/`หุ้นกู้`/`กองทุนรวม` per-page `missing-module` false positives are gone;
- the `arrow-right.svg` site-wide `missing-module` row is gone;
- the original now exposes the real section headings as modules that match the migrated side;
- no new over-splitting noise (e.g. a migrated module wrongly split) appears.
Record before/after `missing-module` tallies in `2026-07-02-pilot-findings.md`.

## Files

```
src/capture/snapshot.js        # coarse-module heading split + icon-image filter + shared filename helper
test/snapshot.test.js          # split, no-over-split, icon-exclusion tests
docs/superpowers/specs/2026-07-02-pilot-findings.md  # record validation results
```

## Constraints

- `extractSnapshot` stays self-contained (no imports/closures); `COARSE_MODULE_MIN_HEIGHT` (1000) and `ICON_MAX_PX` (48) are inline literals, documented as tunable heuristics.
- Module object shape unchanged: `{tag, className, heading, imageFiles, height, region:'main'}`. `region` stays `'main'`.
- `compareModules` and all other comparators unchanged. Issue contract unchanged.
- No new dependencies. Node ≥ 20 ESM, built-in `node:test`, `npm test`. Commit format `<type>: <description>`, no attribution footer.
