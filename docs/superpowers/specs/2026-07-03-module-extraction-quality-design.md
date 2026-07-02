# Module Extraction Quality — Design Spec

**Date:** 2026-07-03
**Status:** Approved, ready for planning
**Depends on:** deeper-comparators (region tagging) — already landed on `feat/deeper-comparators`.

## Problem

The re-capture of the 20-page Save & Invest batch (see `2026-07-02-pilot-findings.md` → "Region-tagging verification") proved region tagging works, but **module segmentation still yields `modules = 1` on every original page**. Root cause: these bank pages have **no `<main>` landmark**, so the current descent (`while node.children.length === 1`) starts at `<body>`, whose only tall child is the whole-page `div.page` wrapper (height ~4243px, heading "หน้าแรกลูกค้าบุคคล"). The wrapper has multiple children (header/nav/content/footer siblings), so single-child descent stops immediately and never reaches the content sections.

Two compounding symptoms:

1. **False `missing-module` on 18/18 comparable pages** — every one the whole-page "หน้าแรกลูกค้าบุคคล" wrapper reported as missing, because the orig wrapper doesn't match anything on migrated.
2. **The false issue fails to aggregate to site-wide** — `modules.js` embeds the per-page wrapper height in `original` (`"…" (~2763px)`, `(~3964px)`, `(~7453px)` …), so each page's `issueKey = category|original|migrated` differs → dedup misses → it lands as per-page "own" noise ×18 instead of one site-wide row. This is the exact CLAUDE.md GOTCHA: never embed per-page values in `original`/`migrated`.

## Goal

Segment original-page main content into real content blocks even without a `<main>` landmark, so:
- the whole-page "หน้าแรกลูกค้าบุคคล" false `missing-module` disappears (near-zero, not 18/18),
- real module-level differences are still caught,
- any genuinely-repeated missing module dedupes into a single site-wide row.

Non-goals: readability-grade content extraction; handling chrome built from non-landmark `<div>`s; changing text/link/image comparators.

## Approach — A1: chrome-aware descent (chosen)

Rejected alternatives: **A2 (LCA of `region==='main'` elements)** — more principled but heavier in-browser code; **A3 (readability-style content scoring)** — most robust to odd layouts but least deterministic and YAGNI now. A1 reuses the `regionOf` helper already in `snapshot.js`, is a ~10-line change, and is deterministic and testable.

### Segmentation (`src/capture/snapshot.js`)

Replace the current descent + module extraction with a region-aware version. `regionOf(el)` (walks up to the nearest `header`/`nav`/`footer`/`main` landmark, falling back to `'main'`) already exists; add:

```js
const MIN_MODULE_HEIGHT = 40;
const isTall = (el) => el.getBoundingClientRect().height > MIN_MODULE_HEIGHT;
// content children = tall AND not under a chrome landmark
const contentChildren = (el) => [...el.children].filter((c) => isTall(c) && regionOf(c) === 'main');

let node = document.querySelector('main, [role=main]') || document.body;
let guard = 0;
while (guard++ < 40) {
  const kids = contentChildren(node);
  // descend through a single content wrapper only while it still has content inside
  if (kids.length === 1 && contentChildren(kids[0]).length >= 1) { node = kids[0]; continue; }
  break;
}
const modules = contentChildren(node).map((el) => ({
  tag: el.tagName.toLowerCase(),
  className: norm(el.className && el.className.toString()).slice(0, 200),
  heading: norm(el.querySelector('h1,h2,h3,h4')?.textContent ?? ''),
  imageFiles: [...el.querySelectorAll('img')]
    .map((i) => { const src = i.currentSrc || i.src || ''; return src.split('/').pop().split('?')[0].toLowerCase(); })
    .filter(Boolean).slice(0, 10),
  height: Math.round(el.getBoundingClientRect().height),
  region: 'main',
}));
```

**Why it works on the real DOM:** `body → div.page` (single content child → descend) → at `div.page`, `contentChildren` drops the `<header>/<nav>/<footer>` siblings (`region !== 'main'`) and keeps the content sections. If content is one wrapper, keep descending; once ≥2 real sections remain, stop → those become the modules. The whole-page wrapper is never emitted as a module.

**Edge cases:**
- **Monolithic content** (one big content block): descent stops when the single kid has no content grandchildren → yields 1 real content module, never the page wrapper. Acceptable.
- **`<main>` present** (the existing fixture, and any well-formed page): `node` starts at `<main>`; descent through single wrappers still reaches the sections — existing behavior preserved.
- **Chrome as non-landmark `<div>`**: not dropped (known limitation, out of scope).

### Dedup fix (`src/compare/modules.js`)

Remove the per-page px height from `original` so identical missing modules share an `issueKey`. Keep px in `description` (human-readable; not part of the key when `original`/`migrated` are present):

```js
// before: original: `"${mod.heading || mod.imageFiles[0]}" (~${mod.height}px)`
original: `"${mod.heading || mod.imageFiles[0]}"`,
// description keeps `(~${mod.height}px tall)` unchanged
```

Confirm against `src/report/systemic.js` `issueKey` that `original`/`migrated` drive the key when present (per CLAUDE.md contract they do).

## Testing

- **Keep** the existing `<main>` fixture test in `test/snapshot.test.js` (happy path: `<main> → div.wrapper → 2 sections` still yields 2 modules).
- **Add** a no-`<main>` test using `page.setContent(...)` with a `div.page > header + nav + section×2 (tall) + footer` structure (a small non-content `<div>` too). Assert: `modules.length === 2`, headings in order, every `module.region === 'main'`, and the header/nav/footer content is excluded from modules.
- **Add** a `test/compare-modules.test.js` assertion that a `missing-module` issue's `original` contains no `px` (dedup-safe shape), while `description` still reports the height.
- `npm test` stays green.

## Validation (operational)

Module shape is DOM-derived, so snapshots must be re-captured.

1. `node src/run-capture.js --only bonds-and-debentures` → inspect: `modules.length > 1` and no "หน้าแรกลูกค้าบุคคล" module.
2. If good, full re-capture of the 20 pages (paced, resumable), then `run-compare` + `run-report`.
3. Verify: scoped `missing-module` count drops from 18/18 pages to near-zero; real module differences still surface; any remaining repeated missing module appears once in `systemic.html`, not per-page.
4. Record before/after module counts + missing-module tally in `2026-07-02-pilot-findings.md`.

## Files

```
src/capture/snapshot.js      # chrome-aware descent + contentChildren helper
src/compare/modules.js       # drop px from `original` (dedup fix)
test/snapshot.test.js        # add no-<main> segmentation test
test/compare-modules.test.js # add dedup-safe `original` assertion
docs/superpowers/specs/2026-07-02-pilot-findings.md  # record validation results
```

## Constraints

- `extractSnapshot` stays self-contained (serialized into the browser — no imports/closures).
- No new dependencies. Node ≥ 20 ESM, built-in `node:test`, `npm test`.
- Issue contract unchanged; `region` stays `'main'` on modules by construction.
- Commit format `<type>: <description>`, no attribution footer.
