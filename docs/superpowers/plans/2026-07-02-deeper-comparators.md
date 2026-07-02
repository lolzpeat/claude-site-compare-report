# Deeper Comparators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag every captured element with its page region and segment main content into real blocks, so content comparators judge main content only and stop reporting shared chrome as page-specific.

**Architecture:** `extractSnapshot` gains region tagging (nearest semantic landmark) and single-child-descent module segmentation; `textBlocks` becomes `{text, region}[]`. Content comparators (text/modules/images) scope to `region==='main'`; link comparators stay page-wide. Every issue gains a `region` field, shown as a badge in the report. Requires re-capturing the 20 pages.

**Tech Stack:** Node.js ≥ 20 (ESM), Playwright, built-in `node:test`. No new dependencies.

## Global Constraints

- Region values: `header` | `nav` | `footer` | `main`. Determined by walking up from the element to the nearest landmark: `<nav>`/`[role=navigation]`→nav, `<header>`/`[role=banner]`→header, `<footer>`/`[role=contentinfo]`→footer, `<main>`/`[role=main]`→main; nearest ancestor wins; none found → `main` (fallback). (The spec listed `other`; the fallback rule maps not-in-chrome to `main`, so `other` is never emitted.)
- `textBlocks` shape: `{text: string, region: string}[]` (was `string[]`). `links` and `images` each gain a `region` string field. `modules` gain `region: 'main'` (main-only by construction).
- Module segmentation: start at `document.querySelector('main, [role=main]') || document.body`; while the node has exactly one element child, descend into it (cap 20 levels); then take that node's element children with rendered height > 40px as modules.
- Issue shape gains optional `region`: the producing element's region, or `page-wide` for whole-page/summary issues. Full shape: `{category, severity, description, location, original?, migrated?, keyHint?, region?}`.
- Content comparators (`compareText`, `compareModules`, `compareImages`) judge `region==='main'` only. `compareLinks`/`compareLinkTargets` stay page-wide. Systemic `issueKey` is unchanged (region does NOT enter the key).
- `extractSnapshot` must stay self-contained (serialized into the browser — no imports/closures).
- CSV output unchanged. Built-in node:test; `npm test` runs the suite. Commit format `<type>: <description>`, no attribution footer.

## File Structure

```
src/capture/snapshot.js        # region tagging, textBlocks shape, descent segmentation
src/compare/text.js            # main-scope + {text,region} + region on issues
src/compare/images.js          # main-scope + region on issues
src/compare/modules.js         # region on issue (modules already main-only)
src/compare/links.js           # region on issues (page-wide scope kept)
src/compare/link-targets.js    # region on issues (page-wide scope kept)
src/report/html.js             # region badge on issue rows
test/*                          # matching test updates per task
```

---

### Task 1: Region tagging + descent segmentation in extractSnapshot

**Files:**
- Modify: `src/capture/snapshot.js`
- Modify: `test/fixtures/sample.html`, `test/snapshot.test.js`

**Interfaces:**
- Produces: `extractSnapshot()` returning `{finalUrl, title, links:[{href,text,region}], images:[{src,naturalWidth,naturalHeight,renderedWidth,renderedHeight,region}], textBlocks:[{text,region}], modules:[{tag,className,heading,imageFiles,height,region}]}`.

- [ ] **Step 1: Replace the fixture `test/fixtures/sample.html`**

```html
<!doctype html>
<html><head><title>Fixture Page</title></head>
<body>
<header>
  <nav>
    <a href="/th/investor-relations">นักลงทุนสัมพันธ์</a>
  </nav>
</header>
<main>
  <div class="wrapper">
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
  </div>
</main>
<footer>
  <p>สงวนลิขสิทธิ์</p>
  <a href="/th/privacy">Privacy</a>
</footer>
</body></html>
```

- [ ] **Step 2: Rewrite `test/snapshot.test.js`**

The server/browser setup (before/after hooks serving the fixture over HTTP) stays as-is. Replace the test bodies with:

