# Signal Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give 404 pages precise verdicts and lift repeated site-wide issues out of per-page reports into a rollup dashboard, so per-page reports and the sheet CSV show each page's own defects.

**Architecture:** Two independent changes. (1) `comparePair` gains a 404 gate producing two new statuses (per-pair, no cross-page data). (2) A new pure `aggregateIssues` runs in `run-report`, splitting each page's issues into site-wide (systemic) vs own; a new `systemic.html` shows the site-wide rollup, and index/detail/CSV render the own/site-wide split.

**Tech Stack:** Node.js ≥ 20 (ESM), built-in `node:test`, HTML via template strings. No new dependencies.

## Global Constraints

- Statuses (exact strings): `Passed` | `Failed` | `Capture Failed` | `Not Migrated` | `Retired on Original`.
- Issue categories unchanged: `broken-link` | `link-target` | `image-ratio` | `text-language` | `missing-module` | `layout` | `capture-failure`.
- Issue shape: `{category, severity, description, location, original?, migrated?}`.
- `Not Migrated` = migrated side is a 404; `Retired on Original` = original side is a 404 (migrated alive or also 404). One High issue, no comparators run.
- The two new statuses (like `Capture Failed`) are sticky in `mergeIssues` — never recomputed from issue counts.
- Systemic threshold: `SYSTEMIC_THRESHOLD = 0.6`, `SYSTEMIC_MIN_PAGES = 3`. Comparable pages = status `Passed` or `Failed` only.
- Issue key: `category|original|migrated` when either value is non-empty, else `category|normalizeText(description)`.
- CSV `Not Migrated` summary: `Migrated URL serves a 404 page`. `Retired on Original` summary: `Original URL serves a 404 page (offering retired?)`.
- Commit format `<type>: <description>`, no attribution footer. `npm test` runs the suite.

## File Structure

```
src/
├── config.js                    # + NOT_FOUND_PATTERNS, SYSTEMIC_THRESHOLD, SYSTEMIC_MIN_PAGES
├── compare/
│   ├── not-found.js             # NEW: looksNotFound(snapshot)
│   └── compare.js               # + 404 gate in comparePair
├── report/
│   ├── merge.js                 # + new statuses sticky
│   ├── systemic.js              # NEW: aggregateIssues(results)
│   ├── html.js                  # + renderSystemic; renderIndex/renderDetail take own+systemicHits
│   └── csv.js                   # summarize own + site-wide + 404 statuses
└── run-report.js                # wire aggregate → systemic.json + systemic.html + enriched rows
test/
├── not-found.test.js            # NEW
├── compare-pair.test.js         # + 404 cases
├── merge.test.js                # + new-status stickiness
├── systemic.test.js             # NEW
├── html.test.js                 # + renderSystemic; updated index/detail signatures
└── csv.test.js                  # + own/site-wide + 404 summaries
```

**Data shapes (defined once):**

```js
// Page result (from comparePair, then mergeIssues): { pairId, status, issues: [Issue] }
// aggregateIssues(results: PageResult[]) -> {
//   systemic: [{ issue: Issue, pageIds: string[], count: number }],   // sorted count desc, then severity
//   own: Map<pairId, Issue[]>,                                        // every result's non-systemic issues
// }
// Enriched row (run-report builds for renderers):
//   { pair, result, own: Issue[], systemicHits: number }             // systemicHits = # systemic issues affecting this page
```

---

### Task 1: 404 detection and verdicts

**Files:**
- Modify: `src/config.js` (add `NOT_FOUND_PATTERNS`)
- Create: `src/compare/not-found.js`
- Modify: `src/compare/compare.js` (add 404 gate)
- Modify: `src/report/merge.js` (new statuses sticky)
- Create: `test/not-found.test.js`
- Modify: `test/compare-pair.test.js`, `test/merge.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `looksNotFound(snapshot) -> boolean` from `src/compare/not-found.js`; `comparePair` now returns statuses `Not Migrated` / `Retired on Original`; `mergeIssues` keeps them sticky.

- [ ] **Step 1: Add config patterns**

In `src/config.js`, after the `THAI_RATIO_DELTA` line, add:

```js
export const NOT_FOUND_PATTERNS = [
  /ไม่พบหน้าที่คุณต้องการ/,
  /\bpage not found\b/i,
  /\b404\b/,
];
```

- [ ] **Step 2: Write the failing test `test/not-found.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksNotFound } from '../src/compare/not-found.js';

