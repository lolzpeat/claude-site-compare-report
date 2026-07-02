# Systemic Key Stabilization + Threshold Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make identical summary/cap issues dedupe across pages (via an optional `keyHint`) and lower the systemic threshold to 0.5, so per-page "own" issue counts drop closer to genuinely page-specific issues.

**Architecture:** Two small additive changes. (1) `issueKey` in `src/report/systemic.js` gains a leading `keyHint` branch; the three summary/cap issues set a stable `keyHint`. (2) `SYSTEMIC_THRESHOLD` drops 0.6 → 0.5. No change to capture, rendering, or CSV.

**Tech Stack:** Node.js ≥ 20 (ESM), built-in `node:test`. No new dependencies.

## Global Constraints

- `issueKey(i)` precedence: `keyHint` present → `` `${i.category}|${i.keyHint}` ``; else original/migrated non-empty → `` `${i.category}|${i.original ?? ''}|${i.migrated ?? ''}` `` (unchanged); else → `` `${i.category}|${normalizeText(i.description)}` `` (unchanged).
- `keyHint` is a dedup key only — never rendered. Issues without it key exactly as before (behavior preserved).
- Stable keyHints (exact strings): links.js summary → `orig-links-missing-summary`; text.js summary → `text-blocks-missing-summary`; link-targets.js summary → `link-targets-missing-summary`.
- Only the three `missing.length > cap` summary issues get a keyHint; per-item issues are untouched.
- `SYSTEMIC_THRESHOLD = 0.5` (was 0.6); `SYSTEMIC_MIN_PAGES = 3` unchanged. Systemic when `pages.size / n >= SYSTEMIC_THRESHOLD` and `n >= SYSTEMIC_MIN_PAGES`.
- Built-in node:test; `npm test` runs the suite. Commit format `<type>: <description>`, no attribution footer.

## File Structure

```
src/
├── config.js                    # SYSTEMIC_THRESHOLD 0.6 → 0.5
├── report/systemic.js           # issueKey gains keyHint branch
└── compare/
    ├── links.js                 # + keyHint on missing-links summary
    ├── text.js                  # + keyHint on missing-text summary
    └── link-targets.js          # + keyHint on missing-targets summary
test/
├── systemic.test.js             # + keyHint precedence, 0.5 boundary
├── compare-links.test.js        # + assert summary keyHint
├── compare-text.test.js         # + assert summary keyHint
└── compare-link-targets.test.js # + assert summary keyHint
```

Issue shape (documented): `{category, severity, description, location, original?, migrated?, keyHint?}` — `keyHint` optional, additive.

---

### Task 1: keyHint in issueKey + threshold 0.5

**Files:**
- Modify: `src/report/systemic.js` (issueKey)
- Modify: `src/config.js` (SYSTEMIC_THRESHOLD)
- Modify: `test/systemic.test.js`

**Interfaces:**
- Consumes: `normalizeText` (existing).
- Produces: `issueKey(i)` now consults `i.keyHint` first; `SYSTEMIC_THRESHOLD` is `0.5`.

- [ ] **Step 1: Add the failing tests to `test/systemic.test.js`**

Append these tests (the file already imports `aggregateIssues, issueKey, countSystemicHits` and defines the `iss`/`page` helpers):

```js
test('issueKey prefers keyHint over original/migrated values', () => {
  const a = { category: 'broken-link', severity: 'High', description: 'd1', original: '114 links', migrated: '114 missing', keyHint: 'links-summary' };
  const b = { category: 'broken-link', severity: 'High', description: 'd2', original: '9 links', migrated: '9 missing', keyHint: 'links-summary' };
  assert.equal(issueKey(a), 'broken-link|links-summary');
  assert.equal(issueKey(a), issueKey(b)); // different counts, same key → dedupe
});

test('summary issues with a shared keyHint dedupe into one systemic entry despite differing counts', () => {
  const summary = (n) => ({ category: 'broken-link', severity: 'High', description: `${n} missing`, original: `${n} links`, migrated: `${n} missing`, keyHint: 'links-summary' });
  const results = [page('a', [summary(50)]), page('b', [summary(9)]), page('c', [summary(114)])];
  const { systemic, own } = aggregateIssues(results);
  assert.equal(systemic.length, 1);      // 3/3 pages, one key
  assert.equal(systemic[0].count, 3);
  assert.equal(own.get('a').length, 0);
});

test('threshold is 0.5: an issue on exactly half of comparable pages is systemic', () => {
  const shared = () => ({ category: 'layout', severity: 'Medium', description: 'x', original: 'A', migrated: 'B' });
  // 2 of 4 comparable = 0.5 → systemic; the 1-of-4 issue stays own
  const results = [
    page('a', [shared(), { category: 'layout', severity: 'Low', description: 'a-only', original: undefined, migrated: undefined }]),
    page('b', [shared()]),
    page('c', []),
    page('d', []),
  ];
  const { systemic } = aggregateIssues(results);
  assert.equal(systemic.length, 1);
  assert.equal(systemic[0].count, 2);
  assert.match(systemic[0].issue.description, /^x$/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/systemic.test.js`
