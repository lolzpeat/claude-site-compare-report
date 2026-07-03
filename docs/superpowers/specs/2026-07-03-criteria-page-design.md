# Criteria & Methodology Page — Design Spec

**Date:** 2026-07-03
**Status:** Approved, ready for planning.
**Depends on:** report Thai localization (labels.js) — already landed.

## Problem

The report shows *what* failed but not *how* the checks work — the criteria, thresholds, detection method, and calculation behind each issue category. A reviewer (or migration-team stakeholder) has no in-report reference for the rules. Add a Thai `criteria.html` page documenting them, sourced from the live config so the numbers never drift.

## Goal

A standalone `output/report/criteria.html`, in Thai, linked from the index, documenting: each issue category's check + method + threshold + severity; the config threshold table; the statuses; the severity levels; and the site-wide (systemic) aggregation rule. Numeric thresholds are imported from `src/config.js` (single source of truth); the three snapshot-inline constants are mirrored with a comment.

Non-goals: changing any comparator, config value, or the issue contract; per-page criteria; translating issue descriptions.

## Architecture

New module `src/report/criteria.js`, exporting `renderCriteria(): string`. It:
- imports live values from `src/config.js`: `IMAGE_RATIO_TOLERANCE`, `THAI_RATIO_DELTA`, `SYSTEMIC_THRESHOLD`, `SYSTEMIC_MIN_PAGES`, `MAX_LINK_CHECKS`;
- reuses `esc` and `CSS` from `src/report/html.js` (exported in this change) and `CATEGORY_LABEL`, `STATUS_LABEL`, `SEVERITY_LABEL` from `src/report/labels.js`;
- builds the page from data arrays (not hand-written HTML) so it is testable and consistent.

`src/report/html.js`: add `export` to the existing `const esc` and `const CSS` (no behavior change), and add a nav link to `criteria.html` on the index page.

`src/run-report.js`: import `renderCriteria`, write `output/report/criteria.html`.

### Data model (in `criteria.js`)

```js
const CRITERIA = [
  { cat: 'broken-link', check: '...', method: '...', threshold: '...', sev: 'High / Medium' },
  { cat: 'link-target', ... },
  { cat: 'image-ratio', ... },
  { cat: 'text-language', ... },
  { cat: 'missing-module', ... },
  { cat: 'capture-failure', ... },
];
```

`cat` is the contract category (rendered through `CATEGORY_LABEL` for the Thai display, raw value shown too as a code tag so the mapping is transparent). `check`/`method`/`threshold` are Thai prose; numeric values are interpolated from the imported config constants (e.g. `` `> ${IMAGE_RATIO_TOLERANCE * 100}%` `` → `> 2%`).

### Page sections (Thai)

1. **ภาพรวม** — 1–2 sentences: the tool captures original (`www.bangkokbank.com`) vs migrated (`prod-aem.bangkokbank.com`) in a headed browser and compares the main-content region (chrome — header/nav/footer — is excluded from content checks; links are checked page-wide).
2. **เกณฑ์การตรวจรายหมวด** — table, columns `หมวดหมู่ · ตรวจอะไร · วิธีตรวจ/คำนวณ · เกณฑ์ · ความรุนแรง`, one row per `CRITERIA` entry. Accurate method text:
   - **broken-link**: migrated link returns HTTP ≥ 400 → สูง; unreachable (status 0) → ปานกลาง; original link text not found among migrated link texts → ปานกลาง (cap 20, then a High summary).
   - **link-target**: transform an original `/th-TH/…` URL → swap host to `prod-aem`, `/th-TH/` → `/th/`, lowercase, drop trailing slash; if no migrated link resolves to that key → สูง. Skips external, query-string, and non-`/th-TH/` links.
   - **image-ratio**: match main-region images by filename (then by order); flag when `|ratio_orig − ratio_mig| / ratio_orig > IMAGE_RATIO_TOLERANCE (2%)` (rendered w/h); also flag new distortion (natural vs rendered ratio differs on migrated but not original). ปานกลาง. Plus image-count: migrated main images `< original − 2`.
   - **text-language**: main-region text block on original (normalized, length ≥ 4, not dynamic) not present on migrated → ปานกลาง (cap 15, then High summary); and Thai character ratio differs by `> THAI_RATIO_DELTA (10 percentage points)` → สูง.
   - **missing-module**: main-content modules (chrome excluded; a ≥ 1000px blob split by `h2`; icon images < 48px ignored; only modules ≥ 80px with a heading or a content image are compared); flag when an original module matches no migrated module by heading or image filename → สูง.
   - **capture-failure**: WAF block or navigation failure prevented capture → สูง (page marked จับภาพไม่สำเร็จ).