```js
test('tags links with their region; nav-inside-header is nav', async () => {
  const snap = await page.evaluate(extractSnapshot);
  const nav = snap.links.find((l) => l.href.endsWith('/th/investor-relations'));
  assert.equal(nav.region, 'nav'); // nearest landmark (nav) wins over header
  const main = snap.links.find((l) => l.href.endsWith('/th/personal/cards'));
  assert.equal(main.region, 'main');
  const foot = snap.links.find((l) => l.href.endsWith('/th/privacy'));
  assert.equal(foot.region, 'footer');
});

test('tags text blocks with region; footer text is footer, hero text is main', async () => {
  const snap = await page.evaluate(extractSnapshot);
  const hero = snap.textBlocks.find((b) => b.text === 'โปรโมชั่นพิเศษ');
  assert.equal(hero.region, 'main');
  const foot = snap.textBlocks.find((b) => b.text === 'สงวนลิขสิทธิ์');
  assert.equal(foot.region, 'footer');
});

test('tags images with region', async () => {
  const snap = await page.evaluate(extractSnapshot);
  const img = snap.images.find((i) => i.src.includes('hero-banner.jpg'));
  assert.ok(img);
  assert.equal(img.region, 'main');
  assert.equal(img.renderedWidth, 400);
});

test('segmentation descends through the single wrapper to the real sections', async () => {
  const snap = await page.evaluate(extractSnapshot);
  // main has one child (div.wrapper); descent yields hero + products (10px div filtered out)
  assert.equal(snap.modules.length, 2);
  assert.deepEqual(snap.modules.map((m) => m.heading), ['โปรโมชั่นพิเศษ', 'Products']);
  assert.ok(snap.modules.every((m) => m.region === 'main'));
});

test('records finalUrl and title', async () => {
  const snap = await page.evaluate(extractSnapshot);
  assert.equal(snap.title, 'Fixture Page');
  assert.ok(snap.finalUrl.startsWith(base));
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test test/snapshot.test.js`
Expected: FAIL — `region` is undefined on links/images/textBlocks; `textBlocks` entries are strings (no `.text`); modules length is 1 (no descent).

- [ ] **Step 4: Rewrite `src/capture/snapshot.js`**

```js
// Runs INSIDE the browser page via page.evaluate(extractSnapshot).
// Must stay self-contained: no imports, no outer-scope references.
export function extractSnapshot() {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const abs = (u) => {
    try { return new URL(u, location.href).href; } catch { return null; }
  };

  // Nearest semantic landmark wins; not-in-chrome falls back to 'main'.
  const regionOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const tag = n.tagName ? n.tagName.toLowerCase() : '';
      const role = (n.getAttribute && n.getAttribute('role')) || '';
      if (tag === 'nav' || role === 'navigation') return 'nav';
      if (tag === 'header' || role === 'banner') return 'header';
      if (tag === 'footer' || role === 'contentinfo') return 'footer';
      if (tag === 'main' || role === 'main') return 'main';
    }
    return 'main';
  };

  const links = [...document.querySelectorAll('a[href]')]
    .map((a) => ({ href: abs(a.getAttribute('href')), text: norm(a.textContent).slice(0, 120), region: regionOf(a) }))
    .filter((l) => l.href && /^https?:/.test(l.href));

  const images = [...document.querySelectorAll('img')]
    .map((img) => {
      const r = img.getBoundingClientRect();
      return {
        src: abs(img.currentSrc || img.src),
        naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
        renderedWidth: Math.round(r.width), renderedHeight: Math.round(r.height),
        region: regionOf(img),
      };
    })
    .filter((i) => i.src && i.renderedWidth > 0 && i.renderedHeight > 0);

  const textBlocks = [...document.querySelectorAll('h1,h2,h3,h4,p,li')]
    .map((el) => ({ text: norm(el.textContent), region: regionOf(el) }))
    .filter((b) => b.text.length > 1);

  // Descend through single-child wrappers to the real content sections.
  let node = document.querySelector('main, [role=main]') || document.body;
  let guard = 0;
  while (node.children.length === 1 && guard++ < 20) node = node.children[0];
  const modules = [...node.children]
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
      region: 'main',
    }));

  return { finalUrl: location.href, title: document.title, links, images, textBlocks, modules };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/snapshot.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/capture/snapshot.js test/fixtures/sample.html test/snapshot.test.js
git commit -m "feat: tag snapshot elements by region and segment main content"
```

