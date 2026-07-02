# Site Migration Comparison Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js/Playwright pipeline that compares 10 original vs migrated Bangkok Bank page pairs and outputs an HTML report plus a sheet write-back CSV.

**Architecture:** Four stages — (1) `pages.csv` input, (2) Playwright capture producing a full-page screenshot + JSON snapshot per URL, (3) deterministic comparators diffing the two snapshots per pair, (4) AI visual review (Claude reviews screenshot pairs, writes issue JSON) merged into the final report. Each stage is a separate CLI so stages can re-run independently.

**Tech Stack:** Node.js ≥ 20 (ESM), Playwright (only runtime dependency), built-in `node:test` for tests. No frameworks; HTML report via template strings.

## Global Constraints

- Viewport: desktop only, 1440×900.
- Image aspect-ratio tolerance: 2% (`0.02`); Thai/Latin balance tolerance: 10 percentage points (`0.10`).
- Real-site capture uses `channel: 'chrome'` (system Chrome) headed, because both sites block non-browser clients (WAF). Fixture tests use bundled Chromium headless.
- Issue categories (exact strings): `image-ratio`, `missing-module`, `broken-link`, `text-language`, `layout`, `capture-failure`.
- Severities (exact strings): `High`, `Medium`, `Low`.
- Validation statuses (exact strings): `Passed`, `Failed`, `Capture Failed`.
- Output layout: `output/shots/<id>-{orig,mig}.png`, `output/snapshots/<id>-{orig,mig}.json`, `output/issues/det/<id>.json`, `output/issues/ai/<id>.json`, `output/report/index.html`, `output/report/<id>.html`, `output/sheet-update.csv`.
- Never report a failed capture as `Passed`; navigation is retried twice (`RETRIES = 2`), then marked `Capture Failed`.
- Cross-site module/image matching uses content (heading text, image filenames, document order) — never class names.
- Commit message format: `<type>: <description>` (feat/fix/test/docs/chore), no attribution footer.

## File Structure

```
site-compare-report/
├── package.json                # type:module, dep: playwright, script: test
├── pages.csv                   # 10 pilot pairs
├── src/
│   ├── config.js               # constants (viewport, tolerances, paths, retries)
│   ├── input.js                # CSV parsing → pair objects
│   ├── lib/text-utils.js       # normalizeText, thaiRatio, isDynamicBlock, filenameOf
│   ├── capture/
│   │   ├── browser.js          # launchContext()
│   │   ├── snapshot.js         # extractSnapshot() — runs inside the page
│   │   ├── page-prep.js        # preparePage(), looksBlocked()
│   │   ├── link-check.js       # checkLinks()
│   │   └── capture.js          # captureUrl() — retry loop, envelope writer
│   ├── compare/
│   │   ├── links.js            # compareLinks()
│   │   ├── images.js           # matchImages(), compareImages()
│   │   ├── text.js             # compareText()
│   │   ├── modules.js          # compareModules()
│   │   ├── redirect.js         # detectRedirects()
│   │   └── compare.js          # comparePair() — orchestrates comparators
│   ├── report/
│   │   ├── merge.js            # mergeIssues()
│   │   ├── html.js             # renderIndex(), renderDetail()
│   │   └── csv.js              # renderSheetCsv()
│   ├── run-capture.js          # CLI stage 2
│   ├── run-compare.js          # CLI stage 3
│   └── run-report.js           # CLI stage 4/5 (merge + HTML + CSV)
├── test/
│   ├── input.test.js
│   ├── text-utils.test.js
│   ├── snapshot.test.js        # Playwright fixture test
│   ├── link-check.test.js      # local http server test
│   ├── compare-links.test.js
│   ├── compare-images.test.js
│   ├── compare-text.test.js
│   ├── compare-modules.test.js
│   ├── redirect.test.js
│   ├── merge.test.js
│   ├── html.test.js
│   ├── csv.test.js
│   └── fixtures/sample.html
└── output/                     # gitignored
```

**Data shapes used throughout (defined once here):**

```js
// Pair (from input.js)
{ id: 'bonds-debentures', originalUrl: 'https://…', migratedUrl: 'https://…', category: 'Personal', subCategory: 'Save & Invest' }

// Snapshot (from snapshot.js, one per captured URL)
{
  finalUrl: 'https://…', title: 'page title',
  links:  [{ href: 'https://…', text: 'link text' }],
  images: [{ src: 'https://…', naturalWidth: 800, naturalHeight: 450, renderedWidth: 400, renderedHeight: 225 }],
  textBlocks: ['heading or paragraph text', …],
  modules: [{ tag: 'section', className: '…', heading: 'module heading', imageFiles: ['hero.jpg'], height: 480 }]
}

// Capture envelope (from capture.js, saved as output/snapshots/<id>-{orig,mig}.json)
{ requestedUrl: 'https://…', snapshot: Snapshot|null, linkStatuses: { 'https://…': 200 }, blocked: false, error: null }

// Issue (produced by every comparator and the AI review)
{ category: 'broken-link', severity: 'High', description: '…', location: '…' }

// Deterministic result (output/issues/det/<id>.json)
{ pairId: 'bonds-debentures', status: 'Failed', issues: [Issue, …] }

// AI review file (output/issues/ai/<id>.json — written by Claude, not code)
{ pairId: 'bonds-debentures', issues: [Issue, …] }
```

---

### Task 1: Scaffold, config, and CSV input parser

**Files:**
- Create: `package.json`, `src/config.js`, `src/input.js`, `pages.csv`, `test/input.test.js`

**Interfaces:**
- Produces: `parsePages(csvText) -> Pair[]` from `src/input.js`; all constants from `src/config.js` (`VIEWPORT`, `NAV_TIMEOUT_MS`, `RETRIES`, `IMAGE_RATIO_TOLERANCE`, `THAI_RATIO_DELTA`, `DIRS`).

- [ ] **Step 1: Scaffold**

```bash
npm init -y
npm pkg set type=module scripts.test="node --test test/"
npm i playwright
npx playwright install chromium
```

- [ ] **Step 2: Write `src/config.js`**

```js
export const VIEWPORT = { width: 1440, height: 900 };
export const NAV_TIMEOUT_MS = 45_000;
export const RETRIES = 2;
export const IMAGE_RATIO_TOLERANCE = 0.02;
export const THAI_RATIO_DELTA = 0.10;
export const DIRS = {
  shots: 'output/shots',
  snapshots: 'output/snapshots',
  detIssues: 'output/issues/det',
  aiIssues: 'output/issues/ai',
  report: 'output/report',
};
```

- [ ] **Step 3: Write `pages.csv`**

```csv
id,originalUrl,migratedUrl,category,subCategory
bonds-debentures,https://www.bangkokbank.com/th-TH/Personal/Save-And-Invest/Investment/Bonds-and-Debentures,https://prod-aem.bangkokbank.com/th/personal/save-and-invest/investment/bonds-and-debentures,Personal,Save & Invest
grow-club-31tips,https://www.bangkokbank.com/th-TH/Personal/Grow-Club/31Days31Tips,https://prod-aem.bangkokbank.com/th/personal/grow-club/31days31tips,Personal,Grow Club
my-family-and-me,https://www.bangkokbank.com/th-TH/Personal/My-Family-and-Me,https://prod-aem.bangkokbank.com/th/personal/my-family-and-me,Personal,My Family & Me
cards-bangkokbankm,https://www.bangkokbank.com/th-TH/Personal/Cards/BangkokBankM,https://prod-aem.bangkokbank.com/th/personal/cards/bangkokbankm,Personal,Cards
digital-ibanking-ift,https://www.bangkokbank.com/th-TH/Personal/Digital-Banking/Bualuang-iBanking/IFT,https://prod-aem.bangkokbank.com/th/personal/digital-banking/bualuang-ibanking/ift,Personal,Digital Banking
my-home,https://www.bangkokbank.com/th-TH/Personal/My-Home,https://prod-aem.bangkokbank.com/th/personal/my-home,Personal,My Home
manage-my-business,https://www.bangkokbank.com/th-TH/Business-Banking/Manage-My-Business,https://prod-aem.bangkokbank.com/th/business-banking/manage-my-business,Business Banking,Manage My Business
careers-tech-people,https://www.bangkokbank.com/th-TH/About-Us/Bangkok-Bank-Careers/Tech-People,https://prod-aem.bangkokbank.com/th/about-us/bangkok-bank-careers/tech-people,About Us,Careers
aec-investment-clinic,https://www.bangkokbank.com/th-TH/International-Banking/AEC-Connect/AEC-Investment-Clinic,https://prod-aem.bangkokbank.com/th/international-banking/aec-connect/aec-investment-clinic,International Banking,AEC Connect
news-detail-3ae3,"https://www.bangkokbank.com/th-TH/About-Us/News-and-Media/News-Detail?id=3AE3CE57-9512-436B-9F18-BA198E727E2C&tag=New",https://prod-aem.bangkokbank.com/th/about-us/news-and-media/2569/3ae3ce57-9512-436b-9f18-ba198e727e2c,About Us,News
```