3. **ค่าเกณฑ์ (config)** — table `ชื่อ · ค่า · ความหมาย`, values imported live: IMAGE_RATIO_TOLERANCE (2%), THAI_RATIO_DELTA (10pp), SYSTEMIC_THRESHOLD (50%), SYSTEMIC_MIN_PAGES (3), MAX_LINK_CHECKS (50). Plus the mirrored snapshot constants (MIN_MODULE_HEIGHT 40 capture / 80 compare, COARSE_MODULE_MIN_HEIGHT 1000, ICON_MAX_PX 48) with a note they live inline in `snapshot.js`/`modules.js`.
4. **สถานะการตรวจ** — ผ่าน / ไม่ผ่าน / จับภาพไม่สำเร็จ / ยังไม่ย้าย (migrated page matches `NOT_FOUND_PATTERNS` → 404) / ปลดออกจากต้นฉบับ (original 404). Rendered via `STATUS_LABEL`.
5. **ระดับความรุนแรง** — สูง / ปานกลาง / ต่ำ, via `SEVERITY_LABEL`.
6. **การรวมปัญหาระดับทั้งเว็บ (systemic)** — an issue appearing on ≥ `SYSTEMIC_THRESHOLD` (50%) of comparable (Passed/Failed) pages, minimum `SYSTEMIC_MIN_PAGES` (3), is grouped as site-wide; deduped by key `category|original|migrated`.

### Wiring & nav

- `renderIndex` gains a nav line near the top: `<a href="criteria.html">เกณฑ์การตรวจสอบ</a>` (alongside the existing systemic banner).
- `criteria.html` has a `← กลับ` link to `index.html` (reuse `T.back`).
- `<html lang="th">`, reuse `CSS`.

## Testing (`test/criteria.test.js`)

- `renderCriteria()` contains the live thresholds rendered from config: `2%`, `10`, `50%`, `3`, and `50` (guard against drift — compute expected from the imported constants, don't hardcode a divorced literal).
- contains every category Thai label (`CATEGORY_LABEL` values), every status label, every severity label.
- contains the six section headings.
- escapes nothing unsafe (static content) — smoke assertion that output starts with `<!doctype html>` and sets `lang="th"`.
- In `test/html.test.js` (or a run-report-level check): `renderIndex(...)` output contains `criteria.html`.

Keep `npm test` green.

## Files

```
src/report/criteria.js     # NEW — renderCriteria(): the Thai criteria page from data arrays + live config
src/report/html.js         # export esc + CSS; add criteria.html link to renderIndex
src/run-report.js          # write output/report/criteria.html
test/criteria.test.js      # NEW — assert thresholds/labels/sections + index link
```

## Constraints

- Numeric thresholds come from `src/config.js` imports; do not hardcode divorced copies. The 3 snapshot-inline constants are mirrored with a comment pointing to their source.
- No comparator, config value, CSS class, or issue-contract change. Display/documentation only.
- No new dependencies. No re-capture. Built-in `node:test`; `npm test`. Commit format `<type>: <description>`, no attribution footer.