---

### Task 2: compareText — main-scope, new textBlock shape, region on issues

**Files:**
- Modify: `src/compare/text.js`, `test/compare-text.test.js`

**Interfaces:**
- Consumes: `textBlocks: {text, region}[]` (Task 1).
- Produces: `compareText` reads `.text` from main-region blocks only; issues carry `region`.

- [ ] **Step 1: Update `test/compare-text.test.js`**

Change the `env` helper so it accepts bare strings (defaulting to `region:'main'`) or `{text,region}` objects — this keeps existing string-based tests valid:

```js
const env = (blocks) => ({
  requestedUrl: 'https://x/', blocked: false, error: null, linkStatuses: {},
  snapshot: {
    finalUrl: 'https://x/', title: '', links: [], images: [],
    textBlocks: blocks.map((b) => (typeof b === 'string' ? { text: b, region: 'main' } : b)),
    modules: [],
  },
});
```

Add two tests:

```js
test('ignores chrome-region text differences (only main is compared)', () => {
  const orig = env([{ text: 'เกี่ยวกับธนาคารกรุงเทพ', region: 'header' }, 'บริการสินเชื่อบ้าน']);
  const mig = env(['บริการสินเชื่อบ้าน']);
  assert.deepEqual(compareText(orig, mig), []); // the header-only block is not main → not reported
});

test('a missing main text block carries region "main"', () => {
  const orig = env(['บริการสินเชื่อบ้าน', 'อัตราดอกเบี้ยพิเศษสำหรับลูกค้าใหม่']);
  const mig = env(['บริการสินเชื่อบ้าน']);
  const issues = compareText(orig, mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].region, 'main');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/compare-text.test.js`
Expected: FAIL — `compareText` calls `.map(normalizeText)` / `.join(' ')` on `{text,region}` objects (yielding `[object Object]`), so the chrome-ignore test still reports the header block and the region assertion finds no `region`.

- [ ] **Step 3: Rewrite `src/compare/text.js`**

```js
import { normalizeText, thaiRatio, isDynamicBlock } from '../lib/text-utils.js';
import { THAI_RATIO_DELTA } from '../config.js';

const MAX_MISSING_REPORTED = 15;
const MIN_BLOCK_LENGTH = 4;

export function compareText(origEnv, migEnv) {
  const issues = [];
  const mainText = (env) => env.snapshot.textBlocks.filter((b) => b.region === 'main').map((b) => b.text);
  const migSet = new Set(mainText(migEnv).map(normalizeText));

  const missing = [...new Set(
    mainText(origEnv)
      .map(normalizeText)
      .filter((t) => t.length >= MIN_BLOCK_LENGTH && !isDynamicBlock(t) && !migSet.has(t)),
  )];

  for (const t of missing.slice(0, MAX_MISSING_REPORTED)) {
    issues.push({
      category: 'text-language', severity: 'Medium',
      description: `Text on original not found on migrated: "${t.slice(0, 120)}"`,
      location: 'text', original: `"${t.slice(0, 120)}"`, migrated: '(not found)', region: 'main',
    });
  }
  if (missing.length > MAX_MISSING_REPORTED) {
    issues.push({
      category: 'text-language', severity: 'High',
      description: `${missing.length} original text blocks missing on migrated (first ${MAX_MISSING_REPORTED} listed)`,
      location: 'page-wide', original: `${missing.length} text blocks`, migrated: `${missing.length} missing`,
      keyHint: 'text-blocks-missing-summary', region: 'page-wide',
    });
  }

  const origRatio = thaiRatio(mainText(origEnv).join(' '));
  const migRatio = thaiRatio(mainText(migEnv).join(' '));
  if (Math.abs(origRatio - migRatio) > THAI_RATIO_DELTA) {
    issues.push({
      category: 'text-language', severity: 'High',
      description: `Thai/English balance differs: original ${(origRatio * 100).toFixed(0)}% Thai vs migrated ${(migRatio * 100).toFixed(0)}% Thai`,
      location: 'page-wide', original: `${(origRatio * 100).toFixed(0)}% Thai`, migrated: `${(migRatio * 100).toFixed(0)}% Thai`,
      region: 'page-wide',
    });
  }
  return issues;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/compare-text.test.js`