Expected: FAIL — keyHint tests fail (issueKey ignores keyHint, so `issueKey(a)` is `broken-link|114 links|114 missing`); the 0.5 test fails at threshold 0.6 (2/4 = 0.5 < 0.6 → not systemic).

- [ ] **Step 3: Add the keyHint branch to `issueKey` in `src/report/systemic.js`**

Replace the `issueKey` function body with:

```js
export function issueKey(i) {
  if (i.keyHint != null && i.keyHint !== '') return `${i.category}|${i.keyHint}`;
  const hasVals = (i.original != null && i.original !== '') || (i.migrated != null && i.migrated !== '');
  return hasVals
    ? `${i.category}|${i.original ?? ''}|${i.migrated ?? ''}`
    : `${i.category}|${normalizeText(i.description)}`;
}
```

- [ ] **Step 4: Lower the threshold in `src/config.js`**

Change the line `export const SYSTEMIC_THRESHOLD = 0.6;` to:

```js
export const SYSTEMIC_THRESHOLD = 0.5;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/systemic.test.js`
Expected: PASS (all, including the 3 new tests and the pre-existing ones — the existing "≥60%" test uses 3/4 = 0.75 and the negative cases use ≤0.33, all still correct at 0.5).

- [ ] **Step 6: Full suite + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/report/systemic.js src/config.js test/systemic.test.js
git commit -m "feat: consult keyHint in issueKey and lower systemic threshold to 0.5"
```

---

### Task 2: keyHints on the three summary issues + verification

**Files:**
- Modify: `src/compare/links.js`, `src/compare/text.js`, `src/compare/link-targets.js`
- Modify: `test/compare-links.test.js`, `test/compare-text.test.js`, `test/compare-link-targets.test.js`

**Interfaces:**
- Consumes: `issueKey`'s keyHint branch (Task 1).
- Produces: the three summary issues each carry a stable `keyHint`.

- [ ] **Step 1: Add keyHint assertions to the three cap tests**

Each comparator test already has a "caps … at N and adds a High summary" test. Add one assertion to each, finding the summary issue and checking its keyHint.

In `test/compare-links.test.js`, in the cap test (the one asserting the `25 original links missing` summary), after the summary is located add:
```js
  assert.equal(summary[0].keyHint, 'orig-links-missing-summary');
```

In `test/compare-text.test.js`, in the `18 original text blocks missing` cap test, after locating `summary` add:
```js
  assert.equal(summary[0].keyHint, 'text-blocks-missing-summary');
```

In `test/compare-link-targets.test.js`, in the `25 original links have no matching destination` cap test, after locating `summary` add:
```js
  assert.equal(summary[0].keyHint, 'link-targets-missing-summary');
```

- [ ] **Step 2: Run the three tests to verify they fail**

Run: `node --test test/compare-links.test.js test/compare-text.test.js test/compare-link-targets.test.js`
Expected: FAIL — `summary[0].keyHint` is `undefined` (not yet set).

- [ ] **Step 3: Add keyHint to the links.js summary issue**

In `src/compare/links.js`, the `if (missing.length > MAX_MISSING_REPORTED)` block currently is:

```js
    issues.push({
      category: 'broken-link', severity: 'High',
      description: `${missing.length} original links missing on migrated (first ${MAX_MISSING_REPORTED} listed)`,
      location: 'page-wide',
      original: `${missing.length} original links`, migrated: `${missing.length} missing`,
    });
