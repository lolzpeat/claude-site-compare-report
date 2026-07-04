# Readable report details — design

**Date:** 2026-07-04
**Status:** Implemented (2026-07-04)
**Context:** Issue descriptions shown in the report are technical English
sentences with embedded URLs/labels (476 distinct strings on the current
corpus), and the values they embed are duplicated in the ต้นฉบับ/เว็บที่ย้าย
columns. chrome.html on the News sheet renders 846 per-URL broken-link rows
flat. Thai readers asked for concise, readable details.

## Goals

1. Every issue description renders in short, plain Thai.
2. No duplicated values: descriptions carry meaning only; concrete values
   live in the ต้นฉบับ/เว็บที่ย้าย columns, with long URLs shortened for
   display.
3. chrome.html stays scannable at hundreds of broken-link entries.

Non-goals: changing comparator output, det/chrome JSON, dedup keys, or
criteria.html; i18n beyond Thai (a display-layer mapping is enough — the
structured descKey approach was considered and rejected as
disproportionate).

## Key decision: display-layer only

`issueKey` falls back to `category|normalizeText(description)` when an issue
has no original/migrated values, and stored det JSON embeds the English
descriptions — so descriptions are load-bearing data. All changes therefore
live in `src/report/` render code; comparators and JSON stay byte-identical.
Re-running `node src/run-report.js` (pure render) applies the change; no
re-compare or re-capture.

## Component 1: `src/report/describe.js`

- `describeIssue(issue) → string` — an ordered rule table
  `[{re, render(match, issue)}]` matched against `issue.description`.
- Rules cover every description template the comparators emit (enumerated
  from source at plan time: links, link-targets, chrome, hero, news-detail,
  images, text, modules, redirect, capture-failure/not-found — ~20
  templates).
- Output is short Thai with embedded values DROPPED (they render in the
  value columns); keep only information absent from the columns, e.g. the
  HTTP status number:
  - `Link returns HTTP 404: <url>` → `ลิงก์เสีย (HTTP 404)`
  - `Chrome label rendered in English instead of Thai: "X"` →
    `เมนู/ข้อความส่วนกลางแสดงเป็นภาษาอังกฤษ`
  - `News date renders as "Invalid Date" on migrated` →
    `วันที่ข่าวแสดงเป็น "Invalid Date"`
- **Fallback:** no rule matches → return the original description
  unchanged. Unknown/future patterns degrade to English, never lose
  information.
- Applied at every render site: detail-page `issueRows`, systemic.html
  tables, chrome.html tables, the detail-page chrome block.

## Component 2: value display shortening (html.js)

- `displayValue(value)` helper: when the value is (or contains) a URL on a
  known host (`www.bangkokbank.com` / `prod-aem.bangkokbank.com`) render an
  anchor whose text is the path only (host stripped), middle-ellipsized
  above ~60 chars (keep head + tail), with `href`/`title` = the full URL.
- Mixed values like `<url> → HTTP 404` shorten only the URL part and keep
  the status suffix.
- Non-URL values pass through unchanged.
- Used in the ต้นฉบับ/เว็บที่ย้าย columns of all issue tables (detail,
  systemic, chrome).

## Component 3: chrome.html broken-link grouping

- In `renderChrome`, per zone: split entries into broken-link vs the rest.
- Non-broken-link entries (tens of rows) keep the current main table.
- Broken-link entries group by HTTP status parsed from the migrated value
  (`→ HTTP <n>` / `→ unreachable`); each status renders as a collapsed
  `<details>`: summary `ลิงก์เสีย (HTTP 404) — N ลิงก์` + severity chip;
  inside, the full per-link table (reach + example columns intact). No data
  dropped — only collapsed. Default collapsed.
- Detail pages and systemic.html keep their existing structure (already
  grouped per category via `<details>`); they gain Thai descriptions and
  short URLs automatically from components 1–2.

## Testing

1. Unit tests for `describeIssue`: one case per comparator template →
   expected Thai; fallback case (unknown string passes through unchanged).
2. Unit tests for `displayValue`: known-host URL, unknown-host URL
   (unchanged), long-path middle-ellipsis, mixed `→ HTTP 404` value,
   non-URL value.
3. `renderChrome` grouping tests: broken-link entries collapse by status,
   other categories stay in the main table, no entry lost.
4. Existing tests that assert English description text in rendered HTML are
   updated to the new Thai strings deliberately — the plan lists each one.
5. Validation on real data: run `describeIssue` over every distinct
   description in `output/issues/det/` + chrome entries and report the
   translated percentage. Acceptance: 100% of patterns the current
   comparators emit are matched (fallbacks may remain only for retired
   patterns in stale JSON).

## Risks

- Rule table drifts from comparators when new checks are added → mitigated
  by the fallback (English shows through, visibly signalling a missing
  rule) and the coverage script from Testing #5, which can be re-run any
  time.