Expected: PASS (all — the existing string-based tests still pass via the `env` wrapper; the two new tests pass)

- [ ] **Step 5: Full suite + commit**

Run: `npm test`
Expected: PASS

```bash
git add src/compare/text.js test/compare-text.test.js
git commit -m "feat: scope text comparison to main region with region-tagged issues"
```

---

### Task 3: compareImages + compareModules — main-scope + region on issues

**Files:**
- Modify: `src/compare/images.js`, `src/compare/modules.js`
- Modify: `test/compare-images.test.js`, `test/compare-modules.test.js`

**Interfaces:**
- Consumes: `images:[{…,region}]`, `modules:[{…,region:'main'}]` (Task 1).
- Produces: image comparison judges main images only; both comparators' issues carry `region`.

- [ ] **Step 1: Update the image test helper + add tests in `test/compare-images.test.js`**

Give the `img(...)` helper a trailing `region='main'` param so existing calls default to main:

```js
const img = (src, nw, nh, rw, rh, region = 'main') =>
  ({ src, naturalWidth: nw, naturalHeight: nh, renderedWidth: rw, renderedHeight: rh, region });
```

Add:

```js
test('ignores non-main images (header/footer logos are not compared)', () => {
  // 4 chrome logos + 1 main hero on original, only the hero on migrated. Without the
  // region filter the image-count check (mig < orig-2) fires; with it, both sides are
  // one main image → no issue. This makes the test a valid RED before the fix.
  const orig = env([
    img('https://x/l1.png', 100, 40, 100, 40, 'header'),
    img('https://x/l2.png', 100, 40, 100, 40, 'header'),
    img('https://x/l3.png', 100, 40, 100, 40, 'footer'),
    img('https://x/l4.png', 100, 40, 100, 40, 'footer'),
    img('https://x/hero.jpg', 1600, 900, 800, 450, 'main'),
  ]);
  const mig = env([img('https://y/hero.jpg', 1600, 900, 800, 450, 'main')]);
  assert.deepEqual(compareImages(orig, mig), []);
});

test('image-ratio issue carries region "main"', () => {
  const orig = env([img('https://x/hero.jpg', 1600, 900, 800, 450)]);
  const mig = env([img('https://y/hero.jpg', 1600, 900, 800, 500)]);
  const issues = compareImages(orig, mig);
  assert.equal(issues[0].region, 'main');
});
```

- [ ] **Step 2: Update the module test helper + add a test in `test/compare-modules.test.js`**