- [ ] **Step 4: Write the failing test `test/input.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePages } from '../src/input.js';

test('parses simple rows', () => {
  const csv = 'id,originalUrl,migratedUrl,category,subCategory\na,https://x/1,https://y/1,Personal,Cards\n';
  assert.deepEqual(parsePages(csv), [
    { id: 'a', originalUrl: 'https://x/1', migratedUrl: 'https://y/1', category: 'Personal', subCategory: 'Cards' },
  ]);
});

test('parses quoted fields containing commas and ampersands', () => {
  const csv = 'id,originalUrl,migratedUrl,category,subCategory\nn,"https://x/p?id=1&tag=New,Old",https://y/p,About Us,News\n';
  assert.equal(parsePages(csv)[0].originalUrl, 'https://x/p?id=1&tag=New,Old');
});

test('skips blank lines', () => {
  const csv = 'id,originalUrl,migratedUrl,category,subCategory\n\na,https://x,https://y,C,S\n\n';
  assert.equal(parsePages(csv).length, 1);
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `node --test test/input.test.js`
Expected: FAIL — `Cannot find module '../src/input.js'`

- [ ] **Step 6: Write `src/input.js`**

```js
function parseLine(line) {
  const fields = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

export function parsePages(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const f = parseLine(line);
    const row = {};
    header.forEach((h, i) => { row[h.trim()] = (f[i] ?? '').trim(); });
    return row;
  });
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test test/input.test.js`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json pages.csv src/config.js src/input.js test/input.test.js
git commit -m "feat: scaffold project with config and pages.csv input parser"
```

---

### Task 2: Text utilities

**Files:**
- Create: `src/lib/text-utils.js`, `test/text-utils.test.js`

**Interfaces:**
- Produces: `normalizeText(s) -> string`, `thaiRatio(s) -> number (0..1)`, `isDynamicBlock(s) -> boolean`, `filenameOf(url) -> string` (lowercased basename, '' on invalid URL).

- [ ] **Step 1: Write the failing test `test/text-utils.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, thaiRatio, isDynamicBlock, filenameOf } from '../src/lib/text-utils.js';

test('normalizeText collapses whitespace', () => {
  assert.equal(normalizeText('  สวัสดี\n\tครับ  '), 'สวัสดี ครับ');
});

test('thaiRatio is 1 for pure Thai, 0 for pure Latin, ~0.5 mixed', () => {
  assert.equal(thaiRatio('สวัสดี'), 1);
  assert.equal(thaiRatio('hello'), 0);
  const mixed = thaiRatio('สวัสดี hello!');
  assert.ok(mixed > 0.4 && mixed < 0.7);
});

test('thaiRatio is 0 for empty/no letters', () => {
  assert.equal(thaiRatio('12345 --'), 0);
});

test('isDynamicBlock flags digit-heavy and Thai-date text', () => {
  assert.equal(isDynamicBlock('31.25 30.50 29.75 28.00'), true);
  assert.equal(isDynamicBlock('15 มกราคม 2569'), true);
  assert.equal(isDynamicBlock('บริการบัญชีเงินฝากสำหรับครอบครัว'), false);
});

test('filenameOf extracts lowercase basename without query', () => {
  assert.equal(filenameOf('https://x.com/a/B/Hero-IMG.JPG?v=2'), 'hero-img.jpg');
  assert.equal(filenameOf('not a url'), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/text-utils.test.js`
Expected: FAIL — `Cannot find module '../src/lib/text-utils.js'`

- [ ] **Step 3: Write `src/lib/text-utils.js`**

```js
export function normalizeText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function thaiRatio(s) {
  const thai = (String(s).match(/[฀-๿]/g) || []).length;
  const latin = (String(s).match(/[A-Za-z]/g) || []).length;
  const total = thai + latin;
  return total === 0 ? 0 : thai / total;
}

const THAI_MONTHS =
  /(ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*\d{2,4}/;

export function isDynamicBlock(s) {
  const t = normalizeText(s);
  const digits = (t.match(/\d/g) || []).length;
  const nonSpace = t.replace(/\s/g, '').length || 1;
  if (digits / nonSpace > 0.4) return true;
  return THAI_MONTHS.test(t);
}

export function filenameOf(url) {
  try {
    const name = new URL(url).pathname.split('/').pop() || '';
    return decodeURIComponent(name).toLowerCase();
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/text-utils.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/text-utils.js test/text-utils.test.js
git commit -m "feat: add text utilities for normalization, Thai detection, dynamic blocks"
```

---

### Task 3: In-page snapshot extraction

**Files:**
- Create: `src/capture/snapshot.js`, `test/fixtures/sample.html`, `test/snapshot.test.js`

**Interfaces:**
- Produces: `extractSnapshot() -> Snapshot` — a **self-contained** function (no imports/closures; Playwright serializes its source and runs it inside the page via `page.evaluate(extractSnapshot)`).

- [ ] **Step 1: Write the fixture `test/fixtures/sample.html`**

```html
<!doctype html>
<html><head><title>Fixture Page</title></head>
<body>
<main>
  <section class="hero" style="height:200px">
    <h2>โปรโมชั่นพิเศษ</h2>
    <img src="hero-banner.jpg" width="400" height="225" alt="">
    <a href="/th/personal/cards">บัตรเครดิต</a>
  </section>
  <section class="products" style="height:150px">
    <h2>Products</h2>
    <p>รายละเอียดผลิตภัณฑ์ของเรา</p>
    <a href="https://external.example.com/x">External</a>
  </section>
  <div style="height:10px"></div>
</main>
</body></html>
```

- [ ] **Step 2: Write the failing test `test/snapshot.test.js`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { extractSnapshot } from '../src/capture/snapshot.js';

// Served over local HTTP (not file://) so relative links resolve to http:// URLs,
// which extractSnapshot's /^https?:/ filter keeps.
let server, base, browser, page;
before(async () => {
  const html = readFileSync(new URL('./fixtures/sample.html', import.meta.url));
  server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto(`${base}/`);
});
after(async () => { await browser.close(); server.close(); });

test('extracts links with absolute hrefs and text', async () => {
  const snap = await page.evaluate(extractSnapshot);
  const hrefs = snap.links.map((l) => l.href);
  assert.ok(hrefs.some((h) => h.endsWith('/th/personal/cards')));
  assert.ok(hrefs.includes('https://external.example.com/x'));
  assert.ok(snap.links.some((l) => l.text === 'บัตรเครดิต'));
});

test('extracts images with natural and rendered dimensions', async () => {
  const snap = await page.evaluate(extractSnapshot);
  const img = snap.images.find((i) => i.src.includes('hero-banner.jpg'));
  assert.ok(img);
  assert.equal(img.renderedWidth, 400);
  assert.equal(img.renderedHeight, 225);
});

