# Report Thai Localization — Design Spec

**Date:** 2026-07-03
**Status:** Approved (scope chosen by best-judgment while user away: option 1), ready to implement.

## Problem

The generated HTML report (`output/report/*.html`) is in English. The migration-review team is Thai. They should be able to read the report's structure and classifications in Thai.

## Goal

Render the report's UI chrome, table headers, and the severity/status/category/region **display labels** in Thai — while keeping the internal contract strings (severities, statuses, categories, regions) and CSS class names in English so modules, tests, and dedup are unaffected. Auto-generated issue **descriptions** stay in English (technical, with embedded URLs/numbers); translating them is a heavier, separately-scoped follow-up (touches all comparators + description-asserting tests + systemic dedup).

Non-goals: translating issue descriptions; translating page ids/URLs (data); changing any comparator or the issue contract.

## Approach

All Thai text lives in one new module, `src/report/labels.js`, so it is easy to review and adjust. `src/report/html.js` imports it and swaps English literals for Thai — display text only; every `class="..."`/status-class derivation keeps the English contract value.

### `src/report/labels.js`

```js
// Thai display strings for the report. Internal contract values (severities,
// statuses, categories, regions) stay English — only their display is Thai.
export const T = {
  reportTitle: 'รายงานเปรียบเทียบการย้ายเว็บไซต์',
  back: '← กลับ',
  original: 'ต้นฉบับ',
  migrated: 'เว็บที่ย้าย',
  ownIssues: 'ปัญหาเฉพาะหน้า',            // followed by " (N)"
  noOwnIssues: 'ไม่มีปัญหาเฉพาะหน้านี้',
  siteWideTitle: 'ปัญหาระดับทั้งเว็บ',    // followed by " (N)"
  noSiteWide: 'ไม่มีปัญหาระดับทั้งเว็บ',
  systemicExplainer: 'ปัญหาที่พบในหน้าที่เทียบได้อย่างน้อย 60% — แก้ครั้งเดียวที่ระดับเทมเพลต',
  bannerA: 'ปัญหาระดับทั้งเว็บ ส่งผลหลายหน้าทั่วเว็บไซต์ —',   // "{N} {bannerA} {seeSystemic}"
  refA: 'ปัญหาระดับทั้งเว็บ ส่งผลกับหน้านี้ด้วย —',           // "+{N} {refA} {seeSystemic}"
  seeSystemic: 'ดูรายงานปัญหาระดับระบบ',
};

export const TH_HEAD = {
  Page: 'หน้า', Category: 'หมวดหมู่', Status: 'สถานะ', Own: 'เฉพาะหน้า',
  'Site-wide': 'ทั้งเว็บ', 'Own by category': 'เฉพาะหน้าแยกตามหมวด',
  Severity: 'ความรุนแรง', Description: 'รายละเอียด', Original: 'ต้นฉบับ',
  Migrated: 'เว็บที่ย้าย', Location: 'ตำแหน่ง', Reach: 'ครอบคลุม',
  'Affected pages': 'หน้าที่ได้รับผลกระทบ',
};

export const SEVERITY_LABEL = { High: 'สูง', Medium: 'ปานกลาง', Low: 'ต่ำ' };

export const STATUS_LABEL = {
  Passed: 'ผ่าน', Failed: 'ไม่ผ่าน', 'Capture Failed': 'จับภาพไม่สำเร็จ',
  'Not Migrated': 'ยังไม่ย้าย', 'Retired on Original': 'ปลดออกจากต้นฉบับ',
};

export const CATEGORY_LABEL = {
  'broken-link': 'ลิงก์เสีย', 'link-target': 'ปลายทางลิงก์', 'image-ratio': 'สัดส่วนรูปภาพ',
  'text-language': 'ข้อความ/ภาษา', 'missing-module': 'โมดูลหาย', 'layout': 'เลย์เอาต์',
  'capture-failure': 'จับภาพล้มเหลว',
};

export const REGION_LABEL = {
  header: 'ส่วนหัว', nav: 'เมนู', footer: 'ส่วนท้าย', main: 'เนื้อหาหลัก', 'page-wide': 'ทั้งหน้า',
};
```

Each map lookup uses a fallback (`LABEL[x] ?? x`) so an unmapped value degrades to the raw string rather than `undefined`.

### `src/report/html.js` changes (display only)

- `import { T, TH_HEAD, SEVERITY_LABEL, STATUS_LABEL, CATEGORY_LABEL, REGION_LABEL } from './labels.js';`
- Set `<html lang="th">` on all three documents.
- **Titles/headings:** index `<title>`/`<h1>` → `T.reportTitle`; systemic `<title>`/`<h1>` → `T.siteWideTitle (+ count)`; detail keeps `pair.id` as its title/h1 (data).
- **Table headers:** map each `<th>` label through `TH_HEAD`.
- **Severity display:** `severityChips` and the row `Severity` cell show `SEVERITY_LABEL[sev] ?? sev`; the `chip-${sev}` / `sev-${severity}` **classes keep the English value**.
- **Status display:** show `STATUS_LABEL[status] ?? status`; the status **class** stays `status.split(' ')[0]`.
- **Category display:** `categoryChips` and each group `<summary>` show `CATEGORY_LABEL[c] ?? c`.
- **Region badge:** show `REGION_LABEL[region] ?? region`; keep the `region-tag` class.
- **Captions/links:** `Original`/`Migrated` captions and the URL labels → `T.original`/`T.migrated`; `← back` → `T.back`.
- **Banners / empty states / explainer:** use the `T.*` strings; keep the `${count}` interpolation and the `<a href="systemic.html">${T.seeSystemic}</a>` link.

## Testing

Existing `test/html.test.js` assertions that match now-translated **display** text must be updated to the Thai (or to a stable structural anchor). Concretely, update assertions that currently match: `Failed` (→ `STATUS_LABEL.Failed`), `broken-link` / `image-ratio` category chips (→ Thai labels), `Own` / `Site-wide` headers, `<th>Original</th><th>Migrated</th>`, and `>main<` region badge. Assertions on **data** stay unchanged: descriptions (`HTTP 404`), values (`1.778`, `1.600`), URLs, `systemic.html`, `my-home.html`, screenshot `../shots/…` paths, thumbnail `class="thumb"` src.

Add focused tests:
- severity/status/category/region render their Thai labels while the CSS classes (`sev-High`, `chip-High`, `region-tag`, status class) remain English.
- an unmapped enum value falls back to its raw string.

Keep `npm test` green.

## Files

```
src/report/labels.js       # NEW — all Thai strings + display-label maps
src/report/html.js         # swap display literals for Thai; keep classes/contract values English; <html lang="th">
test/html.test.js          # update display-string assertions to Thai; add label-mapping tests
```

## Constraints

- Do NOT change severity/status/category/region contract values, CSS class names, issue descriptions, or any comparator. Display-only localization.
- No new dependencies. Built-in `node:test`; `npm test`. Commit format `<type>: <description>`, no attribution footer.
- Regenerating the report (`node src/run-report.js`) is a pure render step — no re-capture.
