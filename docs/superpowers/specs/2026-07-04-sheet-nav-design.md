# Sheet navigation strip — design

**Date:** 2026-07-04
**Status:** Approved (brainstorm 2026-07-04)
**Context:** Each sheet's dashboard (`report/<slug>/index.html`) has no link
back to the landing page and no link to the other sheet's report — switching
reports requires browser-back. Users asked for a main-menu link to the other
report.

## Design

- `renderIndex(rows, systemicCount, chromeCount, sheetNav = [])` gains an
  optional 4th param: `sheetNav: [{name, slug, current}]`. Default `[]`
  renders nothing (backwards compatible with existing callers/tests).
- When non-empty, a nav line renders ABOVE the existing toplinks line:
  `← หน้ารวม · <sheet 1> · <sheet 2> …` where หน้ารวม links to
  `../index.html`, non-current sheets link to `../<slug>/index.html`, and the
  current sheet renders as bold text (`<b>`), not a link.
- `run-report.js` builds `sheetNav` once from its existing `groups` map
  (first-seen order, `slugify` for slugs) and passes it per sheet with the
  `current` flag set.
- Only the sheet dashboards get the strip. Detail/systemic/chrome/criteria
  pages keep their existing "← กลับ" (one hop to the dashboard, switch from
  there) — per the approved option.
- Display layer only: re-run `node src/run-report.js` to apply; no
  re-compare/re-capture.

## Testing

- `renderIndex` with a 2-entry sheetNav: renders the landing link
  (`../index.html`), a link to the other sheet (`../<slug>/index.html`), and
  the current sheet as non-link bold text.
- `renderIndex` without sheetNav (default): no nav strip markup (existing
  tests keep passing unchanged).
- After wiring: regenerate the report and grep both sheet dashboards for the
  landing link and each other's slug.
