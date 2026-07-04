# Zone-Based Checks & Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split checking and reporting by page zone — shared chrome (header/nav + footer) checked site-wide without failing pages, a per-page hero check, and a new `chrome.html` per sheet — per the approved spec `docs/superpowers/specs/2026-07-04-zone-based-checks-design.md`.

**Architecture:** New comparators `src/compare/chrome.js` (chrome zones, returns issues + stats kept OUT of page status) and `src/compare/hero.js` (per-page, counted in status). `comparePair` returns `{ status, issues, chromeIssues, chromeStats }`. `run-report` aggregates chromeIssues per sheet with the existing `issueKey` dedup into `report/<slug>/chrome.html` + `chrome.json`. Generic link comparators become main-scoped so chrome-region links are owned exclusively by the chrome comparator.

**Tech Stack:** Node ESM, `node:test` (run via `npm test` ONLY — `node --test test/` breaks on newer Node), no new dependencies.

## Global Constraints

- Report UI text is Thai via `src/report/labels.js`; contract values (categories, severities, statuses, zones) and CSS class names stay English.
- New contract values: categories `hero`, `menu-label`; issue field `zone` ∈ `header-nav | footer | hero | main` (optional; absent = main).
- Chrome issues NEVER affect per-page `Passed`/`Failed`.
- Dedup gotcha: never embed per-page counts/URLs in an issue's `original`/`migrated`; use a stable `keyHint` for summary issues (see `issueKey` in `src/report/systemic.js`).
- No re-capture: existing snapshots already carry `region` on links/images/textBlocks. `run-compare`/`run-report` are offline.
- Immutability, small focused files, no `console.log` in library code (`run-*.js` entry scripts already use console and may continue to).
- Run the full suite with `npm test` after every implementation step. All existing tests must stay green.

## File Structure

| File | Responsibility |
|---|---|
| Create `src/compare/zones.js` | Shared zone constants (region→zone mapping) — breaks would-be import cycle between links.js and chrome.js |
| Create `src/compare/chrome.js` | Chrome-zone comparator: link parity, label language/mismatch, coverage summary, zone-scoped broken links, per-zone stats |
| Create `src/compare/hero.js` | Conservative per-page hero comparator |
| Modify `src/compare/link-targets.js` | Export `expectedKey`/`migKey`; skip chrome-region original links |
| Modify `src/compare/links.js` | `migLinkStatusIssues(migEnv, regions)` filter; skip chrome-region original links |
| Modify `src/compare/news-detail.js` | Pass content-region filter to `migLinkStatusIssues` |
| Modify `src/compare/compare.js` | New return shape; run chrome on every comparable page (incl. News-Detail), hero on generic pages only |
| Modify `src/report/merge.js` | Pass `chromeIssues`/`chromeStats` through |
| Create `src/report/chrome.js` | `aggregateChrome` (dedup + page counts + median stats) and `renderChrome` (chrome.html) |
| Modify `src/report/labels.js` | `ZONE_LABEL`, new category labels, new `T` strings |
| Modify `src/report/html.js` | Detail page zone grouping + collapsed chrome block; index/landing chrome links; CSS |
| Modify `src/run-report.js` | Wire aggregation, write chrome.html/chrome.json, sheet summaries |
| Modify `src/run-compare.js` | Log chrome count |
| Modify `src/report/criteria.js` | Document new categories, zones, `ZONE_COVERAGE_MIN` |
| Modify `src/config.js` | `ZONE_COVERAGE_MIN = 0.5` |
| Modify `CLAUDE.md` | Contract updates (final task) |

---

### Task 1: Zone constants + region-filtered link statuses + URL-match helper exports

**Files:**
- Create: `src/compare/zones.js`
- Modify: `src/compare/link-targets.js:11-29` (add `export` to two functions)
- Modify: `src/compare/links.js:8-30` (`migLinkStatusIssues` gains optional region filter)
- Test: `test/compare-links.test.js` (append), `test/compare-link-targets.test.js` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CHROME_REGIONS: Set<string>`, `ZONE_OF_REGION: Record<string,string>`, `CHROME_ZONES: string[]` from `zones.js`; `expectedKey(href): string|null`, `migKey(href): string|null` exported from `link-targets.js`; `migLinkStatusIssues(migEnv, regions?: Set<string>|null)` — `null`/omitted = all regions (backwards compatible).

- [ ] **Step 1: Write the failing tests**

Append to `test/compare-links.test.js`:

```js
test('migLinkStatusIssues with a region set only reports links in those regions', () => {
  const migEnv = {
    linkStatuses: { 'https://m/a': 404, 'https://m/b': 404 },
    snapshot: { links: [
      { href: 'https://m/a', text: 'ก', region: 'footer' },
      { href: 'https://m/b', text: 'ข', region: 'main' },
    ], images: [], textBlocks: [], modules: [] },
  };
  const footerOnly = migLinkStatusIssues(migEnv, new Set(['footer']));
  assert.equal(footerOnly.length, 1);
  assert.equal(footerOnly[0].region, 'footer');
  const all = migLinkStatusIssues(migEnv);
  assert.equal(all.length, 2);
});

test('migLinkStatusIssues treats a status URL with no matching link as page-wide', () => {
  const migEnv = {
    linkStatuses: { 'https://m/gone': 404 },
    snapshot: { links: [], images: [], textBlocks: [], modules: [] },
  };
  assert.equal(migLinkStatusIssues(migEnv, new Set(['main', 'page-wide'])).length, 1);
  assert.equal(migLinkStatusIssues(migEnv, new Set(['footer'])).length, 0);
});
```

(`migLinkStatusIssues` is already imported in that test file's module under test via `../src/compare/links.js` — add it to the import if absent: `import { compareLinks, migLinkStatusIssues } from '../src/compare/links.js';`)

Append to `test/compare-link-targets.test.js`:

```js
import { expectedKey, migKey } from '../src/compare/link-targets.js';

test('expectedKey maps th-TH original URL to migrated host+path key', () => {
  assert.equal(
    expectedKey('https://www.bangkokbank.com/th-TH/Personal/Loans/'),
    'prod-aem.bangkokbank.com/th/personal/loans',
  );
  assert.equal(expectedKey('https://other.example.com/th-TH/x'), null);
});