const snap = (title, textBlocks = []) => ({ title, textBlocks, finalUrl: 'https://x/', links: [], images: [], modules: [] });

test('detects the Thai 404 fingerprint in title or text', () => {
  assert.equal(looksNotFound(snap('ขออภัย ไม่พบหน้าที่คุณต้องการค้นหา')), true);
  assert.equal(looksNotFound(snap('บริการ', ['ไม่พบหน้าที่คุณต้องการ', 'อื่น'])), true);
});

test('detects an English 404 fingerprint', () => {
  assert.equal(looksNotFound(snap('Page Not Found')), true);
  assert.equal(looksNotFound(snap('Error 404')), true);
});

test('does not flag a normal content page', () => {
  assert.equal(looksNotFound(snap('พันธบัตรตลาดแรก', ['ลงทุนในพันธบัตร', 'อัตราดอกเบี้ย'])), false);
});

test('tolerates a null snapshot', () => {
  assert.equal(looksNotFound(null), false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/not-found.test.js`
Expected: FAIL — `Cannot find module '../src/compare/not-found.js'`

- [ ] **Step 4: Write `src/compare/not-found.js`**

```js
import { NOT_FOUND_PATTERNS } from '../config.js';

// True when a captured snapshot looks like a 404 / not-found page.
// Checks the title and the first few text blocks (fingerprints live near the top).
export function looksNotFound(snapshot) {
  if (!snapshot) return false;
  const probe = `${snapshot.title ?? ''} ${(snapshot.textBlocks ?? []).slice(0, 8).join(' ')}`;
  return NOT_FOUND_PATTERNS.some((re) => re.test(probe));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/not-found.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Add the 404 gate to `comparePair`**

In `src/compare/compare.js`, add the import after the existing imports:

```js
import { looksNotFound } from './not-found.js';
```

Then, in `comparePair`, insert this block immediately after the `if (captureIssues.length > 0) return ...;` line and before `const issues = [`:

```js
  const origNotFound = looksNotFound(origEnv.snapshot);
  const migNotFound = looksNotFound(migEnv.snapshot);
  if (migNotFound) {
    return {
      status: origNotFound ? 'Retired on Original' : 'Not Migrated',
      issues: [{
        category: 'broken-link', severity: 'High',
        description: origNotFound
          ? 'Both original and migrated URLs serve a 404 page'
          : 'Migrated URL serves a 404 page',
        location: 'page-wide',
        original: origNotFound ? '404' : 'page exists',
        migrated: '404',
      }],
    };
  }
  if (origNotFound) {
    return {
      status: 'Retired on Original',
      issues: [{
        category: 'broken-link', severity: 'High',
        description: 'Original URL serves a 404 page (offering retired?) while migrated has content',
        location: 'page-wide',
        original: '404 (page retired)', migrated: 'page exists',
      }],
    };
  }
```

- [ ] **Step 7: Add 404 cases to `test/compare-pair.test.js`**

Append these tests (the file already imports `comparePair` and defines the `healthy` helper; add a `notFound` helper at the top of the new block):

```js
const notFound = (over = {}) => healthy({
  snapshot: { finalUrl: 'https://x/p', title: 'ไม่พบหน้าที่คุณต้องการ', links: [], images: [], textBlocks: ['ไม่พบหน้าที่คุณต้องการ'], modules: [] },
  ...over,
});

test('migrated 404 yields Not Migrated with one High issue and no comparators', () => {
  const r = comparePair(healthy(), notFound());
  assert.equal(r.status, 'Not Migrated');
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].severity, 'High');
  assert.match(r.issues[0].description, /Migrated URL serves a 404/);
});

test('original 404 with migrated content yields Retired on Original', () => {
  const r = comparePair(notFound(), healthy());
  assert.equal(r.status, 'Retired on Original');
  assert.match(r.issues[0].description, /Original URL serves a 404/);
});

test('both sides 404 yields Retired on Original noting both', () => {
  const r = comparePair(notFound(), notFound());
  assert.equal(r.status, 'Retired on Original');
  assert.match(r.issues[0].description, /Both original and migrated/);
});
```

- [ ] **Step 8: Make new statuses sticky in `src/report/merge.js`**

Replace the body of `mergeIssues` with:

```js
export function mergeIssues(det, ai) {
  const issues = [...det.issues, ...(ai?.issues ?? [])];
  const STICKY = new Set(['Capture Failed', 'Not Migrated', 'Retired on Original']);
  const status = STICKY.has(det.status)
    ? det.status
    : issues.length === 0 ? 'Passed' : 'Failed';
  return { pairId: det.pairId, status, issues };
}
```

- [ ] **Step 9: Add merge stickiness tests to `test/merge.test.js`**

```js
test('Not Migrated and Retired on Original statuses are sticky', () => {
  const nm = mergeIssues({ pairId: 'a', status: 'Not Migrated', issues: [issue('broken-link')] }, { pairId: 'a', issues: [issue('layout')] });
  assert.equal(nm.status, 'Not Migrated');
  const ro = mergeIssues({ pairId: 'b', status: 'Retired on Original', issues: [issue('broken-link')] }, null);
  assert.equal(ro.status, 'Retired on Original');
});
```

(The file already defines the `issue(category)` helper used by existing tests.)

- [ ] **Step 10: Run tests**

Run: `node --test test/not-found.test.js test/compare-pair.test.js test/merge.test.js`
Expected: PASS (all, including the new cases)

- [ ] **Step 11: Full suite + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/config.js src/compare/not-found.js src/compare/compare.js src/report/merge.js test/not-found.test.js test/compare-pair.test.js test/merge.test.js
git commit -m "feat: add 404 verdicts (Not Migrated / Retired on Original)"
```

---

### Task 2: Systemic-issue aggregation

**Files:**
- Modify: `src/config.js` (thresholds)
- Create: `src/report/systemic.js`
- Create: `test/systemic.test.js`

**Interfaces:**
- Consumes: PageResult shape `{ pairId, status, issues }`.
- Produces: `aggregateIssues(results) -> { systemic: [{issue, pageIds, count}], own: Map<pairId, Issue[]> }`.

- [ ] **Step 1: Add thresholds to `src/config.js`**

After the `NOT_FOUND_PATTERNS` block, add:

```js
export const SYSTEMIC_THRESHOLD = 0.6;
export const SYSTEMIC_MIN_PAGES = 3;
```

- [ ] **Step 2: Write the failing test `test/systemic.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateIssues } from '../src/report/systemic.js';

const iss = (category, over = {}) => ({ category, severity: 'High', description: 'd', location: 'l', ...over });
const page = (pairId, issues, status = 'Failed') => ({ pairId, status, issues });

// a chrome issue with identical original/migrated values, shared across pages
const chrome = () => iss('text-language', { description: 'x', original: '"นักลงทุนสัมพันธ์"', migrated: '(not found)' });

test('an issue on >=60% of comparable pages is systemic; a one-off is own', () => {
  const shared = chrome();
  const results = [
    page('a', [shared, iss('layout', { description: 'a-only' })]),
    page('b', [chrome()]),
    page('c', [chrome()]),
    page('d', []),
  ];
  const { systemic, own } = aggregateIssues(results);
  assert.equal(systemic.length, 1);                       // chrome issue on 3/4 = 0.75
  assert.equal(systemic[0].count, 3);
  assert.deepEqual(systemic[0].pageIds, ['a', 'b', 'c']);
  assert.equal(own.get('a').length, 1);                    // only the a-only layout issue
  assert.equal(own.get('a')[0].description, 'a-only');
  assert.equal(own.get('b').length, 0);
});

test('nothing is systemic below the minimum comparable-page floor', () => {
  const results = [page('a', [chrome()]), page('b', [chrome()])]; // N=2 < 3
  const { systemic, own } = aggregateIssues(results);
  assert.equal(systemic.length, 0);
  assert.equal(own.get('a').length, 1);
});

test('404 / capture-failed pages are excluded from the denominator and keep their issues as own', () => {
  const results = [
    page('a', [chrome()]), page('b', [chrome()]), page('c', [chrome()]),
    page('d', [iss('broken-link', { description: '404' })], 'Not Migrated'),
  ];
  const { systemic, own } = aggregateIssues(results);
  assert.equal(systemic[0].count, 3);                      // denominator is 3 comparable, not 4
  assert.equal(own.get('d').length, 1);                    // 404 verdict stays own
});

test('issues without original/migrated dedupe by normalized description', () => {
  const ai = (desc) => iss('layout', { description: desc, original: undefined, migrated: undefined });
  const results = [page('a', [ai('Hero  overlay missing')]), page('b', [ai('hero overlay missing')]), page('c', [ai('HERO OVERLAY MISSING')])];
  const { systemic } = aggregateIssues(results);
  assert.equal(systemic.length, 0); // description key is case/space-normalized but NOT case-folded → see note
});
```

Note on the last test: `normalizeText` collapses whitespace but does not lowercase, so `'Hero overlay missing'` and `'hero overlay missing'` are different keys. The three differ, so none reach 60%. This test pins that behavior; if case-insensitive description matching is wanted later, that is a separate change.

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/systemic.test.js`
Expected: FAIL — `Cannot find module '../src/report/systemic.js'`

- [ ] **Step 4: Write `src/report/systemic.js`**

```js
import { normalizeText } from '../lib/text-utils.js';
import { SYSTEMIC_THRESHOLD, SYSTEMIC_MIN_PAGES } from '../config.js';

const SEVERITY_ORDER = ['High', 'Medium', 'Low'];
const sevRank = (s) => {
  const r = SEVERITY_ORDER.indexOf(s);
  return r === -1 ? SEVERITY_ORDER.length : r;
};

export function issueKey(i) {
  const hasVals = (i.original != null && i.original !== '') || (i.migrated != null && i.migrated !== '');
  return hasVals
    ? `${i.category}|${i.original ?? ''}|${i.migrated ?? ''}`
    : `${i.category}|${normalizeText(i.description)}`;
}

export function aggregateIssues(results) {
  const comparable = results.filter((r) => r.status === 'Passed' || r.status === 'Failed');
  const n = comparable.length;
  const keyToPages = new Map(); // key -> Set(pairId)
  const keyToIssue = new Map(); // key -> representative issue

  if (n >= SYSTEMIC_MIN_PAGES) {
    for (const r of comparable) {
      const seen = new Set();
      for (const i of r.issues) {
        const k = issueKey(i);
        if (!keyToIssue.has(k)) keyToIssue.set(k, i);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!keyToPages.has(k)) keyToPages.set(k, new Set());
        keyToPages.get(k).add(r.pairId);
      }
    }
  }

  const systemicKeys = new Set();
  for (const [k, pages] of keyToPages) {
    if (pages.size / n >= SYSTEMIC_THRESHOLD) systemicKeys.add(k);
  }

  const systemic = [...systemicKeys]
    .map((k) => ({ issue: keyToIssue.get(k), pageIds: [...keyToPages.get(k)].sort(), count: keyToPages.get(k).size }))
    .sort((a, b) => b.count - a.count || sevRank(a.issue.severity) - sevRank(b.issue.severity));

  const own = new Map();
  for (const r of results) {
    own.set(r.pairId, r.issues.filter((i) => !systemicKeys.has(issueKey(i))));
  }
  return { systemic, own };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/systemic.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Full suite + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/config.js src/report/systemic.js test/systemic.test.js
git commit -m "feat: add systemic-issue aggregation across pages"
```

---

### Task 3: Report rendering — systemic page + own/site-wide split

**Files:**
- Modify: `src/report/html.js` (add `renderSystemic`; change `renderIndex`/`renderDetail` signatures; add status CSS)
- Modify: `test/html.test.js`

**Interfaces:**
- Consumes: `aggregateIssues` output (Task 2); enriched row `{ pair, result, own, systemicHits }`.
- Produces: `renderSystemic(systemic, comparableCount) -> string`; `renderIndex(rows, systemicCount) -> string`; `renderDetail(pair, result, own, systemicHits) -> string`.

- [ ] **Step 1: Update the failing tests in `test/html.test.js`**

Replace the existing `renderIndex`/`renderDetail` calls to match the new signatures and add systemic coverage. Change the two existing detail tests to pass `own` and `systemicHits` explicitly, and add:

```js
import { renderIndex, renderDetail, renderSystemic } from '../src/report/html.js';

// ... existing `pair` and `result` fixtures stay ...

test('detail renders only own issues plus a site-wide reference line', () => {
  const own = [{ category: 'layout', severity: 'High', description: 'hero missing', location: 'hero', original: 'title present', migrated: 'blank' }];
  const html = renderDetail(pair, { ...result, status: 'Failed' }, own, 38);
  assert.match(html, /hero missing/);
  assert.match(html, /38 site-wide/);
  assert.match(html, /systemic\.html/);
});

test('index shows Own and Site-wide columns and links to the systemic page', () => {
  const rows = [{ pair, result, own: result.issues, systemicHits: 38 }];
  const html = renderIndex(rows, 40);
  assert.match(html, /systemic\.html/);
  assert.match(html, /Own/);
  assert.match(html, /Site-wide/);
});

test('systemic page lists each issue with reach and affected-page links', () => {
  const systemic = [{
    issue: { category: 'text-language', severity: 'High', description: 'English footer', location: 'footer', original: 'Thai', migrated: 'English' },
    pageIds: ['my-home', 'bonds'], count: 2,
  }];
  const html = renderSystemic(systemic, 20);
  assert.match(html, /2\s*\/\s*20/);        // reach
  assert.match(html, /my-home\.html/);      // affected-page link
  assert.match(html, /English footer/);
});
```

Update the earlier `renderDetail`/`renderIndex` tests (from the grouping and value-column work) to pass the new args: any `renderDetail(pair, x)` becomes `renderDetail(pair, x, x.issues, 0)`, and any `renderIndex([{ pair, result: x }])` becomes `renderIndex([{ pair, result: x, own: x.issues, systemicHits: 0 }], 0)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/html.test.js`
Expected: FAIL (signature mismatch / `renderSystemic` undefined)

- [ ] **Step 3: Update `src/report/html.js`**

Add `Not`/`Retired` status colors — in the `CSS` string, change the status-color line to:

```js
  .Passed{color:#0a7a2f;font-weight:600}.Failed{color:#b00020;font-weight:600}
  .Capture{color:#b06a00;font-weight:600}.Not{color:#b00020;font-weight:600}.Retired{color:#7a4a00;font-weight:600}
  .reach{background:#dbe7ff;color:#1a3a7a}
```

Extract the shared group-table renderer so detail and systemic reuse it. Add near `groupIssues`:

```js
const issueRows = (items) => items.map((i) => `
    <tr class="sev-${esc(i.severity)}">
      <td>${esc(i.severity)}</td><td>${esc(i.description)}</td>
      <td class="val val-orig">${esc(i.original ?? '—')}</td>
      <td class="val val-mig">${esc(i.migrated ?? '—')}</td>
      <td>${esc(i.location)}</td>
    </tr>`).join('');

const groupTables = (issues) => groupIssues(issues).map((g) => `
<details class="cat"${g.hasHigh ? ' open' : ''}>
  <summary>${esc(g.category)} <span class="chip chip-count">${g.items.length}</span> ${severityChips(g.items)}</summary>
  <table><tr><th>Severity</th><th>Description</th><th>Original</th><th>Migrated</th><th>Location</th></tr>${issueRows(g.items)}</table>
</details>`).join('');
```

Replace `renderIndex` with:

```js
export function renderIndex(rows, systemicCount) {
  const trs = rows.map(({ pair, result, own, systemicHits }) => `
    <tr>
      <td><a href="${esc(pair.id)}.html">${esc(pair.id)}</a></td>
      <td>${esc(pair.category)} / ${esc(pair.subCategory)}</td>
      <td class="${esc(result.status.split(' ')[0])}">${esc(result.status)}</td>
      <td>${own.length}</td>
      <td>${systemicHits}</td>
      <td>${categoryChips(own)}</td>
    </tr>`).join('');
  const banner = systemicCount > 0
    ? `<p><strong>${systemicCount} site-wide issues</strong> affect pages across the site — <a href="systemic.html">see the systemic report</a>.</p>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Migration Comparison Report</title>
<style>${CSS}</style></head><body>
<h1>Migration Comparison Report</h1>
${banner}
<table><tr><th>Page</th><th>Category</th><th>Status</th><th>Own</th><th>Site-wide</th><th>Own by category</th></tr>${trs}</table>
</body></html>`;
}
```

Replace `renderDetail` with (renders `own`, references site-wide count):

```js
export function renderDetail(pair, result, own, systemicHits) {
  const ref = systemicHits > 0
    ? `<p>+${systemicHits} site-wide issues also affect this page — <a href="systemic.html">see the systemic report</a>.</p>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(pair.id)}</title>
<style>${CSS}</style></head><body>
<p><a href="index.html">← back</a></p>
<h1>${esc(pair.id)} — <span class="${esc(result.status.split(' ')[0])}">${esc(result.status)}</span></h1>
<p>Original: <a href="${esc(pair.originalUrl)}">${esc(pair.originalUrl)}</a><br>
Migrated: <a href="${esc(pair.migratedUrl)}">${esc(pair.migratedUrl)}</a></p>
<div class="shots">
  <div><p class="cap">Original</p><img src="../shots/${esc(pair.id)}-orig.png" alt="original"></div>
  <div><p class="cap">Migrated</p><img src="../shots/${esc(pair.id)}-mig.png" alt="migrated"></div>
</div>
<h2>Own issues (${own.length})</h2>
${ref}
${groupTables(own) || '<p>No page-specific issues.</p>'}
<script>${SYNC_SCROLL}</script>
</body></html>`;
}
```

Add `renderSystemic` (collapsible category groups, matching detail-page style, with reach + affected-page columns):

```js
export function renderSystemic(systemic, comparableCount) {
  const byCat = new Map();
  for (const s of systemic) byCat.set(s.issue.category, [...(byCat.get(s.issue.category) ?? []), s]);
  const groups = [...byCat.entries()]
    .map(([category, entries]) => ({
      category,
      entries: [...entries].sort((a, b) => b.count - a.count || severityRank(a.issue.severity) - severityRank(b.issue.severity)),
      hasHigh: entries.some((e) => e.issue.severity === 'High'),
    }))
    .sort((a, b) => (b.hasHigh - a.hasHigh) || (b.entries.length - a.entries.length));

  const groupsHtml = groups.map((g) => `
<details class="cat"${g.hasHigh ? ' open' : ''}>
  <summary>${esc(g.category)} <span class="chip chip-count">${g.entries.length}</span></summary>
  <table><tr><th>Severity</th><th>Description</th><th>Original</th><th>Migrated</th><th>Reach</th><th>Affected pages</th></tr>${g.entries.map((s) => `
    <tr class="sev-${esc(s.issue.severity)}">
      <td>${esc(s.issue.severity)}</td><td>${esc(s.issue.description)}</td>
      <td class="val val-orig">${esc(s.issue.original ?? '—')}</td>
      <td class="val val-mig">${esc(s.issue.migrated ?? '—')}</td>
      <td><span class="chip reach">${s.count} / ${comparableCount}</span></td>
      <td>${s.pageIds.map((id) => `<a href="${esc(id)}.html">${esc(id)}</a>`).join(', ')}</td>
    </tr>`).join('')}</table>
</details>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Site-wide (systemic) issues</title>
<style>${CSS}</style></head><body>
<p><a href="index.html">← back</a></p>
<h1>Site-wide issues (${systemic.length})</h1>
<p>Issues appearing on at least 60% of comparable pages. Fix these once at the template level.</p>
${groupsHtml || '<p>No site-wide issues.</p>'}
</body></html>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/html.test.js`
Expected: PASS

- [ ] **Step 5: Full suite + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/report/html.js test/html.test.js
git commit -m "feat: add systemic rollup page and own/site-wide split in report"
```

---

### Task 4: Sheet CSV — own + site-wide + 404 summaries

**Files:**
- Modify: `src/report/csv.js`
- Modify: `test/csv.test.js`

**Interfaces:**
- Consumes: enriched row `{ pair, result, own, systemicHits }`.
- Produces: `renderSheetCsv(rows) -> string` (same header, richer `openIssues`).

- [ ] **Step 1: Update the failing tests in `test/csv.test.js`**

The existing tests build rows as `{ pair, result }`; update them to include `own` and `systemicHits`, and add cases. Change existing rows to add `own: result.issues, systemicHits: 0`. Add:

```js
test('summary splits own issues from site-wide count', () => {
  const result = { pairId: 'a', status: 'Failed', issues: [] };
  const own = [
    { category: 'missing-module', severity: 'High', description: 'd', location: 'l' },
    { category: 'layout', severity: 'Medium', description: 'd', location: 'l' },
  ];
  const csv = renderSheetCsv([{ pair, result, own, systemicHits: 38 }]);
  assert.match(csv, /2 own issues: 1 missing-module, 1 layout \(\+38 site-wide\)/);
});

test('Not Migrated and Retired on Original carry fixed summaries', () => {
  const nm = renderSheetCsv([{ pair, result: { pairId: 'a', status: 'Not Migrated', issues: [] }, own: [], systemicHits: 0 }]);
  assert.match(nm, /,Not Migrated,"Migrated URL serves a 404 page"/);
  const ro = renderSheetCsv([{ pair, result: { pairId: 'a', status: 'Retired on Original', issues: [] }, own: [], systemicHits: 0 }]);
  assert.match(ro, /,Retired on Original,"Original URL serves a 404 page \(offering retired\?\)"/);
});

test('a clean page with only site-wide issues shows the site-wide count', () => {
  const csv = renderSheetCsv([{ pair, result: { pairId: 'a', status: 'Failed', issues: [] }, own: [], systemicHits: 12 }]);
  assert.match(csv, /,Failed,"0 own issues \(\+12 site-wide\)"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/csv.test.js`
Expected: FAIL

- [ ] **Step 3: Rewrite `src/report/csv.js`**

```js
const quote = (s) => `"${String(s ?? '').replaceAll('"', '""')}"`;

const FIXED = {
  'Not Migrated': 'Migrated URL serves a 404 page',
  'Retired on Original': 'Original URL serves a 404 page (offering retired?)',
};

function summarize(own, systemicHits, status) {
  if (FIXED[status]) return FIXED[status];
  const site = systemicHits > 0 ? ` (+${systemicHits} site-wide)` : '';
  if (own.length === 0) return systemicHits > 0 ? `0 own issues${site}` : '';
  const counts = {};
  for (const i of own) counts[i.category] = (counts[i.category] ?? 0) + 1;
  const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} ${c}`);
  return `${own.length} own issues: ${parts.join(', ')}${site}`;
}

export function renderSheetCsv(rows) {
  const lines = ['originalUrl,validationStatus,openIssues'];
  for (const { pair, result, own, systemicHits } of rows) {
    lines.push(`${quote(pair.originalUrl)},${result.status},${quote(summarize(own, systemicHits, result.status))}`);
  }
  return lines.join('\n') + '\n';
}
```

- [ ] **Step 4: Run tests + full suite**

Run: `node --test test/csv.test.js && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/report/csv.js test/csv.test.js
git commit -m "feat: split own vs site-wide issues in sheet CSV with 404 summaries"
```

---

### Task 5: Wire aggregation into run-report + verify on real data

**Files:**
- Modify: `src/run-report.js`

**Interfaces:**
- Consumes: `aggregateIssues` (Task 2), `renderIndex`/`renderDetail`/`renderSystemic` (Task 3), `renderSheetCsv` (Task 4), `DIRS` (config).
- Produces: `output/report/systemic.html`, `output/issues/systemic.json`, and enriched inputs to all renderers.

- [ ] **Step 1: Rewrite `src/run-report.js`**

```js
import fs from 'node:fs';
import { parsePages } from './input.js';
import { DIRS } from './config.js';
import { mergeIssues } from './report/merge.js';
import { aggregateIssues, issueKey } from './report/systemic.js';
import { renderIndex, renderDetail, renderSystemic } from './report/html.js';
import { renderSheetCsv } from './report/csv.js';

const readJson = (file) => {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`warn: unreadable issue file ${file}: ${e.message}`);
    return null;
  }
};

fs.mkdirSync(DIRS.report, { recursive: true });
fs.mkdirSync(DIRS.detIssues, { recursive: true });
const pairs = parsePages(fs.readFileSync('pages.csv', 'utf8'));

const entries = pairs.map((pair) => {
  const det = readJson(`${DIRS.detIssues}/${pair.id}.json`)
    ?? { pairId: pair.id, status: 'Capture Failed', issues: [{ category: 'capture-failure', severity: 'High', description: 'No comparison result found — run run-capture and run-compare first', location: 'page-wide' }] };
  const ai = readJson(`${DIRS.aiIssues}/${pair.id}.json`);
  return { pair, result: mergeIssues(det, ai) };
});

const { systemic, own } = aggregateIssues(entries.map((e) => e.result));
const systemicKeys = new Set(systemic.map((s) => issueKey(s.issue)));
const comparableCount = entries.filter((e) => e.result.status === 'Passed' || e.result.status === 'Failed').length;

const rows = entries.map((e) => {
  const ownIssues = own.get(e.pair.id) ?? e.result.issues;
  const systemicHits = e.result.issues.filter((i) => systemicKeys.has(issueKey(i))).length;
  return { ...e, own: ownIssues, systemicHits };
});

fs.writeFileSync(`${DIRS.report}/index.html`, renderIndex(rows, systemic.length));
fs.writeFileSync(`${DIRS.report}/systemic.html`, renderSystemic(systemic, comparableCount));
for (const { pair, result, own: ownIssues, systemicHits } of rows) {
  fs.writeFileSync(`${DIRS.report}/${pair.id}.html`, renderDetail(pair, result, ownIssues, systemicHits));
}
fs.writeFileSync('output/sheet-update.csv', renderSheetCsv(rows));
fs.writeFileSync(`${DIRS.detIssues.replace('/det', '')}/systemic.json`, JSON.stringify(systemic, null, 2));

for (const { pair, result, own: ownIssues, systemicHits } of rows) {
  console.log(`${pair.id}: ${result.status} (${ownIssues.length} own, +${systemicHits} site-wide)`);
}
console.log(`\n${systemic.length} site-wide issues. Report: ${DIRS.report}/index.html | Systemic: ${DIRS.report}/systemic.html | CSV: output/sheet-update.csv`);
```

Note: `DIRS.detIssues` is `output/issues/det`; `DIRS.detIssues.replace('/det', '')` → `output/issues`, so systemic.json lands at `output/issues/systemic.json` per spec.

- [ ] **Step 2: Full suite (no new unit tests; this task is wiring + real-data verification)**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Verify on the existing 20-page snapshots (no re-capture)**

Run: `node src/run-compare.js && node src/run-report.js`
Expected: console shows per-page `(N own, +M site-wide)`; `mtc-debentures` shows status `Retired on Original`. Then inspect:

```bash
node -e "const s=require('./output/issues/systemic.json'); console.log('systemic issues:', s.length); s.slice(0,5).forEach(x=>console.log(' -', x.count+'pp', x.issue.category, JSON.stringify(x.issue.migrated||x.issue.description).slice(0,60)))"
grep -c 'Retired on Original' output/sheet-update.csv
```

Expected: several systemic issues (the English-chrome text-language, link-target, and shared broken-link entries) each with high `count`; per-page own counts drop to single digits for the template-identical debenture pages; at least 1 `Retired on Original` row (mtc-debentures). If a systemic issue looks wrong (e.g. a genuinely page-specific issue marked systemic), note it — threshold tuning is a follow-up, not a fix here.

- [ ] **Step 4: Commit**

```bash
git add src/run-report.js
git commit -m "feat: wire systemic aggregation into report with rollup page and systemic.json"
```