test('extracts text blocks and modules with headings', async () => {
  const snap = await page.evaluate(extractSnapshot);
  assert.ok(snap.textBlocks.includes('โปรโมชั่นพิเศษ'));
  assert.ok(snap.textBlocks.includes('รายละเอียดผลิตภัณฑ์ของเรา'));
  const headings = snap.modules.map((m) => m.heading);
  assert.deepEqual(headings, ['โปรโมชั่นพิเศษ', 'Products']); // 10px div filtered out
  assert.deepEqual(snap.modules[0].imageFiles, ['hero-banner.jpg']);
});

test('records finalUrl and title', async () => {
  const snap = await page.evaluate(extractSnapshot);
  assert.equal(snap.title, 'Fixture Page');
  assert.ok(snap.finalUrl.startsWith(base));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/snapshot.test.js`
Expected: FAIL — `Cannot find module '../src/capture/snapshot.js'`

- [ ] **Step 4: Write `src/capture/snapshot.js`**

```js
// Runs INSIDE the browser page via page.evaluate(extractSnapshot).
// Must stay self-contained: no imports, no outer-scope references.
export function extractSnapshot() {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const abs = (u) => {
    try { return new URL(u, location.href).href; } catch { return null; }
  };

  const links = [...document.querySelectorAll('a[href]')]
    .map((a) => ({ href: abs(a.getAttribute('href')), text: norm(a.textContent).slice(0, 120) }))
    .filter((l) => l.href && /^https?:/.test(l.href));

  const images = [...document.querySelectorAll('img')]
    .map((img) => {
      const r = img.getBoundingClientRect();
      return {
        src: abs(img.currentSrc || img.src),
        naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
        renderedWidth: Math.round(r.width), renderedHeight: Math.round(r.height),
      };
    })
    .filter((i) => i.src && i.renderedWidth > 0 && i.renderedHeight > 0);

  const textBlocks = [...document.querySelectorAll('h1,h2,h3,h4,p,li')]
    .map((el) => norm(el.textContent))
    .filter((t) => t.length > 1);

  const root = document.querySelector('main') || document.body;
  const modules = [...root.children]
    .filter((el) => el.getBoundingClientRect().height > 40)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      className: norm(el.className && el.className.toString()).slice(0, 200),
      heading: norm(el.querySelector('h1,h2,h3,h4')?.textContent ?? ''),
      imageFiles: [...el.querySelectorAll('img')]
        .map((i) => {
          const src = i.currentSrc || i.src || '';
          return src.split('/').pop().split('?')[0].toLowerCase();
        })
        .filter(Boolean)
        .slice(0, 10),
      height: Math.round(el.getBoundingClientRect().height),
    }));

  return { finalUrl: location.href, title: document.title, links, images, textBlocks, modules };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/snapshot.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/capture/snapshot.js test/fixtures/sample.html test/snapshot.test.js