test('migKey normalizes a migrated URL to host+path', () => {
  assert.equal(migKey('https://prod-aem.bangkokbank.com/th/Personal/'), 'prod-aem.bangkokbank.com/th/personal');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `migLinkStatusIssues` ignores the second argument (first new test fails on `all vs footerOnly` counts) and `expectedKey`/`migKey` are not exported (SyntaxError/undefined).

- [ ] **Step 3: Implement**

Create `src/compare/zones.js`:

```js
// Shared zone vocabulary. Chrome = the site-wide page furniture every page shares.
// The original site splits nav from header while migrated AEM lumps both into
// 'header', so both regions map to one comparable zone: 'header-nav'.
export const CHROME_REGIONS = new Set(['header', 'nav', 'footer']);

export const ZONE_OF_REGION = { header: 'header-nav', nav: 'header-nav', footer: 'footer' };

export const CHROME_ZONES = ['header-nav', 'footer'];
```

In `src/compare/link-targets.js`, add `export` to the two helpers (bodies unchanged):

```js
export function expectedKey(href) {
```

```js
export function migKey(href) {
```

In `src/compare/links.js`, change `migLinkStatusIssues` signature and add the filter:

```js
export function migLinkStatusIssues(migEnv, regions = null) {
  const issues = [];
  const linkFor = (url) => migEnv.snapshot.links.find((l) => l.href === url);

  for (const [url, status] of Object.entries(migEnv.linkStatuses ?? {})) {
    const ml = linkFor(url);
    const region = ml?.region ?? 'page-wide';
    if (regions && !regions.has(region)) continue;
```

(rest of the function unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (full suite green — the default `regions = null` keeps existing callers' behavior).

- [ ] **Step 5: Commit**

```bash
git add src/compare/zones.js src/compare/link-targets.js src/compare/links.js test/compare-links.test.js test/compare-link-targets.test.js
git commit -m "feat: zone constants, region-filtered link statuses, exported URL-match helpers"
```

---

### Task 2: Chrome-zone comparator

**Files:**
- Create: `src/compare/chrome.js`
- Modify: `src/config.js` (add one constant)
- Test: Create `test/compare-chrome.test.js`

**Interfaces:**
- Consumes: `expectedKey`/`migKey` (Task 1), `migLinkStatusIssues(migEnv, regions)` (Task 1), `zones.js` constants, `normalizeText`/`thaiRatio` from `src/lib/text-utils.js`, `ZONE_COVERAGE_MIN` from config.
- Produces: `compareChrome(origEnv, migEnv): { issues: Issue[], stats: {zone, orig, mig, matched, missing}[] }`. Every issue carries `zone: 'header-nav'|'footer'`. Stats array always has exactly 2 entries in `CHROME_ZONES` order.

- [ ] **Step 1: Write the failing tests**

Create `test/compare-chrome.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareChrome } from '../src/compare/chrome.js';

const ORIG = 'https://www.bangkokbank.com';
const MIG = 'https://prod-aem.bangkokbank.com';

const env = (links, linkStatuses = {}) => ({
  requestedUrl: 'https://x/p', linkStatuses,
  snapshot: { finalUrl: 'https://x/p', title: 't', links, images: [], textBlocks: [], modules: [] },
});

test('matched chrome link with same Thai label yields no issues', () => {
  const { issues } = compareChrome(
    env([{ href: `${ORIG}/th-TH/Personal`, text: 'บุคคล', region: 'nav' }]),
    env([{ href: `${MIG}/th/personal`, text: 'บุคคล', region: 'header' }]),
  );
  assert.deepEqual(issues, []);
});

test('orig nav matches mig header — both map to the header-nav zone', () => {
  const { issues, stats } = compareChrome(
    env([{ href: `${ORIG}/th-TH/Loans`, text: 'สินเชื่อ', region: 'nav' }]),
    env([{ href: `${MIG}/th/loans`, text: 'สินเชื่อ', region: 'header' }]),
  );
  assert.deepEqual(issues, []);
  assert.equal(stats[0].zone, 'header-nav');
  assert.equal(stats[0].matched, 1);
});

test('missing chrome link yields link-target Medium tagged with its zone', () => {
  const { issues } = compareChrome(
    env([{ href: `${ORIG}/th-TH/Help-Center`, text: 'ศูนย์ความช่วยเหลือ', region: 'footer' }]),
    env([]),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'link-target');
  assert.equal(issues[0].severity, 'Medium');
  assert.equal(issues[0].zone, 'footer');
  assert.match(issues[0].original, /help-center/);
});

test('English label on a matched URL yields text-language High with both labels', () => {
  const { issues } = compareChrome(
    env([{ href: `${ORIG}/th-TH/International-Banking`, text: 'กิจการธนาคารต่างประเทศ', region: 'header' }]),
    env([{ href: `${MIG}/th/international-banking`, text: 'International Banking', region: 'header' }]),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'text-language');
  assert.equal(issues[0].severity, 'High');
  assert.equal(issues[0].zone, 'header-nav');
  assert.equal(issues[0].original, 'กิจการธนาคารต่างประเทศ');
  assert.equal(issues[0].migrated, 'International Banking');
});

test('different Thai label on a matched URL yields menu-label Medium', () => {
  const { issues } = compareChrome(
    env([{ href: `${ORIG}/th-TH/IBanking`, text: 'บัวหลวง ไอแบงก์กิ้ง', region: 'nav' }]),
    env([{ href: `${MIG}/th/ibanking`, text: 'บริการธนาคารทางอินเทอร์เน็ต', region: 'header' }]),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'menu-label');
  assert.equal(issues[0].severity, 'Medium');
});

test('coverage summary fires once when under half of ≥5 mappable links match', () => {
  const links = ['A', 'B', 'C', 'D', 'E'].map((p) => ({
    href: `${ORIG}/th-TH/${p}`, text: p, region: 'footer',
  }));
  const { issues } = compareChrome(env(links), env([]));
  const summary = issues.filter((i) => i.keyHint === 'chrome-footer-coverage');
  assert.equal(summary.length, 1);
  assert.equal(summary[0].severity, 'High');
  assert.equal(summary[0].zone, 'footer');
});

test('no coverage summary with fewer than 5 mappable links', () => {
  const links = ['A', 'B'].map((p) => ({ href: `${ORIG}/th-TH/${p}`, text: p, region: 'footer' }));
  const { issues } = compareChrome(env(links), env([]));
  assert.equal(issues.filter((i) => i.keyHint).length, 0);
});

test('chrome-region 404 becomes a zone-tagged broken-link issue', () => {
  const migEnv = env(
    [{ href: `${MIG}/th/privacy`, text: 'นโยบายความเป็นส่วนตัว', region: 'footer' }],
    { [`${MIG}/th/privacy`]: 404 },
  );
  const { issues } = compareChrome(env([]), migEnv);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'broken-link');
  assert.equal(issues[0].zone, 'footer');
});

test('main-region links are ignored entirely', () => {
  const { issues, stats } = compareChrome(
    env([{ href: `${ORIG}/th-TH/Article`, text: 'บทความ', region: 'main' }]),
    env([], { 'https://m/main-404': 404 }),
  );
  assert.deepEqual(issues, []);
  assert.equal(stats[0].orig + stats[1].orig, 0);
});

test('stats reports per-zone orig/mig/matched/missing counts', () => {
  const { stats } = compareChrome(
    env([
      { href: `${ORIG}/th-TH/A`, text: 'เอ', region: 'nav' },
      { href: `${ORIG}/th-TH/B`, text: 'บี', region: 'header' },
      { href: `${ORIG}/th-TH/F`, text: 'เอฟ', region: 'footer' },
    ]),
    env([
      { href: `${MIG}/th/a`, text: 'เอ', region: 'header' },
      { href: `${MIG}/th/f`, text: 'เอฟ', region: 'footer' },
    ]),
  );
  assert.deepEqual(stats, [
    { zone: 'header-nav', orig: 2, mig: 1, matched: 1, missing: 1 },
    { zone: 'footer', orig: 1, mig: 1, matched: 1, missing: 0 },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/compare/chrome.js'`.

- [ ] **Step 3: Implement**

Add to `src/config.js` (after `SYSTEMIC_MIN_PAGES`):

```js
export const ZONE_COVERAGE_MIN = 0.5; // chrome zone: matched/mappable below this → one High summary issue
```

Create `src/compare/chrome.js`:

```js
import { normalizeText, thaiRatio } from '../lib/text-utils.js';
import { expectedKey, migKey } from './link-targets.js';
import { migLinkStatusIssues } from './links.js';
import { CHROME_REGIONS, ZONE_OF_REGION, CHROME_ZONES } from './zones.js';
import { ZONE_COVERAGE_MIN } from '../config.js';

const MAX_REPORTED_PER_ZONE = 20;
const MIN_MAPPABLE_FOR_COVERAGE = 5;
const THAI_ORIG_MIN = 0.5; // original label counts as Thai above this ratio
const THAI_MIG_MAX = 0.2; // migrated label counts as not-Thai below this ratio

const zoneLinks = (snapshot, zone) =>
  (snapshot.links ?? []).filter((l) => ZONE_OF_REGION[l.region] === zone);

// Compare the shared chrome (header/nav + footer) between sides. Links are matched
// across sides by expected URL, not by text, so label checks only run on real pairs.
// Issues returned here are aggregated site-wide by run-report and NEVER affect
// per-page status.
export function compareChrome(origEnv, migEnv) {
  const issues = [];
  const stats = [];

  for (const zone of CHROME_ZONES) {
    const origLinks = zoneLinks(origEnv.snapshot, zone);
    const migLinks = zoneLinks(migEnv.snapshot, zone);

    const migByKey = new Map();
    for (const l of migLinks) {
      const k = migKey(l.href);
      if (k && !migByKey.has(k)) migByKey.set(k, l);
    }

    const seen = new Set();
    let matched = 0;
    const missing = [];
    for (const l of origLinks) {
      const key = expectedKey(l.href);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const mig = migByKey.get(key);
      if (!mig) {
        missing.push({ text: normalizeText(l.text), key });
        continue;
      }
      matched += 1;
      const origText = normalizeText(l.text);
      const migText = normalizeText(mig.text);
      if (!origText || !migText) continue;
      if (thaiRatio(origText) > THAI_ORIG_MIN && thaiRatio(migText) < THAI_MIG_MAX) {
        issues.push({
          category: 'text-language', severity: 'High', zone,
          description: `Chrome label rendered in English instead of Thai: "${origText}"`,
          location: origText, original: origText, migrated: migText,
        });
      } else if (origText.toLowerCase() !== migText.toLowerCase()) {
        issues.push({
          category: 'menu-label', severity: 'Medium', zone,
          description: 'Link points to the same URL but its label differs from original',
          location: origText, original: origText, migrated: migText,
        });
      }
    }

    for (const m of missing.slice(0, MAX_REPORTED_PER_ZONE)) {
      issues.push({
        category: 'link-target', severity: 'Medium', zone,
        description: `Chrome link "${m.text}" has no matching link in the migrated zone`,
        location: m.text || 'link',
        original: `${m.key} (expected)`, migrated: 'not linked',
      });
    }

    const mappable = matched + missing.length;
    if (mappable >= MIN_MAPPABLE_FOR_COVERAGE && matched / mappable < ZONE_COVERAGE_MIN) {
      issues.push({
        category: 'link-target', severity: 'High', zone,
        description: `Fewer than ${Math.round(ZONE_COVERAGE_MIN * 100)}% of mappable original links found in the migrated zone`,
        location: zone, keyHint: `chrome-${zone}-coverage`,
      });
    }

    stats.push({ zone, orig: origLinks.length, mig: migLinks.length, matched, missing: missing.length });
  }

  for (const i of migLinkStatusIssues(migEnv, CHROME_REGIONS)) {
    issues.push({ ...i, zone: ZONE_OF_REGION[i.region] ?? 'header-nav' });
  }
  return { issues, stats };
}
```

Note the coverage-summary description contains no counts — counts vary per page and would break `issueKey` dedup; the `keyHint` keys it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/compare/chrome.js src/config.js test/compare-chrome.test.js
git commit -m "feat: chrome-zone comparator (link parity, labels, coverage, zone-scoped 404s)"
```

---

### Task 3: Scope generic link comparators to content regions

**Files:**
- Modify: `src/compare/links.js:32-66` (compareLinks)
- Modify: `src/compare/link-targets.js:31-62` (compareLinkTargets)
- Modify: `src/compare/news-detail.js:109,208` (two `migLinkStatusIssues` call sites)
- Test: `test/compare-links.test.js`, `test/compare-link-targets.test.js` (append)

**Interfaces:**
- Consumes: `CHROME_REGIONS` (Task 1).
- Produces: `CONTENT_REGIONS: Set<string>` exported from `src/compare/links.js` (= `new Set(['main', 'page-wide'])`). `compareLinks`/`compareLinkTargets` skip original links whose `region` is in `CHROME_REGIONS`; their migrated-side lookup sets stay page-wide (finding the text/target anywhere still counts as present — stricter would add FPs).

- [ ] **Step 1: Write the failing tests**

Append to `test/compare-links.test.js`:

```js
test('compareLinks ignores original chrome-region links (chrome comparator owns them)', () => {
  const orig = {
    snapshot: { links: [{ href: 'https://o/a', text: 'เมนูหลักหายไป', region: 'nav' }], images: [], textBlocks: [], modules: [] },
  };
  const mig = { linkStatuses: {}, snapshot: { links: [], images: [], textBlocks: [], modules: [] } };
  assert.deepEqual(compareLinks(orig, mig), []);
});

test('compareLinks only reports 404s for content-region links', () => {
  const orig = { snapshot: { links: [], images: [], textBlocks: [], modules: [] } };
  const mig = {
    linkStatuses: { 'https://m/f': 404, 'https://m/m': 404 },
    snapshot: { links: [
      { href: 'https://m/f', text: 'ก', region: 'footer' },
      { href: 'https://m/m', text: 'ข', region: 'main' },
    ], images: [], textBlocks: [], modules: [] },
  };
  const issues = compareLinks(orig, mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].region, 'main');
});
```

Append to `test/compare-link-targets.test.js`:

```js
test('compareLinkTargets ignores original chrome-region links', () => {
  const orig = {
    snapshot: { links: [{ href: 'https://www.bangkokbank.com/th-TH/Nav-Only', text: 'เมนู', region: 'footer' }], images: [], textBlocks: [], modules: [] },
  };
  const mig = { snapshot: { links: [], images: [], textBlocks: [], modules: [] } };
  assert.deepEqual(compareLinkTargets(orig, mig), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — chrome-region links currently produce missing-link / link-target / broken-link issues in the generic comparators.

- [ ] **Step 3: Implement**

In `src/compare/links.js`, add the import and export, then scope both halves:

```js
import { normalizeText } from '../lib/text-utils.js';
import { CHROME_REGIONS } from './zones.js';

const MAX_MISSING_REPORTED = 20;

// Regions the generic (per-page) link comparators own; chrome regions belong to
// src/compare/chrome.js so the same defect can't both fail the page and appear
// site-wide.
export const CONTENT_REGIONS = new Set(['main', 'page-wide']);
```

In `compareLinks`, change the first line and the original-side loop:

```js
export function compareLinks(origEnv, migEnv) {
  const issues = [...migLinkStatusIssues(migEnv, CONTENT_REGIONS)];

  const migTexts = new Set(
    migEnv.snapshot.links.map((l) => normalizeText(l.text).toLowerCase()).filter(Boolean),
  );
  const seen = new Set();
  const missing = [];
  for (const l of origEnv.snapshot.links) {
    if (CHROME_REGIONS.has(l.region)) continue;
    const t = normalizeText(l.text);
```

(rest unchanged.)

In `src/compare/link-targets.js`, add the import and skip chrome-region originals:

```js
import { normalizeText } from '../lib/text-utils.js';
import { CHROME_REGIONS } from './zones.js';
```

```js
  for (const l of origEnv.snapshot.links) {
    if (CHROME_REGIONS.has(l.region)) continue;
    const key = expectedKey(l.href);
```

In `src/compare/news-detail.js`, update the import and both call sites:

```js
import { migLinkStatusIssues, CONTENT_REGIONS } from './links.js';
```

```js
    return [...issues, ...migLinkStatusIssues(migEnv, CONTENT_REGIONS)];
```

(both occurrences — the early "article not detected" return and the final return.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS. Existing link tests keep passing because their fixtures use region-less links (`region` undefined → treated as `page-wide` content).

- [ ] **Step 5: Commit**

```bash
git add src/compare/links.js src/compare/link-targets.js src/compare/news-detail.js test/compare-links.test.js test/compare-link-targets.test.js
git commit -m "feat: scope generic link comparators to content regions"
```

---

### Task 4: Hero comparator

**Files:**
- Create: `src/compare/hero.js`
- Test: Create `test/compare-hero.test.js`

**Interfaces:**
- Consumes: `normalizeText` from `src/lib/text-utils.js`. Snapshot modules are `{tag, className, heading, imageFiles, height, region}` in DOM order.
- Produces: `compareHero(origEnv, migEnv): Issue[]` — issues carry `zone: 'hero'`, category `hero`, severity Medium. Counted in page status (unlike chrome).

- [ ] **Step 1: Write the failing tests**

Create `test/compare-hero.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareHero } from '../src/compare/hero.js';

const env = (modules) => ({
  snapshot: { finalUrl: 'https://x/p', title: 't', links: [], images: [], textBlocks: [], modules },
});
const mod = (heading, imageFiles, region = 'main') => ({
  tag: 'div', className: 'c', heading, imageFiles, height: 500, region,
});

test('no hero on original (first main module has no image) → no issues, never guess', () => {
  const issues = compareHero(
    env([mod('หัวข้อ', [])]),
    env([]),
  );
  assert.deepEqual(issues, []);
});

test('hero image missing on migrated → one hero Medium', () => {
  const issues = compareHero(
    env([mod('สินเชื่อบ้าน', ['hero-home-loan.jpg'])]),
    env([mod('สินเชื่อบ้าน', [])]),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'hero');
  assert.equal(issues[0].severity, 'Medium');
  assert.equal(issues[0].zone, 'hero');
  assert.equal(issues[0].original, 'hero-home-loan.jpg');
});

test('same hero image, case-insensitive filename → no issue', () => {
  const issues = compareHero(
    env([mod('สินเชื่อบ้าน', ['Hero-Home-Loan.JPG'])]),
    env([mod('สินเชื่อบ้าน', ['hero-home-loan.jpg'])]),
  );
  assert.deepEqual(issues, []);
});

test('different hero image file → hero Medium with both filenames', () => {
  const issues = compareHero(
    env([mod('สินเชื่อบ้าน', ['hero-home-loan.jpg'])]),
    env([mod('สินเชื่อบ้าน', ['default-banner.jpg'])]),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].original, 'hero-home-loan.jpg');
  assert.equal(issues[0].migrated, 'default-banner.jpg');
});

test('hero heading differs → hero Medium', () => {
  const issues = compareHero(
    env([mod('สินเชื่อบ้านบัวหลวง', ['h.jpg'])]),
    env([mod('Home Loan', ['h.jpg'])]),
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0].description, /heading/i);
});

test('first module considered is the first main-region module', () => {
  const issues = compareHero(
    env([mod('chrome', ['logo.png'], 'header'), mod('ฮีโร่', ['hero.jpg'])]),
    env([mod('ฮีโร่', ['hero.jpg'])]),
  );
  assert.deepEqual(issues, []);
});

test('migrated missing modules entirely → hero image missing issue', () => {
  const issues = compareHero(
    env([mod('ฮีโร่', ['hero.jpg'])]),
    env([]),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].migrated, '(none)');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/compare/hero.js'`.

- [ ] **Step 3: Implement**

Create `src/compare/hero.js`:

```js
import { normalizeText } from '../lib/text-utils.js';

// Conservative hero-banner check. Only fires when the ORIGINAL clearly has a hero
// (its first main-region module carries an image) — flat original pages make hero
// detection heuristic, so when in doubt we stay silent (spec: "never guess").
// Unlike chrome issues, hero issues count toward per-page status.
export function compareHero(origEnv, migEnv) {
  const firstMain = (snap) => (snap.modules ?? []).find((m) => m.region === 'main');
  const orig = firstMain(origEnv.snapshot);
  const origImages = (orig?.imageFiles ?? []).map((f) => String(f).toLowerCase());
  if (!orig || origImages.length === 0) return [];

  const issues = [];
  const mig = firstMain(migEnv.snapshot);
  const migImages = (mig?.imageFiles ?? []).map((f) => String(f).toLowerCase());

  if (migImages.length === 0) {
    issues.push({
      category: 'hero', severity: 'Medium', zone: 'hero',
      description: 'Hero banner image missing on migrated page', location: 'hero',
      original: origImages[0], migrated: '(none)',
    });
  } else if (!origImages.some((f) => migImages.includes(f))) {
    issues.push({
      category: 'hero', severity: 'Medium', zone: 'hero',
      description: 'Hero banner image differs from original', location: 'hero',
      original: origImages[0], migrated: migImages[0],
    });
  }

  const origHeading = normalizeText(orig.heading ?? '');
  const migHeading = normalizeText(mig?.heading ?? '');
  if (mig && origHeading && migHeading && origHeading !== migHeading) {
    issues.push({
      category: 'hero', severity: 'Medium', zone: 'hero',
      description: 'Hero heading differs from original', location: 'hero',
      original: origHeading, migrated: migHeading,
    });
  }
  return issues;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compare/hero.js test/compare-hero.test.js
git commit -m "feat: conservative per-page hero banner comparator"
```

---

### Task 5: comparePair shape + run-compare log

**Files:**
- Modify: `src/compare/compare.js`
- Modify: `src/run-compare.js:31`
- Test: `test/compare-pair.test.js` (append + adjust)

**Interfaces:**
- Consumes: `compareChrome` (Task 2), `compareHero` (Task 4).
- Produces: `comparePair(origEnv, migEnv): { status, issues, chromeIssues, chromeStats }`. ALL return paths include `chromeIssues`/`chromeStats` (empty arrays on Capture Failed / Not Migrated / Retired on Original). Status is computed from `issues` only. News-Detail pages get chrome but not hero; generic pages get both.

- [ ] **Step 1: Write the failing tests**

Append to `test/compare-pair.test.js`:

```js
test('every early-return path includes empty chromeIssues and chromeStats', () => {
  for (const r of [comparePair(null, healthy()), comparePair(healthy(), notFound()), comparePair(notFound(), healthy())]) {
    assert.deepEqual(r.chromeIssues, []);
    assert.deepEqual(r.chromeStats, []);
  }
});

test('chrome issues do not affect page status', () => {
  const orig = healthy({
    snapshot: { finalUrl: 'https://x/p', title: 't', images: [], textBlocks: [], modules: [],
      links: [{ href: 'https://www.bangkokbank.com/th-TH/Gone', text: 'หายไป', region: 'footer' }] },
  });
  const r = comparePair(orig, healthy());
  assert.equal(r.status, 'Passed');
  assert.equal(r.issues.length, 0);
  assert.equal(r.chromeIssues.length, 1);
  assert.equal(r.chromeIssues[0].zone, 'footer');
  assert.equal(r.chromeStats.length, 2);
});

test('hero issues DO affect page status', () => {
  const withHero = (files) => healthy({
    snapshot: { finalUrl: 'https://x/p', title: 't', links: [], images: [], textBlocks: [],
      modules: [{ tag: 'div', className: 'c', heading: 'ฮีโร่', imageFiles: files, height: 500, region: 'main' }] },
  });
  const r = comparePair(withHero(['hero.jpg']), withHero([]));
  assert.equal(r.status, 'Failed');
  assert.equal(r.issues[0].category, 'hero');
});

test('News-Detail pages get chrome checks but never hero', () => {
  const newsUrl = 'https://prod-aem.bangkokbank.com/th/news-and-media/2026/0a1b2c3d-0000-1111-2222-333344445555';
  const withHeroAndChrome = healthy({
    requestedUrl: 'https://www.bangkokbank.com/th-TH/News-and-Media/News-Detail?id=x',
    snapshot: { finalUrl: 'https://x/p', title: 't', images: [], textBlocks: [],
      links: [{ href: 'https://www.bangkokbank.com/th-TH/Gone', text: 'หายไป', region: 'footer' }],
      modules: [{ tag: 'div', className: 'c', heading: 'ฮีโร่', imageFiles: ['hero.jpg'], height: 500, region: 'main' }] },
  });
  const mig = healthy({ snapshot: { finalUrl: newsUrl, title: 't', links: [], images: [], textBlocks: [], modules: [] } });
  const r = comparePair(withHeroAndChrome, mig);
  assert.equal(r.chromeIssues.length, 1); // chrome runs on News-Detail
  assert.equal(r.issues.filter((i) => i.category === 'hero').length, 0); // hero does not
  assert.ok(r.issues.every((i) => i.category === 'news-element')); // routed to the news comparator
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `chromeIssues` is `undefined` on every path.

- [ ] **Step 3: Implement**

In `src/compare/compare.js`, add imports:

```js
import { compareChrome } from './chrome.js';
import { compareHero } from './hero.js';
```

Add after the imports:

```js
const NO_CHROME = { chromeIssues: [], chromeStats: [] };
```

Spread `...NO_CHROME` into the three early returns (Capture Failed, migrated-404, original-404), e.g.:

```js
  if (captureIssues.length > 0) return { status: 'Capture Failed', issues: captureIssues, ...NO_CHROME };
```

Then compute chrome once and thread it through both live paths:

```js
  const chrome = compareChrome(origEnv, migEnv);

  if (isNewsDetail(origEnv, migEnv)) {
    const issues = [
      ...detectRedirects(origEnv, migEnv),
      ...compareNewsDetail(origEnv, migEnv),
    ];
    return {
      status: issues.length === 0 ? 'Passed' : 'Failed', issues,
      chromeIssues: chrome.issues, chromeStats: chrome.stats,
    };
  }

  const issues = [
    ...detectRedirects(origEnv, migEnv),
    ...compareLinks(origEnv, migEnv),
    ...compareLinkTargets(origEnv, migEnv),
    ...compareImages(origEnv, migEnv),
    ...compareText(origEnv, migEnv),
    ...compareModules(origEnv, migEnv),
    ...compareHero(origEnv, migEnv),
  ];
  return {
    status: issues.length === 0 ? 'Passed' : 'Failed', issues,
    chromeIssues: chrome.issues, chromeStats: chrome.stats,
  };
```

In `src/run-compare.js`, update the log line:

```js
  console.log(`${pair.id}: ${result.status} (${result.issues.length} issues, ${result.chromeIssues.length} chrome)`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — including the pre-existing `healthy identical pair passes with zero issues` test (`deepEqual(r.issues, [])` still holds; the shape adds keys, it doesn't change `issues`).

- [ ] **Step 5: Commit**

```bash
git add src/compare/compare.js src/run-compare.js test/compare-pair.test.js
git commit -m "feat: comparePair returns chromeIssues/chromeStats separate from page status"
```

---

### Task 6: mergeIssues passthrough

**Files:**
- Modify: `src/report/merge.js`
- Test: `test/merge.test.js` (append)

**Interfaces:**
- Consumes: `det.chromeIssues`/`det.chromeStats` (Task 5's det JSON shape).
- Produces: `mergeIssues(det, ai): { pairId, status, issues, chromeIssues, chromeStats }` — chrome fields default to `[]` for older det files (resumability: output/ may hold pre-change JSON).

- [ ] **Step 1: Write the failing tests**

Append to `test/merge.test.js`:

```js
test('mergeIssues passes chromeIssues/chromeStats through, defaulting to empty', () => {
  const chromeIssue = { category: 'menu-label', severity: 'Medium', zone: 'footer', description: 'd' };
  const merged = mergeIssues(
    { pairId: 'p', status: 'Passed', issues: [], chromeIssues: [chromeIssue], chromeStats: [{ zone: 'footer', orig: 1, mig: 1, matched: 1, missing: 0 }] },
    null,
  );
  assert.deepEqual(merged.chromeIssues, [chromeIssue]);
  assert.equal(merged.chromeStats.length, 1);

  const legacy = mergeIssues({ pairId: 'p', status: 'Passed', issues: [] }, null);
  assert.deepEqual(legacy.chromeIssues, []);
  assert.deepEqual(legacy.chromeStats, []);
});

test('AI issues still merge into page issues only, never chrome', () => {
  const merged = mergeIssues(
    { pairId: 'p', status: 'Passed', issues: [], chromeIssues: [], chromeStats: [] },
    { issues: [{ category: 'layout', severity: 'High', description: 'x', location: 'l' }] },
  );
  assert.equal(merged.status, 'Failed');
  assert.equal(merged.issues.length, 1);
  assert.deepEqual(merged.chromeIssues, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `merged.chromeIssues` undefined.

- [ ] **Step 3: Implement**

Replace `src/report/merge.js`:

```js
export function mergeIssues(det, ai) {
  const issues = [...det.issues, ...(ai?.issues ?? [])];
  const STICKY = new Set(['Capture Failed', 'Not Migrated', 'Retired on Original']);
  const status = STICKY.has(det.status)
    ? det.status
    : issues.length === 0 ? 'Passed' : 'Failed';
  return {
    pairId: det.pairId, status, issues,
    chromeIssues: det.chromeIssues ?? [],
    chromeStats: det.chromeStats ?? [],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report/merge.js test/merge.test.js
git commit -m "feat: mergeIssues preserves chromeIssues/chromeStats"
```

---

### Task 7: Labels + chrome aggregation + chrome.html renderer

**Files:**
- Modify: `src/report/labels.js`
- Create: `src/report/chrome.js`
- Test: Create `test/report-chrome.test.js`

**Interfaces:**
- Consumes: `issueKey` from `src/report/systemic.js`; `esc`, `CSS` from `src/report/html.js`; `CHROME_ZONES` from `src/compare/zones.js`; merged results (Task 6).
- Produces:
  - `ZONE_LABEL: Record<string,string>` from labels.js; `CATEGORY_LABEL` gains `menu-label`, `hero`; `T` gains chrome/hero strings (exact keys below — Task 8 and 9 use them).
  - `aggregateChrome(results): { entries: {issue, count, pageIds}[], statsByZone: Record<zone,{orig,mig,matched,missing}>, comparableCount: number }` (entries sorted by count desc then severity; statsByZone values are medians across comparable pages).
  - `renderChrome(agg): string` (full HTML document for `chrome.html`).

- [ ] **Step 1: Write the failing tests**

Create `test/report-chrome.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateChrome, renderChrome } from '../src/report/chrome.js';

const issue = (over = {}) => ({
  category: 'text-language', severity: 'High', zone: 'header-nav',
  description: 'Chrome label rendered in English instead of Thai: "ก"',
  location: 'ก', original: 'ก', migrated: 'A', ...over,
});
const result = (pairId, chromeIssues, status = 'Failed') => ({
  pairId, status, issues: [],
  chromeIssues,
  chromeStats: [
    { zone: 'header-nav', orig: 100, mig: 60, matched: 55, missing: 5 },
    { zone: 'footer', orig: 32, mig: 32, matched: 30, missing: 2 },
  ],
});

test('aggregateChrome dedups identical issues across pages and counts pages', () => {
  const agg = aggregateChrome([
    result('p1', [issue(), issue()]), // duplicate within a page counts once
    result('p2', [issue()]),
    result('p3', [issue({ original: 'ข', migrated: 'B' })]),
  ]);
  assert.equal(agg.comparableCount, 3);
  assert.equal(agg.entries.length, 2);
  assert.equal(agg.entries[0].count, 2);
  assert.deepEqual(agg.entries[0].pageIds, ['p1', 'p2']);
});

test('aggregateChrome ignores non-comparable pages', () => {
  const agg = aggregateChrome([
    result('p1', [issue()]),
    { pairId: 'p2', status: 'Capture Failed', issues: [], chromeIssues: [issue()], chromeStats: [] },
  ]);
  assert.equal(agg.comparableCount, 1);
  assert.equal(agg.entries[0].count, 1);
});

test('statsByZone reports per-zone medians', () => {
  const agg = aggregateChrome([result('p1', []), result('p2', [])]);
  assert.deepEqual(agg.statsByZone['header-nav'], { orig: 100, mig: 60, matched: 55, missing: 5 });
  assert.deepEqual(agg.statsByZone.footer, { orig: 32, mig: 32, matched: 30, missing: 2 });
});

test('renderChrome renders zone sections, stat strip, reach and example links', () => {
  const agg = aggregateChrome([result('p1', [issue()]), result('p2', [issue()])]);
  const html = renderChrome(agg);
  assert.match(html, /ส่วนหัว\/เมนูหลัก/);
  assert.match(html, /ส่วนท้าย/);
  assert.match(html, /100/); // stat strip orig count
  assert.match(html, /2 \/ 2/); // reach chip
  assert.match(html, /p1\.html/);
  assert.match(html, /ชื่อเมนูไม่ตรงกัน|ข้อความ\/ภาษา/); // category label rendered in Thai
});

test('renderChrome escapes issue values', () => {
  const agg = aggregateChrome([result('p1', [issue({ original: '<b>x</b>', migrated: 'y' })])]);
  assert.doesNotMatch(renderChrome(agg), /<b>x<\/b>/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/report/chrome.js'`.

- [ ] **Step 3: Implement labels**

In `src/report/labels.js`:

Add to `CATEGORY_LABEL`:

```js
  'menu-label': 'ชื่อเมนูไม่ตรงกัน', hero: 'แบนเนอร์หลัก',
```

Add after `REGION_LABEL`:

```js
export const ZONE_LABEL = {
  'header-nav': 'ส่วนหัว/เมนูหลัก', footer: 'ส่วนท้าย', hero: 'แบนเนอร์หลัก', main: 'เนื้อหาหลัก',
};
```

Add to `T`:

```js
  chromeTitle: 'ปัญหาโซนส่วนกลาง (Chrome)',
  chromeExplainer: 'ปัญหาในส่วนหัว เมนูหลัก และส่วนท้าย ซึ่งทุกหน้าใช้ร่วมกัน — รายงานแยกจากสถานะรายหน้า แก้ครั้งเดียวที่ระดับเทมเพลต',
  seeChrome: 'ดูรายงานโซนส่วนกลาง',
  chromeOnPageA: 'โซนส่วนกลาง (Chrome) — พบ', // "{chromeOnPageA} {N} {chromeOnPageB}"
  chromeOnPageB: 'ประเด็นบนหน้านี้ (ไม่นับรวมในสถานะ)',
  chromeSeeAll: 'ประเด็นเหล่านี้พบทั้งไซต์ — ดูภาพรวมและจำนวนหน้าที่พบได้ที่',
  heroSection: 'แบนเนอร์หลัก (Hero Banner)',
  zoneStatOrig: 'ลิงก์ในโซน: เดิม', zoneStatMig: 'ใหม่',
  zoneStatMatched: 'จับคู่ URL ได้', zoneStatMissing: 'หายไป',
  moreExamples: 'และอีก', // "{moreExamples} N หน้า"
```

Add to `TH_HEAD`:

```js
  Zone: 'โซน', 'Found on': 'พบใน (หน้า)', Examples: 'ตัวอย่างหน้า',
```

- [ ] **Step 4: Implement aggregation + renderer**

Create `src/report/chrome.js`:

```js
import { issueKey } from './systemic.js';
import { esc, CSS } from './html.js';
import { T, TH_HEAD, SEVERITY_LABEL, CATEGORY_LABEL, ZONE_LABEL } from './labels.js';
import { CHROME_ZONES } from '../compare/zones.js';

const MAX_EXAMPLE_PAGES = 5;
const SEVERITY_ORDER = ['High', 'Medium', 'Low'];
const sevRank = (s) => {
  const r = SEVERITY_ORDER.indexOf(s);
  return r === -1 ? SEVERITY_ORDER.length : r;
};
const th = (k) => TH_HEAD[k] ?? k;

const median = (xs) => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// Same dedup mechanics as aggregateIssues (systemic.js), but over chromeIssues and
// with no threshold: chrome is shared furniture, so every deduped defect is
// site-wide by construction and reported with its page reach.
export function aggregateChrome(results) {
  const comparable = results.filter((r) => r.status === 'Passed' || r.status === 'Failed');
  const keyToPages = new Map();
  const keyToIssue = new Map();
  for (const r of comparable) {
    const seen = new Set();
    for (const i of r.chromeIssues ?? []) {
      const k = issueKey(i);
      if (!keyToIssue.has(k)) keyToIssue.set(k, i);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!keyToPages.has(k)) keyToPages.set(k, new Set());
      keyToPages.get(k).add(r.pairId);
    }
  }
  const entries = [...keyToPages.entries()]
    .map(([k, pages]) => ({ issue: keyToIssue.get(k), count: pages.size, pageIds: [...pages].sort() }))
    .sort((a, b) => b.count - a.count || sevRank(a.issue.severity) - sevRank(b.issue.severity));

  const statsByZone = {};
  for (const zone of CHROME_ZONES) {
    const zs = comparable.flatMap((r) => (r.chromeStats ?? []).filter((s) => s.zone === zone));
    statsByZone[zone] = {
      orig: median(zs.map((s) => s.orig)), mig: median(zs.map((s) => s.mig)),
      matched: median(zs.map((s) => s.matched)), missing: median(zs.map((s) => s.missing)),
    };
  }
  return { entries, statsByZone, comparableCount: comparable.length };
}

const statStrip = (s) => `
<p class="zone-stats">
  <span class="chip chip-count">${T.zoneStatOrig} ${s.orig} → ${T.zoneStatMig} ${s.mig}</span>
  <span class="chip chip-count">${T.zoneStatMatched} ${s.matched}</span>
  <span class="chip ${s.missing > 0 ? 'chip-Medium' : 'chip-count'}">${T.zoneStatMissing} ${s.missing}</span>
</p>`;

const exampleLinks = (pageIds) => {
  const shown = pageIds.slice(0, MAX_EXAMPLE_PAGES)
    .map((id) => `<a href="${esc(id)}.html">${esc(id)}</a>`).join(', ');
  const rest = pageIds.length - MAX_EXAMPLE_PAGES;
  return rest > 0 ? `${shown} <span class="muted">${T.moreExamples} ${rest} หน้า</span>` : shown;
};

const zoneRows = (entries, comparableCount) => entries.map(({ issue, count, pageIds }) => `
    <tr class="sev-${esc(issue.severity)}">
      <td>${esc(CATEGORY_LABEL[issue.category] ?? issue.category)}</td>
      <td>${esc(SEVERITY_LABEL[issue.severity] ?? issue.severity)}</td>
      <td>${esc(issue.description)}</td>
      <td class="val val-orig">${esc(issue.original ?? '—')}</td>
      <td class="val val-mig">${esc(issue.migrated ?? '—')}</td>
      <td><span class="chip reach">${count} / ${comparableCount}</span></td>
      <td>${exampleLinks(pageIds)}</td>
    </tr>`).join('');

export function renderChrome(agg) {
  const sections = CHROME_ZONES.map((zone) => {
    const entries = agg.entries.filter((e) => (e.issue.zone ?? 'header-nav') === zone);
    const table = entries.length
      ? `<table><tr><th>${th('Category')}</th><th>${th('Severity')}</th><th>${th('Description')}</th><th>${th('Original')}</th><th>${th('Migrated')}</th><th>${th('Found on')}</th><th>${th('Examples')}</th></tr>${zoneRows(entries, agg.comparableCount)}</table>`
      : `<p class="muted">ไม่พบปัญหาในโซนนี้</p>`;
    return `<h2>${esc(ZONE_LABEL[zone] ?? zone)}</h2>${statStrip(agg.statsByZone[zone] ?? { orig: 0, mig: 0, matched: 0, missing: 0 })}${table}`;
  }).join('\n');

  const extraCss = '.zone-stats{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px}';
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${T.chromeTitle}</title>
<style>${CSS}${extraCss}</style></head><body>
<p><a href="index.html">${T.back}</a></p>
<h1>${T.chromeTitle} (${agg.entries.length})</h1>
<p>${T.chromeExplainer}</p>
${sections}
</body></html>`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (labels-only additions can't break existing label tests — keys are additive).

- [ ] **Step 6: Commit**

```bash
git add src/report/labels.js src/report/chrome.js test/report-chrome.test.js
git commit -m "feat: chrome aggregation and chrome.html renderer with zone stat strips"
```

---

### Task 8: Detail-page zone grouping + index/landing chrome links

**Files:**
- Modify: `src/report/html.js`
- Test: `test/html.test.js` (append)

**Interfaces:**
- Consumes: `ZONE_LABEL` and `T` chrome strings (Task 7); merged result carrying `chromeIssues` (Task 6).
- Produces:
  - `renderDetail(pair, result, own, systemicHits, shotsBase)` — unchanged signature; now reads `result.chromeIssues`, splits `own` into hero (`zone === 'hero'`) vs main sections, appends a collapsed (`<details>` WITHOUT `open`) chrome block.
  - `renderIndex(rows, systemicCount, chromeCount = 0)` — Task 9 passes the third arg.
  - `renderLanding(sheets)` — each sheet summary may carry `chromeCount` (Task 9).

- [ ] **Step 1: Write the failing tests**

Append to `test/html.test.js` (reuse that file's existing fixture helpers for `pair`; a minimal inline result object is fine):

```js
test('renderDetail groups hero issues under their own section', () => {
  const pair = { id: 'p1', originalUrl: 'https://o', migratedUrl: 'https://m', category: 'c', subCategory: 's' };
  const own = [
    { category: 'hero', severity: 'Medium', zone: 'hero', description: 'Hero banner image differs from original', location: 'hero', original: 'a.jpg', migrated: 'b.jpg' },
    { category: 'missing-module', severity: 'High', description: 'Module missing', location: 'm' },
  ];
  const html = renderDetail(pair, { status: 'Failed', issues: own, chromeIssues: [] }, own, 0);
  assert.match(html, /แบนเนอร์หลัก \(Hero Banner\) \(1\)/);
  assert.match(html, /ปัญหาเฉพาะหน้า \(1\)/); // main section excludes the hero issue
});

test('renderDetail appends a collapsed chrome block when the page has chrome issues', () => {
  const pair = { id: 'p1', originalUrl: 'https://o', migratedUrl: 'https://m', category: 'c', subCategory: 's' };
  const chromeIssues = [
    { category: 'text-language', severity: 'High', zone: 'header-nav', description: 'English label', location: 'x', original: 'ก', migrated: 'A' },
  ];
  const html = renderDetail(pair, { status: 'Passed', issues: [], chromeIssues }, [], 0);
  assert.match(html, /โซนส่วนกลาง \(Chrome\) — พบ <b>1<\/b> ประเด็นบนหน้านี้ \(ไม่นับรวมในสถานะ\)/);
  assert.match(html, /<details class="cat chrome-block">/); // collapsed: no ` open`
  assert.match(html, /ส่วนหัว\/เมนูหลัก/); // zone chip label
  assert.match(html, /chrome\.html/);
});

test('renderDetail omits the chrome block when there are no chrome issues', () => {
  const pair = { id: 'p1', originalUrl: 'https://o', migratedUrl: 'https://m', category: 'c', subCategory: 's' };
  const html = renderDetail(pair, { status: 'Passed', issues: [], chromeIssues: [] }, [], 0);
  assert.doesNotMatch(html, /chrome-block/);
});

test('renderIndex shows a chrome stat chip linking to chrome.html when chromeCount > 0', () => {
  const rows = [];
  const html = renderIndex(rows, 0, 3);
  assert.match(html, /class="stat chrome-stat" href="chrome\.html"/);
  assert.match(html, /<b>3<\/b>/);
  assert.doesNotMatch(renderIndex(rows, 0, 0), /chrome\.html/);
});

test('renderLanding shows per-sheet chrome count when present', () => {
  const html = renderLanding([{ name: 'S', slug: 's', total: 1, statusCounts: { Passed: 1 }, systemicCount: 0, chromeCount: 4 }]);
  assert.match(html, /4 ปัญหาโซนส่วนกลาง/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL on all five.

- [ ] **Step 3: Implement**

In `src/report/html.js`:

Update the labels import:

```js
import { T, TH_HEAD, SEVERITY_LABEL, STATUS_LABEL, CATEGORY_LABEL, REGION_LABEL, ZONE_LABEL } from './labels.js';
```

Add next to the other label helpers:

```js
const zoneText = (z) => ZONE_LABEL[z] ?? z;
```

Append to `CSS` (inside the template string, before the `@media` rules):

```css
  /* chrome block on detail pages — informational, not counted in page status */
  details.chrome-block{border-left:3px dashed var(--muted);background:#f7f8fb}
  details.chrome-block summary{color:var(--muted)}
  .zone-tag{background:#e7ebfb;color:#26408c}
```

Replace `renderDetail` with:

```js
export function renderDetail(pair, result, own, systemicHits, shotsBase = '../shots') {
  const ref = systemicHits > 0
    ? `<p>+${systemicHits} ${T.refA} <a href="systemic.html">${T.seeSystemic}</a></p>`
    : '';
  const heroIssues = own.filter((i) => i.zone === 'hero');
  const mainIssues = own.filter((i) => i.zone !== 'hero');
  const heroSection = heroIssues.length > 0
    ? `<h2>${T.heroSection} (${heroIssues.length})</h2>\n${groupTables(heroIssues)}`
    : '';

  const chromeIssues = result.chromeIssues ?? [];
  const chromeRows = chromeIssues.map((i) => `
    <tr class="sev-${esc(i.severity)}">
      <td>${esc(catText(i.category))}</td><td>${esc(sevText(i.severity))}</td>
      <td><span class="chip zone-tag">${esc(zoneText(i.zone))}</span></td>
      <td>${esc(i.description)}</td>
      <td class="val val-orig">${esc(i.original ?? '—')}</td>
      <td class="val val-mig">${esc(i.migrated ?? '—')}</td>
    </tr>`).join('');
  const chromeBlock = chromeIssues.length > 0 ? `
<details class="cat chrome-block">
  <summary>${T.chromeOnPageA} <b>${chromeIssues.length}</b> ${T.chromeOnPageB}</summary>
  <table><tr><th>${th('Category')}</th><th>${th('Severity')}</th><th>${th('Zone')}</th><th>${th('Description')}</th><th>${th('Original')}</th><th>${th('Migrated')}</th></tr>${chromeRows}</table>
  <p class="muted" style="padding:0 14px 12px">${T.chromeSeeAll} <a href="chrome.html">${T.seeChrome}</a></p>
</details>` : '';

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(pair.id)}</title>
<style>${CSS}</style></head><body>
<p><a href="index.html">${T.back}</a></p>
<h1>${esc(pair.id)} — <span class="${tok(result.status)}">${esc(statusText(result.status))}</span></h1>
<p>${T.original}: <a href="${esc(pair.originalUrl)}">${esc(pair.originalUrl)}</a><br>
${T.migrated}: <a href="${esc(pair.migratedUrl)}">${esc(pair.migratedUrl)}</a></p>
<div class="shots">
  <div><p class="cap">${T.original}</p><img src="${esc(shotsBase)}/${esc(pair.id)}-orig.png" alt="original"></div>
  <div><p class="cap">${T.migrated}</p><img src="${esc(shotsBase)}/${esc(pair.id)}-mig.png" alt="migrated"></div>
</div>
${heroSection}
<h2>${T.ownIssues} (${mainIssues.length})</h2>
${ref}
${groupTables(mainIssues) || `<p>${T.noOwnIssues}</p>`}
${chromeBlock}
<script>${SYNC_SCROLL}</script>
</body></html>`;
}
```

In `renderIndex`, change the signature and render the chrome entry as a highlighted stat chip in the stats row (per the approved mockup — the chrome card sits next to the status cards, visually distinct):

```js
export function renderIndex(rows, systemicCount, chromeCount = 0) {
```

Change the `statChips` const to append the chrome chip after the total:

```js
  const chromeChip = chromeCount > 0
    ? `<a class="stat chrome-stat" href="chrome.html">${T.chromeTitle} <b>${chromeCount}</b></a>`
    : '';
  const statChips = presentStatuses
    .map((s) => `<button type="button" class="stat b-${tok(s)}" data-status="${esc(s)}">${esc(statusText(s))} <b>${statusCounts[s]}</b></button>`)
    .join('') + `<span class="stat total">รวม <b>${rows.length}</b> หน้า</span>` + chromeChip;
```

And add to `CSS` (next to the other `.stat` rules):

```css
  .stat.chrome-stat{border-color:var(--accent);background:var(--accent-weak);color:var(--accent);text-decoration:none}
  .stat.chrome-stat:hover{text-decoration:underline}
```

(The index client JS only wires `.stat[data-status]` chips, so an anchor chip without `data-status` is inert to filtering — no JS change needed.)

In `renderLanding`, add after the `sysline` const:

```js
    const chromeline = s.chromeCount > 0
      ? `<p class="muted">${s.chromeCount} ปัญหาโซนส่วนกลาง</p>` : '';
```

and render it after `${sysline}`:

```js
      ${sysline}${chromeline}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS. Existing `html.test.js` detail tests keep passing — `result.chromeIssues` is optional and their fixtures don't set it.

- [ ] **Step 5: Commit**

```bash
git add src/report/html.js test/html.test.js
git commit -m "feat: zone-grouped detail pages with collapsed chrome block; chrome links on index/landing"
```

---

### Task 9: run-report wiring + criteria page

**Files:**
- Modify: `src/run-report.js`
- Modify: `src/report/criteria.js`
- Test: `test/criteria.test.js` (append)

**Interfaces:**
- Consumes: `aggregateChrome`/`renderChrome` (Task 7), `renderIndex(rows, systemicCount, chromeCount)` (Task 8), `ZONE_COVERAGE_MIN` (Task 2).
- Produces: `report/<slug>/chrome.html` and `report/<slug>/chrome.json` per sheet; sheet summaries carry `chromeCount`; criteria.html documents the new categories and threshold.

- [ ] **Step 1: Write the failing test**

Append to `test/criteria.test.js`:

```js
test('criteria page documents chrome zones, menu-label, hero and ZONE_COVERAGE_MIN', () => {
  const html = renderCriteria();
  assert.match(html, /menu-label/);
  assert.match(html, /hero/);
  assert.match(html, /ZONE_COVERAGE_MIN/);
  assert.match(html, /โซนส่วนกลาง/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — none of the four patterns present.

- [ ] **Step 3: Implement criteria.js**

Update the config import:

```js
import { IMAGE_RATIO_TOLERANCE, THAI_RATIO_DELTA, SYSTEMIC_THRESHOLD, SYSTEMIC_MIN_PAGES, MAX_LINK_CHECKS, ZONE_COVERAGE_MIN } from '../config.js';
```

Append two entries to the `CRITERIA` array:

```js
  {
    cat: 'menu-label',
    check: 'เมนู/ลิงก์ในโซนส่วนกลาง (ส่วนหัว เมนูหลัก ส่วนท้าย) ใช้ชื่อตรงกับต้นฉบับไหม',
    method: 'จับคู่ลิงก์สองฝั่งด้วย URL (แปลง /th-TH/→/th/) เฉพาะโซนส่วนกลาง แล้วเทียบข้อความลิงก์; ถ้าเดิมเป็นไทยแต่ใหม่เป็นอังกฤษ = ข้อความผิดภาษา (สูง), ถ้าชื่อต่างกันเฉย ๆ = ชื่อเมนูไม่ตรงกัน',
    threshold: `URL เดียวกันแต่ชื่อไม่ตรง; โซนที่จับคู่ได้ต่ำกว่า ${pct(ZONE_COVERAGE_MIN)} ของลิงก์ที่แปลงได้ = ปัญหาสรุประดับสูง — ปัญหาโซนส่วนกลางรายงานแยก ไม่ทำให้หน้าไม่ผ่าน`,
    sev: 'ปานกลาง / สูง',
  },
  {
    cat: 'hero',
    check: 'แบนเนอร์หลัก (hero) ของหน้ายังอยู่และเป็นรูปเดิมไหม',
    method: 'ดูโมดูลแรกของเนื้อหาหลัก — ตรวจเฉพาะเมื่อหน้าต้นฉบับมีรูปในโมดูลแรกชัดเจน (ไม่เดา); เทียบชื่อไฟล์รูปและหัวข้อของโมดูลแรก',
    threshold: 'รูป hero หาย/คนละไฟล์ หรือหัวข้อไม่ตรง = ปัญหา (นับรวมในสถานะหน้า)',
    sev: 'ปานกลาง',
  },
```

Append to `CONFIG_ROWS`:

```js
  ['ZONE_COVERAGE_MIN', pct(ZONE_COVERAGE_MIN), 'สัดส่วนลิงก์โซนส่วนกลางที่จับคู่ได้ขั้นต่ำ ก่อนออกปัญหาสรุประดับสูง'],
```

Replace the intro paragraph in `renderCriteria` (the `<p>เครื่องมือนี้เปิดหน้าเว็บ…</p>` line) with:

```html
<p>เครื่องมือนี้เปิดหน้าเว็บต้นฉบับ (www.bangkokbank.com) และหน้าที่ย้าย (prod-aem.bangkokbank.com) ด้วยเบราว์เซอร์จริง แล้วตรวจแยกตามโซนของหน้า: โซนส่วนกลาง (ส่วนหัว/เมนูหลัก และส่วนท้าย ซึ่งทุกหน้าใช้ร่วมกัน — รายงานแบบรวมทั้งไซต์ใน chrome.html ไม่นับรวมในสถานะรายหน้า), แบนเนอร์หลัก และเนื้อหาหลัก (นับรวมในสถานะรายหน้า)</p>
```

- [ ] **Step 4: Wire run-report.js**

Add the import:

```js
import { aggregateChrome, renderChrome } from './report/chrome.js';
```

Inside the per-sheet loop, after the `aggregateIssues` line, add:

```js
  const chromeAgg = aggregateChrome(group.map((e) => e.result));
```

Change the index write and add the chrome writes (chrome.json sits next to systemic.json):

```js
  fs.writeFileSync(`${dir}/index.html`, renderIndex(rows, systemic.length, chromeAgg.entries.length));
  fs.writeFileSync(`${dir}/chrome.html`, renderChrome(chromeAgg));
  fs.writeFileSync(`${dir}/chrome.json`, JSON.stringify(chromeAgg, null, 2));
```

Extend the sheet summary and log line:

```js
  sheetSummaries.push({ name, slug, total: rows.length, statusCounts, systemicCount: systemic.length, chromeCount: chromeAgg.entries.length });
```

```js
  console.log(`[${name}] ${rows.length} pages, ${systemic.length} site-wide, ${chromeAgg.entries.length} chrome → ${dir}/index.html`);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/run-report.js src/report/criteria.js test/criteria.test.js
git commit -m "feat: per-sheet chrome.html/chrome.json wiring and zone criteria docs"
```

---

### Task 10: Real-data validation + contract docs

**Files:**
- Modify: `CLAUDE.md` (contract + report-structure sections)
- Modify: `docs/superpowers/specs/2026-07-04-zone-based-checks-design.md` (status line only)
- No code changes expected — this task validates on the existing snapshots (offline; NO re-capture).

- [ ] **Step 1: Regenerate comparisons and report from existing snapshots**

Run: `node src/run-compare.js && node src/run-report.js`
Expected: per-page lines now read `… (N issues, M chrome)`; per-sheet lines read `… S site-wide, C chrome → …`. No exceptions.

- [ ] **Step 2: Verify chrome.html catches the known English-nav defect**

Run: `python3 -c "
import json, glob
for f in glob.glob('output/report/*/chrome.json'):
    agg = json.load(open(f))
    langs = [e for e in agg['entries'] if e['issue']['category'] == 'text-language']
    top = max(agg['entries'], key=lambda e: e['count'], default=None)
    print(f, '| entries:', len(agg['entries']), '| text-language:', len(langs), '| top reach:', top and (top['count'], agg['comparableCount']))
"`
Expected: each sheet shows text-language entries with reach close to `comparableCount` (the English AEM chrome is corpus-wide). If zero, debug `compareChrome` region mapping against a real snapshot pair before proceeding.

- [ ] **Step 3: Spot-check hero false positives**

Run: `python3 -c "
import json, glob
hits = []
for f in glob.glob('output/issues/det/*.json'):
    d = json.load(open(f))
    hits += [(d['pairId'], i['description']) for i in d.get('issues', []) if i.get('category') == 'hero']
print(len(hits), 'hero issues')
for h in hits[:15]: print(*h, sep=' | ')
"`
Expected: hero issues exist only on pages whose original clearly has a first-module image. Eyeball ~10 against `output/shots/<id>-orig.png` / `-mig.png`. If the FP rate looks high (> roughly half of sampled hits are bogus), STOP and report — the conservative gate may need tightening (this is the spec's flagged risk, decided with the human, not unilaterally).

- [ ] **Step 4: Browse the report**

Run: `cd output && python3 -m http.server 8000` (background) then open `http://localhost:8000/report/`.
Check: landing cards show chrome counts; sheet index links to chrome.html; chrome.html shows both zone sections with stat strips; a Failed page's detail shows hero/main grouping and the collapsed chrome block. Stop the server after.

- [ ] **Step 5: Update CLAUDE.md contracts**

In the `## Contracts` section of `CLAUDE.md`:
- Category list: append `hero | menu-label` with one-line parentheticals: `(hero = first main-region module image/heading mismatch, conservative, per-page)`, `(menu-label = chrome link matched by URL but labelled differently; chrome-zone issues live in chromeIssues, never affect page status)`.
- Issue shape line: add `zone?: header-nav|footer|hero|main` (absent = main).
- Add: `comparePair returns { status, issues, chromeIssues, chromeStats }; status from issues only. Generic link comparators are scoped to CONTENT_REGIONS (main/page-wide); chrome regions (header/nav/footer) belong to src/compare/chrome.js.`
- In `## Report structure (per-sheet)`: add `chrome.html` + `chrome.json` to the per-sheet output list.

In the spec file, change `**Status:** Draft (awaiting review)` to `**Status:** Implemented (2026-07-04)`.

- [ ] **Step 6: Full suite + commit**

Run: `npm test`
Expected: PASS.

```bash
git add CLAUDE.md docs/superpowers/specs/2026-07-04-zone-based-checks-design.md
git commit -m "docs: zone-based checks contracts (zone field, hero/menu-label, comparePair shape)"
```

---

## Post-plan notes for the executor

- `output/issues/det/*.json` from before Task 5 lack `chromeIssues` — `mergeIssues` defaults handle this, but Task 10 Step 1 regenerates them all anyway (offline, fast).
- Do NOT run `node src/run-capture.js` for any of this — no re-capture is needed and batch capture hits the WAF.
- After any report-code change, re-running `node src/run-report.js` alone is enough (pure render); re-run `run-compare` only when comparator code changed.
