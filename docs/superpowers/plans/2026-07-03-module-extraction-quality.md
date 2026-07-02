# Module Extraction Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Segment original-page main content into real content blocks even when a page has no `<main>` landmark, so the whole-page "หน้าแรกลูกค้าบุคคล" false `missing-module` disappears and real module differences are compared.

**Architecture:** `extractSnapshot`'s module segmentation becomes chrome-aware — it descends through single content wrappers while skipping `header`/`nav`/`footer` landmark subtrees (via the existing `regionOf` helper), so it reaches the real content sections instead of stopping at the page wrapper. Separately, `compareModules` stops embedding per-page px height in the issue's `original` field so repeated missing modules dedupe into one site-wide row.

**Tech Stack:** Node.js ≥ 20 (ESM), Playwright, built-in `node:test`. No new dependencies.

## Global Constraints

- `extractSnapshot` must stay self-contained (serialized into the browser via `page.evaluate` — no imports, no outer-scope references).
- Module object shape is unchanged: `{tag, className, heading, imageFiles, height, region}` with `region: 'main'` by construction.
- `regionOf(el)` (already in `snapshot.js`) returns `nav`/`header`/`footer`/`main`, nearest landmark wins, fallback `main`.
- `issueKey` (src/report/systemic.js) = `category|keyHint` if keyHint set, else `category|original|migrated` when either value is present, else `category|normalizeText(description)`. So per-page values in `original`/`migrated` break cross-page dedup.
- Issue categories/severities/statuses and the issue shape are unchanged. `missing-module` stays `High`.
- CSV output unchanged. Built-in `node:test`; `npm test` runs the suite (do NOT use `node --test test/` — it breaks on newer Node). Commit format `<type>: <description>`, no attribution footer.

## File Structure

```
src/capture/snapshot.js        # chrome-aware descent + contentChildren helper (module segmentation only)
src/compare/modules.js         # drop px height from issue `original` (dedup fix)
test/snapshot.test.js          # add no-<main> segmentation test (fresh page via setContent)
test/compare-modules.test.js   # add dedup-safe `original` assertion
docs/superpowers/specs/2026-07-02-pilot-findings.md  # record validation results (Task 3)
```

---

### Task 1: Chrome-aware descent in extractSnapshot

**Files:**
- Modify: `src/capture/snapshot.js:42-61` (the segmentation block only)
- Modify: `test/snapshot.test.js` (add one test; existing tests untouched)

**Interfaces:**
- Consumes: `regionOf(el)` (already defined in `snapshot.js`), `norm(s)` (already defined).
- Produces: `extractSnapshot().modules` — for pages without `<main>`, an array of the real content sections (chrome landmarks excluded), each `{tag, className, heading, imageFiles, height, region:'main'}`. Same shape as before; only which elements are selected changes.

- [ ] **Step 1: Add the failing no-`<main>` test to `test/snapshot.test.js`**

Add this as the LAST test in the file (it uses its own fresh page via `page.setContent`, so it does not disturb the shared `page` the other tests read):

```js
test('segments content on a page with no <main> landmark (chrome excluded)', async () => {
  const p = await browser.newPage();
  await p.setContent(`
    <div class="page">
      <header><nav><a href="https://x/ir">IR</a></nav><p>ChromeHeaderText</p></header>
      <section class="hero" style="height:200px"><h2>โปรโมชั่นเด่น</h2></section>
      <section class="products" style="height:150px"><h2>ผลิตภัณฑ์</h2></section>
      <div class="spacer" style="height:10px">x</div>
      <footer style="height:80px"><p>สงวนลิขสิทธิ์</p></footer>
    </div>
  `);
  const snap = await p.evaluate(extractSnapshot);
  await p.close();
  // body → div.page (single content wrapper, descend) → 2 real sections; header/nav/footer + 10px spacer excluded
  assert.equal(snap.modules.length, 2);
  assert.deepEqual(snap.modules.map((m) => m.heading), ['โปรโมชั่นเด่น', 'ผลิตภัณฑ์']);
  assert.ok(snap.modules.every((m) => m.region === 'main'));
});
```