git commit -m "feat: add in-page snapshot extraction for links, images, text, modules"
```

---

### Task 4: Page prep, WAF detection, link status checker

**Files:**
- Create: `src/capture/page-prep.js`, `src/capture/link-check.js`, `test/link-check.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `preparePage(page) -> Promise<void>` (freeze animations, dismiss cookie banner, lazy-load scroll); `looksBlocked(title, bodyText) -> boolean`; `checkLinks(page, urls) -> Promise<{[url]: number}>` (HTTP status; `0` = fetch failed/CORS; runs inside the given page's origin).

- [ ] **Step 1: Write the failing test `test/link-check.test.js`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import { checkLinks } from '../src/capture/link-check.js';
import { looksBlocked } from '../src/capture/page-prep.js';

let server, base, browser, page;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/ok') { res.statusCode = 200; res.end('<html><body>ok</body></html>'); }
    else { res.statusCode = 404; res.end('nope'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto(`${base}/ok`);
});
after(async () => { await browser.close(); server.close(); });

test('reports 200 for live links and 404 for dead links', async () => {
  const statuses = await checkLinks(page, [`${base}/ok`, `${base}/missing`]);
  assert.equal(statuses[`${base}/ok`], 200);
  assert.equal(statuses[`${base}/missing`], 404);
});

test('reports 0 for unreachable hosts', async () => {
  const statuses = await checkLinks(page, ['http://127.0.0.1:1/x']);
  assert.equal(statuses['http://127.0.0.1:1/x'], 0);
});

test('looksBlocked detects WAF challenge pages', () => {
  assert.equal(looksBlocked('Access Denied', 'You don\'t have permission'), true);
  assert.equal(looksBlocked('Pardon Our Interruption', '…'), true);
  assert.equal(looksBlocked('ธนาคารกรุงเทพ', 'บริการทางการเงิน'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/link-check.test.js`
Expected: FAIL — `Cannot find module '../src/capture/link-check.js'`

- [ ] **Step 3: Write `src/capture/link-check.js`**

```js
// Checks link statuses from INSIDE the page (same-origin fetch passes the WAF).
// Only pass same-origin URLs; cross-origin fetches return 0 (CORS) by design.
export async function checkLinks(page, urls) {
  return page.evaluate(async (list) => {
    const out = {};
    const BATCH = 5;
    for (let i = 0; i < list.length; i += BATCH) {
      await Promise.all(
        list.slice(i, i + BATCH).map(async (u) => {
          try {
            let res = await fetch(u, { method: 'HEAD', redirect: 'follow' });
            if (res.status === 405 || res.status === 501) {
              res = await fetch(u, { method: 'GET', redirect: 'follow' });
            }
            out[u] = res.status;
          } catch {
            out[u] = 0;
          }
        }),
      );
    }
    return out;
  }, urls);
}
```

- [ ] **Step 4: Write `src/capture/page-prep.js`**

```js
const COOKIE_SELECTORS = [
  '#onetrust-accept-btn-handler',
  'button[id*="accept" i]',
  'button[class*="cookie" i]',
  '.cookie-consent button',
];

export function looksBlocked(title, bodyText) {
  const probe = `${title} ${String(bodyText).slice(0, 500)}`;
  return /access denied|attention required|pardon our interruption|request unsuccessful|challenge-platform|you don'?t have permission/i.test(probe);
}

export async function preparePage(page) {
  await page.addStyleTag({
    content: '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important;}',
  }).catch(() => {});

  for (const sel of COOKIE_SELECTORS) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      break;
    }
  }

  // Scroll through the page to trigger lazy-loaded images, then return to top.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    const max = document.body.scrollHeight;
    for (let y = 0; y <= max; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(500);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/link-check.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/capture/page-prep.js src/capture/link-check.js test/link-check.test.js
git commit -m "feat: add page preparation, WAF detection, and in-page link checker"
```

---

### Task 5: Capture orchestrator CLI + real-site smoke test

**Files:**
- Create: `src/capture/browser.js`, `src/capture/capture.js`, `src/run-capture.js`

**Interfaces:**
- Consumes: `extractSnapshot` (Task 3), `preparePage`/`looksBlocked`/`checkLinks` (Task 4), `parsePages` (Task 1), config constants.
- Produces: `launchContext() -> Promise<{browser, context}>`; `captureUrl(context, url, shotPath) -> Promise<Envelope>`; CLI `node src/run-capture.js [--only <id>]` writing `output/shots/<id>-{orig,mig}.png` and `output/snapshots/<id>-{orig,mig}.json`.

- [ ] **Step 1: Write `src/capture/browser.js`**

```js
import { chromium } from 'playwright';
import { VIEWPORT } from '../config.js';

export async function launchContext() {
  // Headed system Chrome: both sites block non-browser clients (WAF).
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'th-TH' });
  return { browser, context };
}
```

- [ ] **Step 2: Write `src/capture/capture.js`**

```js
import { NAV_TIMEOUT_MS, RETRIES } from '../config.js';
import { extractSnapshot } from './snapshot.js';
import { preparePage, looksBlocked } from './page-prep.js';
import { checkLinks } from './link-check.js';

export async function captureUrl(context, url, shotPath) {
  let lastError = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await preparePage(page);

      const snapshot = await page.evaluate(extractSnapshot);
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
      if (looksBlocked(snapshot.title, bodyText)) throw new Error('WAF_BLOCKED');

      await page.screenshot({ path: shotPath, fullPage: true });

      const origin = new URL(snapshot.finalUrl).origin;
      const sameOrigin = [...new Set(
        snapshot.links.map((l) => l.href).filter((h) => { try { return new URL(h).origin === origin; } catch { return false; } }),
      )];
      const linkStatuses = await checkLinks(page, sameOrigin);

      await page.close();
      return { requestedUrl: url, snapshot, linkStatuses, blocked: false, error: null };
    } catch (e) {
      lastError = e;
      await page.close().catch(() => {});
    }
  }
  return {
    requestedUrl: url, snapshot: null, linkStatuses: {},
    blocked: /WAF_BLOCKED/.test(String(lastError)), error: String(lastError),
  };
}
```

- [ ] **Step 3: Write `src/run-capture.js`**

```js
import fs from 'node:fs';
import { parsePages } from './input.js';
import { DIRS } from './config.js';
import { launchContext } from './capture/browser.js';
import { captureUrl } from './capture/capture.js';

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const pairs = parsePages(fs.readFileSync('pages.csv', 'utf8')).filter((p) => !only || p.id === only);
if (pairs.length === 0) { console.error(`No pairs matched${only ? ` --only ${only}` : ''}`); process.exit(1); }

for (const dir of [DIRS.shots, DIRS.snapshots]) fs.mkdirSync(dir, { recursive: true });

const { browser, context } = await launchContext();
for (const pair of pairs) {
  for (const [side, url] of [['orig', pair.originalUrl], ['mig', pair.migratedUrl]]) {
    const snapFile = `${DIRS.snapshots}/${pair.id}-${side}.json`;
    if (fs.existsSync(snapFile) && !JSON.parse(fs.readFileSync(snapFile, 'utf8')).error) {
      console.log(`skip  ${pair.id} ${side} (already captured)`);
      continue;
    }
    console.log(`start ${pair.id} ${side} ${url}`);
    const env = await captureUrl(context, url, `${DIRS.shots}/${pair.id}-${side}.png`);
    fs.writeFileSync(snapFile, JSON.stringify(env, null, 2));
    console.log(env.error ? `FAIL  ${pair.id} ${side}: ${env.error}` : `ok    ${pair.id} ${side}`);
  }
}
await browser.close();
```

- [ ] **Step 4: Run existing tests still pass**

Run: `npm test`
Expected: PASS (all tests from Tasks 1–4)

- [ ] **Step 5: Smoke test against one real pair**

Run: `node src/run-capture.js --only bonds-debentures`
Expected: Chrome window opens, both pages load; console shows `ok bonds-debentures orig` and `ok bonds-debentures mig`; verify with:

```bash
ls -la output/shots/bonds-debentures-orig.png output/shots/bonds-debentures-mig.png
node -e "const s=require('./output/snapshots/bonds-debentures-orig.json'); console.log('links:', s.snapshot.links.length, 'images:', s.snapshot.images.length, 'modules:', s.snapshot.modules.length)"
```

Expected: both PNGs exist and are > 100 KB; counts are all > 0. If `WAF_BLOCKED` appears, STOP — report back; the spec's Chrome-extension fallback needs to be designed in before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/capture/browser.js src/capture/capture.js src/run-capture.js
git commit -m "feat: add capture orchestrator CLI with retries and resume"
```

---

### Task 6: Link comparator

**Files:**
- Create: `src/compare/links.js`, `test/compare-links.test.js`

**Interfaces:**
- Consumes: `normalizeText` (Task 2); Envelope shape (Task 5).
- Produces: `compareLinks(origEnv, migEnv) -> Issue[]`.

- [ ] **Step 1: Write the failing test `test/compare-links.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareLinks } from '../src/compare/links.js';

const env = (links, statuses = {}) => ({
  requestedUrl: 'https://x/', blocked: false, error: null,
  snapshot: { finalUrl: 'https://x/', title: '', links, images: [], textBlocks: [], modules: [] },
  linkStatuses: statuses,
});

test('flags 404 links on migrated as High broken-link', () => {
  const mig = env([{ href: 'https://y/dead', text: 'Dead' }], { 'https://y/dead': 404 });
  const issues = compareLinks(env([]), mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'broken-link');
  assert.equal(issues[0].severity, 'High');
  assert.match(issues[0].description, /404/);
});

test('flags unreachable (status 0) links as Medium', () => {
  const mig = env([{ href: 'https://y/x', text: 'X' }], { 'https://y/x': 0 });
  const issues = compareLinks(env([]), mig);
  assert.equal(issues[0].severity, 'Medium');
});

test('flags links present on original but missing on migrated, by text', () => {
  const orig = env([{ href: 'https://x/a', text: 'สมัครบัตร' }, { href: 'https://x/b', text: 'Home' }]);
  const mig = env([{ href: 'https://y/b', text: 'Home' }], { 'https://y/b': 200 });
  const issues = compareLinks(orig, mig);
  assert.equal(issues.length, 1);
  assert.match(issues[0].description, /สมัครบัตร/);
});

test('no issues when links match and are healthy', () => {
  const orig = env([{ href: 'https://x/a', text: 'Home' }]);
  const mig = env([{ href: 'https://y/a', text: 'Home' }], { 'https://y/a': 200 });
  assert.deepEqual(compareLinks(orig, mig), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/compare-links.test.js`
Expected: FAIL — `Cannot find module '../src/compare/links.js'`

- [ ] **Step 3: Write `src/compare/links.js`**

```js
import { normalizeText } from '../lib/text-utils.js';

const MAX_MISSING_REPORTED = 20;

export function compareLinks(origEnv, migEnv) {
  const issues = [];

  const textFor = (url) =>
    migEnv.snapshot.links.find((l) => l.href === url)?.text || url;

  for (const [url, status] of Object.entries(migEnv.linkStatuses)) {
    if (status >= 400) {
      issues.push({
        category: 'broken-link', severity: 'High',
        description: `Link returns HTTP ${status}: ${url}`, location: textFor(url),
      });
    } else if (status === 0) {
      issues.push({
        category: 'broken-link', severity: 'Medium',
        description: `Link unreachable (fetch failed): ${url}`, location: textFor(url),
      });
    }
  }

  const migTexts = new Set(
    migEnv.snapshot.links.map((l) => normalizeText(l.text).toLowerCase()).filter(Boolean),
  );
  const missing = [...new Set(
    origEnv.snapshot.links
      .map((l) => normalizeText(l.text))
      .filter((t) => t && !migTexts.has(t.toLowerCase())),
  )];
  for (const t of missing.slice(0, MAX_MISSING_REPORTED)) {
    issues.push({
      category: 'broken-link', severity: 'Medium',
      description: `Link on original not found on migrated (matched by text): "${t}"`,
      location: 'page-wide',
    });
  }
  if (missing.length > MAX_MISSING_REPORTED) {
    issues.push({
      category: 'broken-link', severity: 'High',
      description: `${missing.length} original links missing on migrated (first ${MAX_MISSING_REPORTED} listed)`,
      location: 'page-wide',
    });
  }
  return issues;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/compare-links.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/compare/links.js test/compare-links.test.js
git commit -m "feat: add link comparator for broken and missing links"
```

---

### Task 7: Image comparator

**Files:**
- Create: `src/compare/images.js`, `test/compare-images.test.js`

**Interfaces:**
- Consumes: `filenameOf` (Task 2), `IMAGE_RATIO_TOLERANCE` (Task 1).
- Produces: `matchImages(origImages, migImages) -> [origImage, migImage][]`; `compareImages(origEnv, migEnv) -> Issue[]`.

- [ ] **Step 1: Write the failing test `test/compare-images.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchImages, compareImages } from '../src/compare/images.js';

const img = (src, nw, nh, rw, rh) =>
  ({ src, naturalWidth: nw, naturalHeight: nh, renderedWidth: rw, renderedHeight: rh });
const env = (images) => ({
  requestedUrl: 'https://x/', blocked: false, error: null, linkStatuses: {},
  snapshot: { finalUrl: 'https://x/', title: '', links: [], images, textBlocks: [], modules: [] },
});

test('matches images by filename first, then by order', () => {
  const o = [img('https://x/a/hero.jpg', 8, 4, 8, 4), img('https://x/b/two.png', 4, 4, 4, 4)];
  const m = [img('https://y/z/other.png', 4, 4, 4, 4), img('https://y/q/HERO.jpg?v=2', 8, 4, 8, 4)];
  const pairs = matchImages(o, m);
  assert.equal(pairs.length, 2);
  const heroPair = pairs.find(([a]) => a.src.includes('hero'));
  assert.ok(heroPair[1].src.includes('HERO'));
});

test('flags rendered aspect-ratio difference beyond 2%', () => {
  const orig = env([img('https://x/hero.jpg', 1600, 900, 800, 450)]);   // 16:9
  const mig = env([img('https://y/hero.jpg', 1600, 900, 800, 500)]);    // squashed
  const issues = compareImages(orig, mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'image-ratio');
  assert.match(issues[0].description, /aspect ratio/i);
});

test('flags natural-vs-rendered distortion on migrated', () => {
  // Same rendered box on both sides (no ratio diff), but the migrated source is
  // a 1:1 image squeezed into 3:2 — distortion that is NEW on migrated.
  const orig = env([img('https://x/sq.png', 300, 200, 300, 200)]);
  const mig = env([img('https://y/sq.png', 500, 500, 300, 200)]);
  const issues = compareImages(orig, mig);
  assert.equal(issues.length, 1);
  assert.match(issues[0].description, /distort/i);
});

test('no issues for identical healthy images', () => {
  const a = env([img('https://x/h.jpg', 1600, 900, 800, 450)]);
  const b = env([img('https://y/h.jpg', 1600, 900, 800, 450)]);
  assert.deepEqual(compareImages(a, b), []);
});

test('flags significantly fewer images on migrated', () => {
  const o = env([1, 2, 3, 4, 5].map((i) => img(`https://x/${i}.jpg`, 4, 4, 4, 4)));
  const m = env([img('https://y/1.jpg', 4, 4, 4, 4)]);
  const issues = compareImages(o, m);
  assert.ok(issues.some((i) => i.category === 'missing-module' && /images/.test(i.description)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/compare-images.test.js`
Expected: FAIL — `Cannot find module '../src/compare/images.js'`

- [ ] **Step 3: Write `src/compare/images.js`**

```js
import { filenameOf } from '../lib/text-utils.js';
import { IMAGE_RATIO_TOLERANCE } from '../config.js';

export function matchImages(origImages, migImages) {
  const pairs = [];
  const usedMig = new Set();

  for (const o of origImages) {
    const key = filenameOf(o.src);
    if (!key) continue;
    const idx = migImages.findIndex((m, i) => !usedMig.has(i) && filenameOf(m.src) === key);
    if (idx !== -1) { usedMig.add(idx); pairs.push([o, migImages[idx]]); }
  }

  const restOrig = origImages.filter((o) => !pairs.some(([po]) => po === o));
  const restMig = migImages.filter((_, i) => !usedMig.has(i));
  restOrig.forEach((o, i) => { if (restMig[i]) pairs.push([o, restMig[i]]); });

  return pairs;
}

const ratio = (w, h) => (h > 0 ? w / h : 0);
const differs = (a, b) => a > 0 && b > 0 && Math.abs(a - b) / a > IMAGE_RATIO_TOLERANCE;

export function compareImages(origEnv, migEnv) {
  const issues = [];
  const origImages = origEnv.snapshot.images;
  const migImages = migEnv.snapshot.images;

  for (const [o, m] of matchImages(origImages, migImages)) {
    const name = filenameOf(m.src) || m.src;
    const ro = ratio(o.renderedWidth, o.renderedHeight);
    const rm = ratio(m.renderedWidth, m.renderedHeight);
    if (differs(ro, rm)) {
      issues.push({
        category: 'image-ratio', severity: 'Medium',
        description: `Rendered aspect ratio differs: original ${ro.toFixed(3)} vs migrated ${rm.toFixed(3)} (${name})`,
        location: name,
      });
      continue; // distortion check would double-report the same root cause
    }
    const natM = ratio(m.naturalWidth, m.naturalHeight);
    const natO = ratio(o.naturalWidth, o.naturalHeight);
    // Only flag distortion that is NEW on migrated (original renders its natural ratio, migrated doesn't).
    if (differs(natM, rm) && !differs(natO, ro)) {
      issues.push({
        category: 'image-ratio', severity: 'Medium',
        description: `Image distorted on migrated: natural ratio ${natM.toFixed(3)} vs rendered ${rm.toFixed(3)} (${name})`,
        location: name,
      });
    }
  }

  if (migImages.length < origImages.length - 2) {
    issues.push({
      category: 'missing-module', severity: 'Medium',
      description: `Migrated page renders ${migImages.length} images vs ${origImages.length} on original`,
      location: 'page-wide',
    });
  }
  return issues;
}
```

- [ ] **Step 4: Run test to verify it passes, then full suite**

Run: `node --test test/compare-images.test.js && npm test`
Expected: PASS (5 tests; full suite green)

- [ ] **Step 5: Commit**

```bash
git add src/compare/images.js test/compare-images.test.js
git commit -m "feat: add image comparator for aspect ratio and distortion"
```

---

### Task 8: Text/language comparator

**Files:**
- Create: `src/compare/text.js`, `test/compare-text.test.js`

**Interfaces:**
- Consumes: `normalizeText`, `thaiRatio`, `isDynamicBlock` (Task 2), `THAI_RATIO_DELTA` (Task 1).
- Produces: `compareText(origEnv, migEnv) -> Issue[]`.

- [ ] **Step 1: Write the failing test `test/compare-text.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareText } from '../src/compare/text.js';

const env = (textBlocks) => ({
  requestedUrl: 'https://x/', blocked: false, error: null, linkStatuses: {},
  snapshot: { finalUrl: 'https://x/', title: '', links: [], images: [], textBlocks, modules: [] },
});

test('flags original text blocks missing on migrated', () => {
  const orig = env(['บริการสินเชื่อบ้าน', 'อัตราดอกเบี้ยพิเศษสำหรับลูกค้าใหม่']);
  const mig = env(['บริการสินเชื่อบ้าน']);
  const issues = compareText(orig, mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'text-language');
  assert.match(issues[0].description, /อัตราดอกเบี้ยพิเศษ/);
});

test('ignores dynamic blocks (dates, numbers)', () => {
  const orig = env(['บริการสินเชื่อบ้าน', '15 มกราคม 2569', '31.25 30.50 29.75']);
  const mig = env(['บริการสินเชื่อบ้าน']);
  assert.deepEqual(compareText(orig, mig), []);
});

test('flags Thai/Latin balance shift beyond 10 points', () => {
  const orig = env(['บริการสินเชื่อบ้านและที่อยู่อาศัยสำหรับครอบครัวไทยทุกครัวเรือน']);
  const mig = env(['Home loan services for every Thai family and household nationwide']);
  const issues = compareText(orig, mig);
  assert.ok(issues.some((i) => /Thai\/English balance/.test(i.description) && i.severity === 'High'));
});

test('no issues for identical text', () => {
  const t = ['บริการสินเชื่อบ้าน', 'รายละเอียดเพิ่มเติม'];
  assert.deepEqual(compareText(env(t), env([...t])), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/compare-text.test.js`
Expected: FAIL — `Cannot find module '../src/compare/text.js'`

- [ ] **Step 3: Write `src/compare/text.js`**

```js
import { normalizeText, thaiRatio, isDynamicBlock } from '../lib/text-utils.js';
import { THAI_RATIO_DELTA } from '../config.js';

const MAX_MISSING_REPORTED = 15;
const MIN_BLOCK_LENGTH = 4;

export function compareText(origEnv, migEnv) {
  const issues = [];
  const migSet = new Set(migEnv.snapshot.textBlocks.map((t) => normalizeText(t)));

  const missing = [...new Set(
    origEnv.snapshot.textBlocks
      .map((t) => normalizeText(t))
      .filter((t) => t.length >= MIN_BLOCK_LENGTH && !isDynamicBlock(t) && !migSet.has(t)),
  )];

  for (const t of missing.slice(0, MAX_MISSING_REPORTED)) {
    issues.push({
      category: 'text-language', severity: 'Medium',
      description: `Text on original not found on migrated: "${t.slice(0, 120)}"`,
      location: 'text',
    });
  }
  if (missing.length > MAX_MISSING_REPORTED) {
    issues.push({
      category: 'text-language', severity: 'High',
      description: `${missing.length} original text blocks missing on migrated (first ${MAX_MISSING_REPORTED} listed)`,
      location: 'page-wide',
    });
  }

  const origRatio = thaiRatio(origEnv.snapshot.textBlocks.join(' '));
  const migRatio = thaiRatio(migEnv.snapshot.textBlocks.join(' '));
  if (Math.abs(origRatio - migRatio) > THAI_RATIO_DELTA) {
    issues.push({
      category: 'text-language', severity: 'High',
      description: `Thai/English balance differs: original ${(origRatio * 100).toFixed(0)}% Thai vs migrated ${(migRatio * 100).toFixed(0)}% Thai`,
      location: 'page-wide',
    });
  }
  return issues;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/compare-text.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/compare/text.js test/compare-text.test.js
git commit -m "feat: add text comparator for missing blocks and language balance"
```

---

### Task 9: Module comparator + redirect detector

**Files:**
- Create: `src/compare/modules.js`, `src/compare/redirect.js`, `test/compare-modules.test.js`, `test/redirect.test.js`

**Interfaces:**
- Consumes: `normalizeText` (Task 2).
- Produces: `compareModules(origEnv, migEnv) -> Issue[]`; `detectRedirects(origEnv, migEnv) -> Issue[]`.

- [ ] **Step 1: Write the failing test `test/compare-modules.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareModules } from '../src/compare/modules.js';

const mod = (heading, imageFiles = [], height = 300) =>
  ({ tag: 'section', className: '', heading, imageFiles, height });
const env = (modules) => ({
  requestedUrl: 'https://x/', blocked: false, error: null, linkStatuses: {},
  snapshot: { finalUrl: 'https://x/', title: '', links: [], images: [], textBlocks: [], modules },
});

test('flags original module missing on migrated as High', () => {
  const orig = env([mod('โปรโมชั่น'), mod('เครื่องมือคำนวณ')]);
  const mig = env([mod('โปรโมชั่น')]);
  const issues = compareModules(orig, mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'missing-module');
  assert.equal(issues[0].severity, 'High');
  assert.match(issues[0].description, /เครื่องมือคำนวณ/);
});

test('matches modules by image filename when headings differ', () => {
  const orig = env([mod('', ['hero-banner.jpg'])]);
  const mig = env([mod('New Heading', ['hero-banner.jpg'])]);
  assert.deepEqual(compareModules(orig, mig), []);
});

test('ignores small modules and modules with no identity', () => {
  const orig = env([mod('เล็ก', [], 50), mod('', [], 500)]);
  const mig = env([]);
  assert.deepEqual(compareModules(orig, mig), []);
});
```

- [ ] **Step 2: Write the failing test `test/redirect.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectRedirects } from '../src/compare/redirect.js';

const env = (requestedUrl, finalUrl) => ({
  requestedUrl, blocked: false, error: null, linkStatuses: {},
  snapshot: { finalUrl, title: '', links: [], images: [], textBlocks: [], modules: [] },
});

test('flags migrated URL landing on a different path', () => {
  const orig = env('https://x/th-TH/Personal/My-Home', 'https://x/th-TH/Personal/My-Home');
  const mig = env('https://y/th/personal/my-home', 'https://y/th/404');
  const issues = detectRedirects(orig, mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'High');
  assert.match(issues[0].description, /migrated/i);
});

test('ignores case and trailing-slash differences', () => {
  const orig = env('https://x/th-TH/Personal/My-Home', 'https://x/th-th/personal/my-home/');
  const mig = env('https://y/th/personal/my-home', 'https://y/th/personal/my-home');
  assert.deepEqual(detectRedirects(orig, mig), []);
});

test('ignores query-string differences', () => {
  const orig = env('https://x/p?id=1&tag=New', 'https://x/p?id=1');
  const mig = env('https://y/p', 'https://y/p');
  assert.deepEqual(detectRedirects(orig, mig), []);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test test/compare-modules.test.js test/redirect.test.js`
Expected: FAIL — modules not found

- [ ] **Step 4: Write `src/compare/modules.js`**

```js
import { normalizeText } from '../lib/text-utils.js';

const MIN_MODULE_HEIGHT = 80;

export function compareModules(origEnv, migEnv) {
  const issues = [];
  const migModules = migEnv.snapshot.modules;
  const migHeadings = new Set(
    migModules.map((m) => normalizeText(m.heading).toLowerCase()).filter(Boolean),
  );
  const migFiles = new Set(
    migModules.flatMap((m) => m.imageFiles.map((f) => f.toLowerCase())),
  );

  for (const mod of origEnv.snapshot.modules) {
    if (mod.height < MIN_MODULE_HEIGHT) continue;
    const heading = normalizeText(mod.heading).toLowerCase();
    const hasIdentity = Boolean(heading) || mod.imageFiles.length > 0;
    if (!hasIdentity) continue;

    const byHeading = heading && migHeadings.has(heading);
    const byImage = mod.imageFiles.some((f) => migFiles.has(f.toLowerCase()));
    if (!byHeading && !byImage) {
      issues.push({
        category: 'missing-module', severity: 'High',
        description: `Module not found on migrated: "${mod.heading || mod.imageFiles[0]}" (~${mod.height}px tall)`,
        location: mod.heading || mod.imageFiles[0],
      });
    }
  }
  return issues;
}
```

- [ ] **Step 5: Write `src/compare/redirect.js`**

```js
const normUrl = (u) => {
  const url = new URL(u);
  return (url.origin + url.pathname).replace(/\/+$/, '').toLowerCase();
};

export function detectRedirects(origEnv, migEnv) {
  const issues = [];
  for (const [side, env] of [['original', origEnv], ['migrated', migEnv]]) {
    if (!env.snapshot) continue;
    if (normUrl(env.requestedUrl) !== normUrl(env.snapshot.finalUrl)) {
      issues.push({
        category: 'broken-link', severity: 'High',
        description: `The ${side} URL redirected: requested ${env.requestedUrl} but landed on ${env.snapshot.finalUrl}`,
        location: 'page-wide',
      });
    }
  }
  return issues;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test test/compare-modules.test.js test/redirect.test.js`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add src/compare/modules.js src/compare/redirect.js test/compare-modules.test.js test/redirect.test.js
git commit -m "feat: add module comparator and redirect anomaly detector"
```

---

### Task 10: Compare orchestrator CLI

**Files:**
- Create: `src/compare/compare.js`, `src/run-compare.js`

**Interfaces:**
- Consumes: all comparators (Tasks 6–9), `parsePages` (Task 1), `DIRS` (Task 1), envelope files from Task 5.
- Produces: `comparePair(origEnv, migEnv) -> { status, issues }`; CLI `node src/run-compare.js` writing `output/issues/det/<id>.json` (`{ pairId, status, issues }`).

- [ ] **Step 1: Write `src/compare/compare.js`**

```js
import { compareLinks } from './links.js';
import { compareImages } from './images.js';
import { compareText } from './text.js';
import { compareModules } from './modules.js';
import { detectRedirects } from './redirect.js';

export function comparePair(origEnv, migEnv) {
  const captureIssues = [];
  for (const [side, env] of [['original', origEnv], ['migrated', migEnv]]) {
    if (!env || env.error || !env.snapshot) {
      captureIssues.push({
        category: 'capture-failure', severity: 'High',
        description: `Capture failed for ${side} page: ${env?.error ?? 'no snapshot file'}`,
        location: 'page-wide',
      });
    }
  }
  if (captureIssues.length > 0) return { status: 'Capture Failed', issues: captureIssues };

  const issues = [
    ...detectRedirects(origEnv, migEnv),
    ...compareLinks(origEnv, migEnv),
    ...compareImages(origEnv, migEnv),
    ...compareText(origEnv, migEnv),
    ...compareModules(origEnv, migEnv),
  ];
  return { status: issues.length === 0 ? 'Passed' : 'Failed', issues };
}
```

- [ ] **Step 2: Write `src/run-compare.js`**

```js
import fs from 'node:fs';
import { parsePages } from './input.js';
import { DIRS } from './config.js';
import { comparePair } from './compare/compare.js';

const readEnv = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);

fs.mkdirSync(DIRS.detIssues, { recursive: true });
const pairs = parsePages(fs.readFileSync('pages.csv', 'utf8'));

for (const pair of pairs) {
  const orig = readEnv(`${DIRS.snapshots}/${pair.id}-orig.json`);
  const mig = readEnv(`${DIRS.snapshots}/${pair.id}-mig.json`);
  const result = comparePair(orig, mig);
  fs.writeFileSync(
    `${DIRS.detIssues}/${pair.id}.json`,
    JSON.stringify({ pairId: pair.id, ...result }, null, 2),
  );
  console.log(`${pair.id}: ${result.status} (${result.issues.length} issues)`);
}
```

- [ ] **Step 3: Verify with the smoke-test pair from Task 5**

Run: `node src/run-compare.js`
Expected: one line per pair; `bonds-debentures: Passed|Failed (N issues)`; pairs not yet captured show `Capture Failed`. Inspect:

```bash
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('output/issues/det/bonds-debentures.json','utf8')), null, 2))" | head -40
```

Expected: valid JSON with `pairId`, `status`, `issues[]`; skim issue descriptions for obvious false-positive floods (hundreds of missing-text issues would mean extraction mismatch — investigate before proceeding).

- [ ] **Step 4: Run full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/compare/compare.js src/run-compare.js
git commit -m "feat: add compare orchestrator CLI producing per-pair issue files"
```

---

### Task 11: Issue merge (deterministic + AI review)

**Files:**
- Create: `src/report/merge.js`, `test/merge.test.js`

**Interfaces:**
- Consumes: Deterministic result and AI review file shapes (header of this plan).
- Produces: `mergeIssues(det, ai) -> { pairId, status, issues }` — `ai` may be `null`; status recomputed (`Capture Failed` sticks; else `Failed` if any issue, else `Passed`).

- [ ] **Step 1: Write the failing test `test/merge.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeIssues } from '../src/report/merge.js';

const issue = (category, description = 'd') => ({ category, severity: 'Medium', description, location: 'x' });

test('merges AI issues into deterministic result and recomputes status', () => {
  const det = { pairId: 'a', status: 'Passed', issues: [] };
  const ai = { pairId: 'a', issues: [issue('layout', 'hero misaligned')] };
  const merged = mergeIssues(det, ai);
  assert.equal(merged.status, 'Failed');
  assert.equal(merged.issues.length, 1);
});

test('null AI review leaves deterministic result unchanged', () => {
  const det = { pairId: 'a', status: 'Failed', issues: [issue('broken-link')] };
  assert.deepEqual(mergeIssues(det, null), det);
});

test('Capture Failed status is never overwritten', () => {
  const det = { pairId: 'a', status: 'Capture Failed', issues: [issue('capture-failure')] };
  const merged = mergeIssues(det, { pairId: 'a', issues: [issue('layout')] });
  assert.equal(merged.status, 'Capture Failed');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/merge.test.js`
Expected: FAIL — `Cannot find module '../src/report/merge.js'`

- [ ] **Step 3: Write `src/report/merge.js`**

```js
export function mergeIssues(det, ai) {
  const issues = [...det.issues, ...(ai?.issues ?? [])];
  const status = det.status === 'Capture Failed'
    ? 'Capture Failed'
    : issues.length === 0 ? 'Passed' : 'Failed';
  return { pairId: det.pairId, status, issues };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/merge.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/report/merge.js test/merge.test.js
git commit -m "feat: add deterministic+AI issue merge with status recompute"
```

---

### Task 12: HTML report generator

**Files:**
- Create: `src/report/html.js`, `test/html.test.js`

**Interfaces:**
- Consumes: merged result shape (Task 11), Pair shape (Task 1).
- Produces: `renderIndex(rows) -> string` where `rows = [{ pair, result }]`; `renderDetail(pair, result) -> string`. Detail pages reference screenshots at `../shots/<id>-{orig,mig}.png` (report lives in `output/report/`).

- [ ] **Step 1: Write the failing test `test/html.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderIndex, renderDetail } from '../src/report/html.js';

const pair = { id: 'my-home', originalUrl: 'https://x/o', migratedUrl: 'https://y/m', category: 'Personal', subCategory: 'My Home' };
const result = {
  pairId: 'my-home', status: 'Failed',
  issues: [{ category: 'broken-link', severity: 'High', description: 'Link returns HTTP 404: https://y/dead', location: 'สมัคร' }],
};

test('index lists each pair with status and issue counts, linking to detail', () => {
  const html = renderIndex([{ pair, result }]);
  assert.match(html, /my-home\.html/);
  assert.match(html, /Failed/);
  assert.match(html, /broken-link/);
});

test('index escapes HTML in data', () => {
  const bad = { ...pair, subCategory: '<script>x</script>' };
  const html = renderIndex([{ pair: bad, result }]);
  assert.ok(!html.includes('<script>x</script>'));
});

test('detail shows side-by-side screenshots and the issue list', () => {
  const html = renderDetail(pair, result);
  assert.match(html, /\.\.\/shots\/my-home-orig\.png/);
  assert.match(html, /\.\.\/shots\/my-home-mig\.png/);
  assert.match(html, /HTTP 404/);
  assert.match(html, /High/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/html.test.js`
Expected: FAIL — `Cannot find module '../src/report/html.js'`

- [ ] **Step 3: Write `src/report/html.js`**

```js
const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const CSS = `
  body{font-family:-apple-system,'Segoe UI',sans-serif;margin:24px;color:#111}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:14px}
  th{background:#f5f5f5}
  .Passed{color:#0a7a2f;font-weight:600}.Failed{color:#b00020;font-weight:600}
  .Capture{color:#b06a00;font-weight:600}
  .sev-High{background:#fde8e8}.sev-Medium{background:#fef3e2}.sev-Low{background:#eef}
  .shots{display:flex;gap:12px}
  .shots>div{flex:1;height:80vh;overflow-y:scroll;border:1px solid #ccc}
  .shots img{width:100%;display:block}
  .cap{font-weight:600;margin:4px 0}
`;

const SYNC_SCROLL = `
  const [a,b]=document.querySelectorAll('.shots>div');
  let lock=false;
  const sync=(src,dst)=>()=>{ if(lock)return; lock=true;
    dst.scrollTop=src.scrollTop/(src.scrollHeight-src.clientHeight||1)*(dst.scrollHeight-dst.clientHeight||0);
    requestAnimationFrame(()=>{lock=false}); };
  a.addEventListener('scroll',sync(a,b)); b.addEventListener('scroll',sync(b,a));
`;

const countsByCategory = (issues) => {
  const counts = {};
  for (const i of issues) counts[i.category] = (counts[i.category] ?? 0) + 1;
  return Object.entries(counts).map(([c, n]) => `${c}: ${n}`).join(', ') || '—';
};

export function renderIndex(rows) {
  const trs = rows.map(({ pair, result }) => `
    <tr>
      <td><a href="${esc(pair.id)}.html">${esc(pair.id)}</a></td>
      <td>${esc(pair.category)} / ${esc(pair.subCategory)}</td>
      <td class="${esc(result.status.split(' ')[0])}">${esc(result.status)}</td>
      <td>${result.issues.length}</td>
      <td>${esc(countsByCategory(result.issues))}</td>
    </tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Migration Comparison Report</title>
<style>${CSS}</style></head><body>
<h1>Migration Comparison Report</h1>
<table><tr><th>Page</th><th>Category</th><th>Status</th><th>Issues</th><th>By category</th></tr>${trs}</table>
</body></html>`;
}

export function renderDetail(pair, result) {
  const issueRows = result.issues.map((i) => `
    <tr class="sev-${esc(i.severity)}">
      <td>${esc(i.category)}</td><td>${esc(i.severity)}</td>
      <td>${esc(i.description)}</td><td>${esc(i.location)}</td>
    </tr>`).join('');
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
<h2>Issues (${result.issues.length})</h2>
<table><tr><th>Category</th><th>Severity</th><th>Description</th><th>Location</th></tr>${issueRows}</table>
<script>${SYNC_SCROLL}</script>
</body></html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/html.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/report/html.js test/html.test.js
git commit -m "feat: add HTML report generator with synced side-by-side screenshots"
```

---

### Task 13: Sheet write-back CSV + report CLI

**Files:**
- Create: `src/report/csv.js`, `src/run-report.js`, `test/csv.test.js`

**Interfaces:**
- Consumes: merged result shape (Task 11), `renderIndex`/`renderDetail` (Task 12), `mergeIssues` (Task 11), `parsePages` (Task 1).
- Produces: `renderSheetCsv(rows) -> string` (`rows = [{ pair, result }]`, columns `originalUrl,validationStatus,openIssues`); CLI `node src/run-report.js` writing `output/report/*.html` and `output/sheet-update.csv`.

- [ ] **Step 1: Write the failing test `test/csv.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSheetCsv } from '../src/report/csv.js';

const pair = { id: 'a', originalUrl: 'https://x/o?id=1&tag=New', migratedUrl: 'https://y/m', category: 'C', subCategory: 'S' };

test('renders header and one row per pair with issue summary', () => {
  const result = {
    pairId: 'a', status: 'Failed',
    issues: [
      { category: 'broken-link', severity: 'High', description: 'd', location: 'l' },
      { category: 'broken-link', severity: 'Medium', description: 'd', location: 'l' },
      { category: 'image-ratio', severity: 'Medium', description: 'd', location: 'l' },
    ],
  };
  const csv = renderSheetCsv([{ pair, result }]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'originalUrl,validationStatus,openIssues');
  assert.match(lines[1], /^"https:\/\/x\/o\?id=1&tag=New",Failed,"3 issues: 2 broken-link, 1 image-ratio"$/);
});

test('passed page has empty openIssues', () => {
  const result = { pairId: 'a', status: 'Passed', issues: [] };
  const csv = renderSheetCsv([{ pair, result }]);
  assert.match(csv.trim().split('\n')[1], /,Passed,""$/);
});

test('escapes double quotes in values', () => {
  const result = { pairId: 'a', status: 'Capture Failed', issues: [] };
  const p = { ...pair, originalUrl: 'https://x/"q"' };
  const csv = renderSheetCsv([{ pair: p, result }]);
  assert.ok(csv.includes('"https://x/""q"""'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/csv.test.js`
Expected: FAIL — `Cannot find module '../src/report/csv.js'`

- [ ] **Step 3: Write `src/report/csv.js`**

```js
const quote = (s) => `"${String(s ?? '').replaceAll('"', '""')}"`;

function summarize(issues) {
  if (issues.length === 0) return '';
  const counts = {};
  for (const i of issues) counts[i.category] = (counts[i.category] ?? 0) + 1;
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${n} ${c}`);
  return `${issues.length} issues: ${parts.join(', ')}`;
}

export function renderSheetCsv(rows) {
  const lines = ['originalUrl,validationStatus,openIssues'];
  for (const { pair, result } of rows) {
    lines.push(`${quote(pair.originalUrl)},${result.status},${quote(summarize(result.issues))}`);
  }
  return lines.join('\n') + '\n';
}
```

- [ ] **Step 4: Write `src/run-report.js`**

```js
import fs from 'node:fs';
import { parsePages } from './input.js';
import { DIRS } from './config.js';
import { mergeIssues } from './report/merge.js';
import { renderIndex, renderDetail } from './report/html.js';
import { renderSheetCsv } from './report/csv.js';

const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);

fs.mkdirSync(DIRS.report, { recursive: true });
const pairs = parsePages(fs.readFileSync('pages.csv', 'utf8'));

const rows = pairs.map((pair) => {
  const det = readJson(`${DIRS.detIssues}/${pair.id}.json`)
    ?? { pairId: pair.id, status: 'Capture Failed', issues: [{ category: 'capture-failure', severity: 'High', description: 'No comparison result found — run run-capture and run-compare first', location: 'page-wide' }] };
  const ai = readJson(`${DIRS.aiIssues}/${pair.id}.json`);
  return { pair, result: mergeIssues(det, ai) };
});

fs.writeFileSync(`${DIRS.report}/index.html`, renderIndex(rows));
for (const { pair, result } of rows) {
  fs.writeFileSync(`${DIRS.report}/${pair.id}.html`, renderDetail(pair, result));
}
fs.writeFileSync('output/sheet-update.csv', renderSheetCsv(rows));

for (const { pair, result } of rows) console.log(`${pair.id}: ${result.status} (${result.issues.length} issues)`);
console.log(`\nReport: ${DIRS.report}/index.html\nSheet CSV: output/sheet-update.csv`);
```

- [ ] **Step 5: Run test to verify it passes, then full suite**

Run: `node --test test/csv.test.js && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/report/csv.js src/run-report.js test/csv.test.js
git commit -m "feat: add sheet write-back CSV and report CLI"
```

---

### Task 14: Pilot run, AI visual review, and verification

This task is operational — run the pipeline on all 10 pairs, perform the AI review, and verify the outputs against reality. No new source files.

**Files:**
- Create: `output/issues/ai/<id>.json` (one per pair — written by Claude during review, following the AI review file shape in the header)

- [ ] **Step 1: Full capture run**

Run: `node src/run-capture.js`
Expected: 20 `ok` lines (10 pairs × 2 sides). Rerun once for any `FAIL` lines (resume skips completed captures). If a page persistently reports `WAF_BLOCKED`, mark it and report to the user; do NOT fake its result.

- [ ] **Step 2: Deterministic compare**

Run: `node src/run-compare.js`
Expected: 10 status lines. Sanity-check: if any pair reports > 50 issues, open its det JSON and inspect for comparator false-positive floods (e.g., text extraction mismatch); tune only with evidence and re-run.

- [ ] **Step 3: AI visual review (Claude, not code)**

For each pair: read `output/shots/<id>-orig.png` and `output/shots/<id>-mig.png` (with the Read tool, which renders images), compare visually for layout issues — spacing, alignment, hero cropping, font/style regressions, section order, missing visual elements not caught deterministically. Write `output/issues/ai/<id>.json`:

```json
{
  "pairId": "<id>",
  "issues": [
    { "category": "layout", "severity": "Medium", "description": "Hero banner text overlaps image on migrated; original has text below image", "location": "hero section" }
  ]
}
```

Use an empty `issues` array when the pair looks visually equivalent. Skip pairs with `Capture Failed` status.

- [ ] **Step 4: Generate the report**

Run: `node src/run-report.js && open output/report/index.html`
Expected: dashboard lists all 10 pairs with statuses; detail pages show side-by-side screenshots with synced scrolling; `output/sheet-update.csv` has 10 rows + header.

- [ ] **Step 5: Spot-check 2 pairs against reality**

Pick one `Failed` and one `Passed` pair. Open both live URLs in a browser next to the report and verify: (a) at least one reported issue is real, (b) no glaring difference is missing from the report. Record findings. If a comparator produced false positives, adjust its tolerance/logic, add a regression test reproducing the case, and re-run compare + report.

- [ ] **Step 6: Commit pilot results summary**

Write `docs/superpowers/specs/2026-07-02-pilot-findings.md`: pages run, statuses, issue counts by category, false positives found and tuning applied, recommendation for the 1,460-page scale-up.

```bash
git add docs/superpowers/specs/2026-07-02-pilot-findings.md
git commit -m "docs: record pilot run findings and scale-up recommendation"
```