Give the `mod(...)` helper a `region='main'` field (compareModules doesn't filter on it, but the shape should match production):

```js
const mod = (heading, imageFiles = [], height = 300) =>
  ({ tag: 'section', className: '', heading, imageFiles, height, region: 'main' });
```

Add:

```js
test('missing-module issue carries region "main"', () => {
  const orig = env([mod('โปรโมชั่น'), mod('เครื่องมือคำนวณ')]);
  const mig = env([mod('โปรโมชั่น')]);
  const issues = compareModules(orig, mig);
  assert.equal(issues[0].region, 'main');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test test/compare-images.test.js test/compare-modules.test.js`
Expected: FAIL — compareImages compares the header logo (no region filter) so the "ignores non-main" test reports a missing-image issue; region is undefined on both comparators' issues.

- [ ] **Step 4: Edit `src/compare/images.js`**

Scope to main and tag issues. Change the two `origImages`/`migImages` lines at the top of `compareImages`:

```js
  const origImages = origEnv.snapshot.images.filter((i) => i.region === 'main');
  const migImages = migEnv.snapshot.images.filter((i) => i.region === 'main');
```

Add `region: 'main'` to the two image-ratio issue objects (the rendered-ratio one and the distortion one) and `region: 'page-wide'` to the image-count `missing-module` issue. For example the first becomes:

```js
      issues.push({
        category: 'image-ratio', severity: 'Medium',
        description: `Rendered aspect ratio differs: original ${ro.toFixed(3)} vs migrated ${rm.toFixed(3)} (${name})`,
        location: name,
        original: `${ro.toFixed(3)}`, migrated: `${rm.toFixed(3)}`, region: 'main',
      });
```

the distortion issue likewise gains `region: 'main'`, and the count issue gains `region: 'page-wide'`.

- [ ] **Step 5: Edit `src/compare/modules.js`**

Add `region: 'main'` to the `missing-module` issue object:

```js
      issues.push({
        category: 'missing-module', severity: 'High',
        description: `Module not found on migrated: "${mod.heading || mod.imageFiles[0]}" (~${mod.height}px tall)`,
        location: mod.heading || mod.imageFiles[0],
        original: `"${mod.heading || mod.imageFiles[0]}" (~${mod.height}px)`, migrated: '(not found)', region: 'main',
      });
```

- [ ] **Step 6: Run tests + full suite**

Run: `node --test test/compare-images.test.js test/compare-modules.test.js && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/compare/images.js src/compare/modules.js test/compare-images.test.js test/compare-modules.test.js
git commit -m "feat: scope image comparison to main region; tag module/image issues"
```

---

### Task 4: compareLinks + compareLinkTargets — region on issues (page-wide scope kept)

**Files:**
- Modify: `src/compare/links.js`, `src/compare/link-targets.js`
- Modify: `test/compare-links.test.js`, `test/compare-link-targets.test.js`

**Interfaces:**
- Consumes: `links:[{href,text,region}]` (Task 1).
- Produces: link-comparison issues carry `region` (the offending link's region, or `page-wide` for summaries). Scope stays page-wide.

- [ ] **Step 1: Update link test helpers + add tests**

In `test/compare-links.test.js`, the `env(links, statuses)` helper builds link objects from the passed array; ensure link objects carry a region (default main). If the test passes plain `{href,text}` objects, map them to include region:

```js
const env = (links, statuses = {}) => ({
  requestedUrl: 'https://x/', blocked: false, error: null, linkStatuses: statuses,
  snapshot: {
    finalUrl: 'https://x/', title: '',
    links: links.map((l) => ({ region: 'main', ...l })),
    images: [], textBlocks: [], modules: [],
  },
});
```

Add:

```js
test('a broken migrated link carries the link’s region', () => {
  const mig = env([{ href: 'https://y/dead', text: 'Dead', region: 'footer' }], { 'https://y/dead': 404 });
  const issues = compareLinks(env([]), mig);
  assert.equal(issues[0].region, 'footer');
});
```

In `test/compare-link-targets.test.js`, the `env(links)` helper likewise should default region main:

```js
const env = (links) => ({
  requestedUrl: 'https://x/', blocked: false, error: null, linkStatuses: {},
  snapshot: { finalUrl: 'https://x/', title: '', links: links.map((l) => ({ region: 'main', ...l })), images: [], textBlocks: [], modules: [] },
});
```

Add:

```js
test('a link-target issue carries the original link’s region', () => {
  const orig = env([{ href: `${O}/th-TH/Investor-Relations`, text: 'นักลงทุนสัมพันธ์', region: 'nav' }]);
  const mig = env([{ href: `${M}/en/mutual-fund`, text: 'IR' }]);
  const issues = compareLinkTargets(orig, mig);
  assert.equal(issues[0].region, 'nav');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/compare-links.test.js test/compare-link-targets.test.js`
Expected: FAIL — issues have no `region`.

- [ ] **Step 3: Edit `src/compare/links.js`**

Add a `linkFor` lookup and carry region into the missing list. Replace the `textFor` helper and the broken-link loop with:

```js
  const linkFor = (url) => migEnv.snapshot.links.find((l) => l.href === url);

  for (const [url, status] of Object.entries(migEnv.linkStatuses)) {
    const ml = linkFor(url);
    const region = ml?.region ?? 'page-wide';
    if (status >= 400) {
      issues.push({
        category: 'broken-link', severity: 'High',
        description: `Link returns HTTP ${status}: ${url}`, location: ml?.text || url,
        original: '—', migrated: `${url} → HTTP ${status}`, region,
      });
    } else if (status === 0) {
      issues.push({
        category: 'broken-link', severity: 'Medium',
        description: `Link unreachable (fetch failed): ${url}`, location: ml?.text || url,
        original: '—', migrated: `${url} → unreachable`, region,
      });
    }
  }
```

Change the missing-links collection to carry region, and tag the issues:

```js
  const migTexts = new Set(
    migEnv.snapshot.links.map((l) => normalizeText(l.text).toLowerCase()).filter(Boolean),
  );
  const seen = new Set();
  const missing = [];
  for (const l of origEnv.snapshot.links) {
    const t = normalizeText(l.text);
    const key = t.toLowerCase();
    if (t && !migTexts.has(key) && !seen.has(key)) {
      seen.add(key);
      missing.push({ text: t, region: l.region ?? 'page-wide' });
    }
  }
  for (const m of missing.slice(0, MAX_MISSING_REPORTED)) {
    issues.push({
      category: 'broken-link', severity: 'Medium',
      description: `Link on original not found on migrated (matched by text): "${m.text}"`,
      location: 'page-wide', original: `"${m.text}"`, migrated: '(not found)', region: m.region,
    });
  }
  if (missing.length > MAX_MISSING_REPORTED) {
    issues.push({
      category: 'broken-link', severity: 'High',
      description: `${missing.length} original links missing on migrated (first ${MAX_MISSING_REPORTED} listed)`,
      location: 'page-wide', original: `${missing.length} original links`, migrated: `${missing.length} missing`,
      keyHint: 'orig-links-missing-summary', region: 'page-wide',
    });
  }
```

- [ ] **Step 4: Edit `src/compare/link-targets.js`**

Carry the original link's region into the missing list and tag issues. Change the collection loop and issue pushes:

```js
  const seen = new Set();
  const missing = [];
  for (const l of origEnv.snapshot.links) {
    const key = expectedKey(l.href);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!migTargets.has(key)) missing.push({ text: normalizeText(l.text), key, region: l.region ?? 'page-wide' });
  }

  for (const m of missing.slice(0, MAX_REPORTED)) {
    issues.push({
      category: 'link-target', severity: 'High',
      description: `Link "${m.text}" on original points to ${m.key} — no matching link on migrated`,
      location: m.text || 'link',
      original: `${m.key} (expected)`, migrated: 'not linked', region: m.region,
    });
  }
  if (missing.length > MAX_REPORTED) {
    issues.push({
      category: 'link-target', severity: 'High',
      description: `${missing.length} original links have no matching destination on migrated (first ${MAX_REPORTED} listed)`,
      location: 'page-wide',
      original: `${missing.length} link targets`, migrated: `${missing.length} unmatched`,
      keyHint: 'link-targets-missing-summary', region: 'page-wide',
    });
  }
```

- [ ] **Step 5: Run tests + full suite**

Run: `node --test test/compare-links.test.js test/compare-link-targets.test.js && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/compare/links.js src/compare/link-targets.js test/compare-links.test.js test/compare-link-targets.test.js
git commit -m "feat: tag link and link-target issues with region"
```

---

### Task 5: Show region in the report

**Files:**
- Modify: `src/report/html.js`, `test/html.test.js`

**Interfaces:**
- Consumes: `issue.region` (Tasks 2-4).
- Produces: each issue row shows a region badge.

- [ ] **Step 1: Add a failing test to `test/html.test.js`**

```js
test('detail rows show the issue region as a badge', () => {
  const own = [{ category: 'layout', severity: 'High', description: 'hero', location: 'hero', region: 'main' }];
  const html = renderDetail(pair, { ...result, status: 'Failed' }, own, 0);
  assert.match(html, /region-tag/);
  assert.match(html, />main</);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/html.test.js`
Expected: FAIL — no `region-tag` in output.

- [ ] **Step 3: Edit `src/report/html.js`**

Add a `.region-tag` chip style to the `CSS` string (next to the other `.chip-*` rules):

```js
  .region-tag{background:#eef;color:#334}
```

Change `issueRows` so the Location cell also renders a region badge when present:

```js
const issueRows = (items) => items.map((i) => `
    <tr class="sev-${esc(i.severity)}">
      <td>${esc(i.severity)}</td><td>${esc(i.description)}</td>
      <td class="val val-orig">${esc(i.original ?? '—')}</td>
      <td class="val val-mig">${esc(i.migrated ?? '—')}</td>
      <td>${esc(i.location)}${i.region ? ` <span class="chip region-tag">${esc(i.region)}</span>` : ''}</td>
    </tr>`).join('');
```

Scope this task to the detail-page rows (`issueRows`) only — that is what the test exercises and where per-page triage happens. The systemic table (`renderSystemic`) has its own row markup with no Location cell; adding a region badge there is deferred (systemic issues are cross-page, so a single region is less meaningful). Do not modify `renderSystemic` in this task.

- [ ] **Step 4: Run test + full suite**

Run: `node --test test/html.test.js && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/report/html.js test/html.test.js
git commit -m "feat: show issue region as a badge in the report"
```

---

### Task 6: Re-capture the 20 pages + verify

Operational task — no new source files. The on-disk snapshots predate region tagging, so they must be re-captured before the comparison reflects the new logic.

- [ ] **Step 1: Full suite green**

Run: `npm test`
Expected: PASS (all tests from Tasks 1-5).

- [ ] **Step 2: Re-capture (paced, resumable)**

The existing snapshots are stale (old shape). Move them aside and re-capture:

```bash
mv output/snapshots output/snapshots.pre-region 2>/dev/null || true
for round in 1 2 3; do
  echo "=== round $round ==="
  node src/run-capture.js 2>&1 | grep -E '^(ok|FAIL)'
  fails=$(node --input-type=module -e 'import {readdirSync,readFileSync} from "node:fs";let n=0;try{for(const f of readdirSync("output/snapshots")){if(JSON.parse(readFileSync("output/snapshots/"+f,"utf8")).error)n++}}catch{n=-1}console.log(n)')
  echo "remaining failed captures: $fails"
  [ "$fails" = "0" ] && break
  sleep 120
done
```

Expected: 40/40 captured over ≤3 rounds (headed Chrome; transient prod-aem HTTP/2 resets clear on retry, as before). If a page persistently WAF-blocks, note it — do not fake it.

- [ ] **Step 3: Compare + report**

Run: `node src/run-compare.js && node src/run-report.js`
Expected: per-page status lines. Then inspect module segmentation and region tagging on real data:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const s = JSON.parse(readFileSync('output/snapshots/bonds-and-debentures-orig.json','utf8')).snapshot;
console.log('orig modules:', s.modules.length, '(was 1 before)');
const byRegion = {}; for (const b of s.textBlocks) byRegion[b.region] = (byRegion[b.region]||0)+1;
console.log('textBlocks by region:', byRegion);
"
```

Expected: original page now shows **multiple** main modules (not 1); textBlocks split across main/nav/header/footer (chrome no longer all lumped as main content). The per-page "หน้าแรกลูกค้าบุคคล module missing" noise should be gone from the reports.

- [ ] **Step 4: Spot-check + record**

Open 2-3 detail pages (`output/report/<id>.html`) next to their screenshots. Confirm: real main-content differences are still caught; chrome differences now carry `header`/`nav`/`footer` region badges (or no longer appear as page-specific content loss). Record in `.superpowers/sdd/progress.md` (or append a "Region verification" section to `docs/superpowers/specs/2026-07-02-pilot-findings.md` and commit): before/after original module counts, region distribution, and whether chrome noise dropped. If module counts are still low on some original pages (e.g., their content isn't under a single-wrapper pattern the descent handles), note it as a follow-up — do not hand-tune the descent heuristic here without evidence.

- [ ] **Step 5: Clean up the stale snapshots**

```bash
rm -rf output/snapshots.pre-region
```

(output/ is gitignored; nothing to commit for the capture itself. Commit only the findings note if you added one.)