- [ ] **Step 2: Run the suite to verify the new test fails**

Run: `npm test`
Expected: FAIL on the new test — the current descent goes `body → div.page` (single child), then takes **every** tall child of `div.page`, including the `<header>` and `<footer>` chrome (each with an empty `heading`). So `snap.modules` has length 3–4 with chrome entries, not the 2 content sections — `assert.equal(snap.modules.length, 2)` fails. (All other tests still pass.)

- [ ] **Step 3: Rewrite the segmentation block in `src/capture/snapshot.js`**

Replace lines 42-61 (from the `// Descend through single-child wrappers...` comment through the end of the `modules` assignment) with:

```js
  // Find the content root and its module children without relying on a <main>
  // landmark: descend through single content wrappers, skipping chrome (header/
  // nav/footer) subtrees via regionOf, until we reach the real content sections.
  const MIN_MODULE_HEIGHT = 40;
  const isTall = (el) => el.getBoundingClientRect().height > MIN_MODULE_HEIGHT;
  const contentChildren = (el) =>
    [...el.children].filter((c) => isTall(c) && regionOf(c) === 'main');

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
      .map((i) => {
        const src = i.currentSrc || i.src || '';
        return src.split('/').pop().split('?')[0].toLowerCase();
      })
      .filter(Boolean)
      .slice(0, 10),
    height: Math.round(el.getBoundingClientRect().height),
    region: 'main',
  }));
```

- [ ] **Step 4: Run the suite to verify all tests pass**

Run: `npm test`
Expected: PASS. The new no-`<main>` test passes (2 modules). The existing `<main>` test ("segmentation descends through the single wrapper to the real sections") still passes: `node` starts at `<main>`, its single content child is `div.wrapper`, `contentChildren(div.wrapper)` = `[hero, products]` (length ≥ 1) so it descends into `div.wrapper`, then stops (2 kids) → `[hero, products]`, headings `['โปรโมชั่นพิเศษ', 'Products']`.

- [ ] **Step 5: Commit**

```bash
git add src/capture/snapshot.js test/snapshot.test.js
git commit -m "feat: chrome-aware module segmentation for pages without a main landmark"
```

---

### Task 2: Drop per-page px height from the missing-module issue `original`