```

Add the keyHint field:

```js
    issues.push({
      category: 'broken-link', severity: 'High',
      description: `${missing.length} original links missing on migrated (first ${MAX_MISSING_REPORTED} listed)`,
      location: 'page-wide',
      original: `${missing.length} original links`, migrated: `${missing.length} missing`,
      keyHint: 'orig-links-missing-summary',
    });
```

- [ ] **Step 4: Add keyHint to the text.js summary issue**

In `src/compare/text.js`, the `if (missing.length > MAX_MISSING_REPORTED)` block currently is:

```js
    issues.push({
      category: 'text-language', severity: 'High',
      description: `${missing.length} original text blocks missing on migrated (first ${MAX_MISSING_REPORTED} listed)`,
      location: 'page-wide',
      original: `${missing.length} text blocks`, migrated: `${missing.length} missing`,
    });
```

Add the keyHint field:

```js
    issues.push({
      category: 'text-language', severity: 'High',
      description: `${missing.length} original text blocks missing on migrated (first ${MAX_MISSING_REPORTED} listed)`,
      location: 'page-wide',
      original: `${missing.length} text blocks`, migrated: `${missing.length} missing`,
      keyHint: 'text-blocks-missing-summary',
    });
```

- [ ] **Step 5: Add keyHint to the link-targets.js summary issue**

In `src/compare/link-targets.js`, the `if (missing.length > MAX_REPORTED)` block currently is:

```js
    issues.push({
      category: 'link-target', severity: 'High',
      description: `${missing.length} original links have no matching destination on migrated (first ${MAX_REPORTED} listed)`,
      location: 'page-wide',
      original: `${missing.length} link targets`, migrated: `${missing.length} unmatched`,
    });
```

Add the keyHint field:

```js
    issues.push({
      category: 'link-target', severity: 'High',
      description: `${missing.length} original links have no matching destination on migrated (first ${MAX_REPORTED} listed)`,
      location: 'page-wide',
      original: `${missing.length} link targets`, migrated: `${missing.length} unmatched`,
      keyHint: 'link-targets-missing-summary',
    });
```

- [ ] **Step 6: Run the three tests + full suite**

Run: `node --test test/compare-links.test.js test/compare-text.test.js test/compare-link-targets.test.js && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/compare/links.js src/compare/text.js src/compare/link-targets.js test/compare-links.test.js test/compare-text.test.js test/compare-link-targets.test.js
git commit -m "feat: stable keyHint on summary issues so they dedupe across pages"
```

- [ ] **Step 8: Verify on the existing 20-page snapshots (no re-capture)**

Run: `node src/run-compare.js && node src/run-report.js`
Expected: console shows per-page `(N own, +M site-wide)`. Compare N against the prior run (own counts were 12-31). Then inspect:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const sys = JSON.parse(readFileSync('output/issues/systemic.json','utf8'));
console.log('systemic entries:', sys.length);
console.log('summary keyHints present:', sys.filter(s => s.issue.keyHint).map(s => s.issue.keyHint));
"
```

(The per-page own counts come from the `run-report` console output printed above — compare them against the prior 12-31 range.)

Expected: `output/issues/systemic.json` now contains the three summary keyHints (`orig-links-missing-summary`, `text-blocks-missing-summary`, `link-targets-missing-summary`) as single systemic entries with high `count`; the run-report console per-page own counts are lower than the prior 12-31. Spot-check 2-3 pages' detail HTML (open `output/report/<id>.html`) to confirm no obviously page-specific issue (a page's unique body text) was mis-promoted to systemic. If one was, record it in the report — do NOT change the threshold back without evidence.

- [ ] **Step 9: Record verification results**

Append a short note to `.superpowers/sdd/progress.md` (or the report file the executor is using) with: prior own-count range (12-31), new own-count range observed, systemic entry count before/after, and any mis-promotion spotted. No commit needed (progress ledger is gitignored scratch); if the executor prefers a durable record, append to `docs/superpowers/specs/2026-07-02-pilot-findings.md` under a new "Key-tuning verification" heading and commit that.