**Files:**
- Modify: `src/compare/modules.js:24-29` (the `missing-module` issue object)
- Modify: `test/compare-modules.test.js` (add one test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `compareModules` still returns `missing-module` issues with the same fields, but `original` no longer contains the `(~Npx)` suffix (so identical missing modules across pages share an `issueKey` and dedupe to one site-wide row). `description` keeps the height for human readability.

- [ ] **Step 1: Add the failing test to `test/compare-modules.test.js`**

Append after the existing `missing-module issue carries region "main"` test:

```js
test('missing-module original omits px height so it dedupes across pages', () => {
  const orig = env([mod('เครื่องมือคำนวณ', [], 2763)]);
  const mig = env([]);
  const issues = compareModules(orig, mig);
  assert.doesNotMatch(issues[0].original, /px/);   // original is dedup key material → no per-page height
  assert.match(issues[0].description, /px/);         // description still reports the height for humans
});
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `npm test`
Expected: FAIL — the current `original` is `"เครื่องมือคำนวณ" (~2763px)`, so `assert.doesNotMatch(..., /px/)` fails.

- [ ] **Step 3: Edit `src/compare/modules.js`**

In the `issues.push({ ... })` for `missing-module` (currently lines 24-29), change only the `original` field — drop the ` (~${mod.height}px)` suffix. Leave `description` (which has `(~${mod.height}px tall)`) unchanged:

```js
      issues.push({
        category: 'missing-module', severity: 'High',
        description: `Module not found on migrated: "${mod.heading || mod.imageFiles[0]}" (~${mod.height}px tall)`,
        location: mod.heading || mod.imageFiles[0],
        original: `"${mod.heading || mod.imageFiles[0]}"`, migrated: '(not found)', region: 'main',
      });
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `npm test`
Expected: PASS (all). The existing `flags original module missing on migrated as High` test still passes (it asserts on `description`, which is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/compare/modules.js test/compare-modules.test.js
git commit -m "fix: keep per-page px height out of missing-module original so it dedupes site-wide"
```

---

### Task 3: Re-capture the 20 pages + verify module extraction

Operational task — no new source files. Module data is DOM-derived, so the on-disk snapshots (captured before Task 1) must be re-captured before the comparison reflects the new segmentation. `output/` is gitignored.

- [ ] **Step 1: Full suite green**

Run: `npm test`
Expected: PASS (all tests from Tasks 1-2).

- [ ] **Step 2: Smoke-test one page**

Re-capture a single page and confirm the fix on real data. The existing snapshot for this page is stale; capture skips already-captured pages, so remove it first:

```bash
rm -f output/snapshots/bonds-and-debentures-orig.json output/snapshots/bonds-and-debentures-mig.json
node src/run-capture.js --only bonds-and-debentures 2>&1 | grep -E '^(ok|start|FAIL)'
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const s = JSON.parse(readFileSync('output/snapshots/bonds-and-debentures-orig.json','utf8')).snapshot;
console.log('orig modules:', s.modules.length, '(was 1)');
console.log('headings:', JSON.stringify(s.modules.map((m) => m.heading).slice(0, 8)));
console.log('has whole-page wrapper module:', s.modules.some((m) => m.heading === 'หน้าแรกลูกค้าบุคคล'));
"
```

Expected: `orig modules` > 1; `has whole-page wrapper module: false`. If it's still 1, STOP — the descent heuristic didn't handle this page's structure; note the actual DOM shape as a finding and do not hand-tune blindly.

- [ ] **Step 3: Full re-capture (paced, resumable)**

Move the remaining stale snapshots aside and re-capture all pages:

```bash
mv output/snapshots output/snapshots.pre-modseg 2>/dev/null || true
for round in 1 2 3; do
  echo "=== round $round ==="
  node src/run-capture.js 2>&1 | grep -E '^(ok|FAIL)'
  fails=$(node --input-type=module -e 'import {readdirSync,readFileSync} from "node:fs";let n=0;try{for(const f of readdirSync("output/snapshots")){if(JSON.parse(readFileSync("output/snapshots/"+f,"utf8")).error)n++}}catch{n=-1}console.log(n)')
  echo "remaining failed captures: $fails"
  [ "$fails" = "0" ] && break
  sleep 120
done
```

Expected: 40/40 captured over ≤3 rounds (headed Chrome; transient prod-aem HTTP/2 resets clear on retry). If a page persistently WAF-blocks, note it — do not fake it.

- [ ] **Step 4: Compare + report + verify the noise dropped**

```bash
node src/run-compare.js && node src/run-report.js
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const ids = readFileSync('pages.csv','utf8').trim().split('\n').slice(1).map((l) => l.split(',')[0]);
let mm = 0, pages = new Set();
for (const id of ids) {
  let d; try { d = JSON.parse(readFileSync('output/issues/det/' + id + '.json','utf8')); } catch { continue; }
  for (const i of (d.issues || [])) if (i.category === 'missing-module') { mm++; pages.add(id); }
}
console.log('missing-module issues (current set):', mm, 'across', pages.size, 'pages (was 18/18)');
"
```

Expected: the whole-page "หน้าแรกลูกค้าบุคคล" `missing-module` is gone; the missing-module count drops from 18/18 pages to near-zero. Any genuinely-repeated missing module now appears once in `output/report/systemic.html` (deduped) rather than per-page. Real per-page module differences are still reported.

- [ ] **Step 5: Record results + clean up**

Append a short "Module-segmentation verification (A1)" subsection to `docs/superpowers/specs/2026-07-02-pilot-findings.md`: before/after original module counts (e.g. bonds-and-debentures 1 → N), the missing-module tally drop, and whether any page still segments to 1 module (note as follow-up if so). Then:

```bash
rm -rf output/snapshots.pre-modseg
git add docs/superpowers/specs/2026-07-02-pilot-findings.md
git commit -m "docs: record module-segmentation verification results"
```

(The capture output itself is gitignored — commit only the findings note.)
