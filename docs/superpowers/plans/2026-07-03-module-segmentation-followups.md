# Module Segmentation Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `missing-module` comparator trustworthy on these pages by (a) splitting the original site's monolithic content blob into one module per section heading so its granularity matches the well-segmented migrated site, and (b) dropping shared UI icons from a module's image identity.

**Architecture:** Both changes live inside `extractSnapshot` (`src/capture/snapshot.js`), which runs in the browser via `page.evaluate` and must stay self-contained. A shared `contentImageFile` helper filters icon-sized images; a `modulesFor` splitter expands a tall, multi-heading blob into per-heading modules while leaving well-formed modules untouched. `compareModules` is unchanged. Requires a re-capture.

**Tech Stack:** Node.js ≥ 20 (ESM), Playwright, built-in `node:test`. No new dependencies.

## Global Constraints

- `extractSnapshot` must stay self-contained (serialized into the browser — no imports, no outer-scope references). Thresholds `ICON_MAX_PX` (48) and `COARSE_MODULE_MIN_HEIGHT` (1000) are inline literals inside the function, like the existing `MIN_MODULE_HEIGHT`.
- Module object shape is unchanged: `{tag, className, heading, imageFiles, height, region}` with `region: 'main'` by construction.
- Reuse the existing in-scope helpers `norm`, `regionOf`, `contentChildren` — do not redefine them.
- Change ONLY the module-construction region of `extractSnapshot` (the `contentImageFile`/`modules` area). Do NOT change links/images/textBlocks extraction, the A1 descent loop, `compareModules`, or any other file.
- `compareModules` filters modules by `height >= 80` and requires identity (non-empty `heading` or `imageFiles`) — unchanged; split sections that fall below 80px are simply not compared.
- Built-in `node:test`; run the suite with `npm test` (NOT `node --test test/` — it breaks on newer Node). Commit format `<type>: <description>`, no attribution footer.

## File Structure

```
src/capture/snapshot.js        # contentImageFile icon filter (Task 1) + modulesFor heading split (Task 2)
test/snapshot.test.js          # icon-exclusion (Task 1); split + no-over-split (Task 2)
docs/superpowers/specs/2026-07-02-pilot-findings.md  # record validation results (Task 3)
```

---

### Task 1: Exclude icon-sized images from module image identity

**Files:**
- Modify: `src/capture/snapshot.js` (add `contentImageFile` helper; use it in the `modules` `imageFiles` mapping)
- Modify: `test/snapshot.test.js` (add one test)

**Interfaces:**
- Produces: `contentImageFile(img)` — an in-`extractSnapshot` helper returning the lowercased image filename, or `null` when the image renders smaller than `ICON_MAX_PX` in either dimension (a UI icon). `modules[].imageFiles` now contains content-image filenames only.

- [ ] **Step 1: Add the failing icon-exclusion test to `test/snapshot.test.js`**

Append as a new test (its own fresh page via `browser.newPage()` + `page.setContent`, so it does not disturb the shared `page`):

```js
test('excludes icon-sized images from module imageFiles (keeps content images)', async () => {
  const p = await browser.newPage();
  await p.setContent(`
    <div class="page">
      <section class="hero" style="height:120px">
        <h2>Hero</h2>
        <img style="width:20px;height:20px" src="https://x/arrow.svg">
        <img style="width:200px;height:200px" src="https://x/photo.jpg">
      </section>
      <section class="more" style="height:120px"><h2>More</h2></section>
    </div>
  `);
  const snap = await p.evaluate(extractSnapshot);
  await p.close();
  const hero = snap.modules.find((m) => m.heading === 'Hero');
  assert.ok(hero, 'hero module present');
  assert.deepEqual(hero.imageFiles, ['photo.jpg']); // 20px arrow.svg icon excluded, 200px photo kept
});
```

- [ ] **Step 2: Run the suite to verify the new test fails**

Run: `npm test`
Expected: FAIL on the new test — the current `imageFiles` mapping has no size filter, so `hero.imageFiles` is `['arrow.svg', 'photo.jpg']`, not `['photo.jpg']`. (All other tests still pass.)

- [ ] **Step 3: Add the `contentImageFile` helper and use it in `src/capture/snapshot.js`**

Insert this helper immediately BEFORE the `const modules = contentChildren(node).map((el) => ({` line:

```js
  // A module's image identity should be content images, not shared UI icons.
  const ICON_MAX_PX = 48;
  const contentImageFile = (img) => {
    const r = img.getBoundingClientRect();
    if (Math.min(r.width, r.height) < ICON_MAX_PX) return null;
    const src = img.currentSrc || img.src || '';
    const file = src.split('/').pop().split('?')[0].toLowerCase();
    return file || null;
  };
```

Then replace the `imageFiles` property inside the `modules` map — currently:

```js
    imageFiles: [...el.querySelectorAll('img')]
      .map((i) => {
        const src = i.currentSrc || i.src || '';
        return src.split('/').pop().split('?')[0].toLowerCase();
      })
      .filter(Boolean)
      .slice(0, 10),
```

with:

```js
    imageFiles: [...el.querySelectorAll('img')].map(contentImageFile).filter(Boolean).slice(0, 10),
```

- [ ] **Step 4: Run the suite to verify all tests pass**

Run: `npm test`
Expected: PASS. The icon test passes (`['photo.jpg']`); existing tests are unaffected (their fixtures have no icon-sized images that would change identity).

- [ ] **Step 5: Commit**

```bash
git add src/capture/snapshot.js test/snapshot.test.js
git commit -m "feat: exclude icon-sized images from module image identity"
```

---

### Task 2: Split a coarse content blob into per-heading modules

**Files:**
- Modify: `src/capture/snapshot.js` (replace the `const modules = ...` construction with a `toModule` + `modulesFor` splitter)
- Modify: `test/snapshot.test.js` (add two tests)

**Interfaces:**
- Consumes: `contentChildren` (A1 descent, existing) and `contentImageFile` (Task 1).
- Produces: `modules` is now `contentChildren(node).flatMap(modulesFor)`. `modulesFor(el)` returns one module per `h2`/`h3` when `el` is a tall blob (`height >= COARSE_MODULE_MIN_HEIGHT` AND `≥2` `h2`/`h3`), else a single module (current behavior). Same module object shape.

- [ ] **Step 1: Add the failing split test + the no-over-split guard to `test/snapshot.test.js`**

Append both tests:

```js
test('splits a coarse content blob into one module per h2/h3 heading', async () => {
  const p = await browser.newPage();
  await p.setContent(`
    <div class="content" style="height:1200px">
      <h2>Section A</h2><p>aaa</p>
      <h2>Section B</h2><p>bbb</p>
    </div>
  `);
  const snap = await p.evaluate(extractSnapshot);
  await p.close();
  assert.equal(snap.modules.length, 2);
  assert.deepEqual(snap.modules.map((m) => m.heading), ['Section A', 'Section B']);
  assert.ok(snap.modules.every((m) => m.region === 'main'));
});

test('does not split a module below the coarse-height gate even with 2 headings', async () => {
  const p = await browser.newPage();
  await p.setContent(`
    <div class="page">
      <section style="height:300px"><h2>Only</h2><h3>Sub</h3><p>x</p></section>
      <section style="height:120px"><h2>Two</h2></section>
    </div>
  `);
  const snap = await p.evaluate(extractSnapshot);
  await p.close();
  const headings = snap.modules.map((m) => m.heading);
  assert.ok(headings.includes('Only'));  // 300px section stays one module...
  assert.ok(!headings.includes('Sub'));  // ...not split into Only + Sub
});
```

- [ ] **Step 2: Run the suite to verify the split test fails (the guard passes)**

Run: `npm test`
Expected: the split test FAILS — the current code descends to `body`, treats `div.content` as one module, and emits a single module `heading: 'Section A'` (length 1, not 2). The no-over-split guard PASSES already (current code never splits). All prior tests still pass.

- [ ] **Step 3: Replace the module construction in `src/capture/snapshot.js`**

Replace the entire `const modules = contentChildren(node).map((el) => ({ ... }));` assignment (the whole map, from `const modules =` through its closing `}));`) with:

```js
  const COARSE_MODULE_MIN_HEIGHT = 1000;
  const toModule = (el, heading, imgs, height) => ({
    tag: el.tagName.toLowerCase(),
    className: norm(el.className && el.className.toString()).slice(0, 200),
    heading: norm(heading),
    imageFiles: imgs.map(contentImageFile).filter(Boolean).slice(0, 10),
    height: Math.round(Math.max(0, height)),
    region: 'main',
  });

  // A monolithic content blob (tall + multiple section headings) is split into
  // one module per h2/h3 so its granularity matches a well-segmented migrated page.
  const modulesFor = (el) => {
    const rect = el.getBoundingClientRect();
    const headings = [...el.querySelectorAll('h2, h3')];
    if (rect.height >= COARSE_MODULE_MIN_HEIGHT && headings.length >= 2) {
      const sections = [];
      for (const n of el.querySelectorAll('h2, h3, img')) { // document order
        const t = n.tagName.toLowerCase();
        if (t === 'h2' || t === 'h3') sections.push({ headEl: n, heading: n.textContent, imgs: [] });
        else if (sections.length) sections[sections.length - 1].imgs.push(n);
      }
      return sections.map((s, i) => {
        const top = s.headEl.getBoundingClientRect().top;
        const nextTop = i + 1 < sections.length
          ? sections[i + 1].headEl.getBoundingClientRect().top
          : rect.bottom;
        return toModule(el, s.heading, s.imgs, nextTop - top);
      });
    }
    return [toModule(el, el.querySelector('h1,h2,h3,h4')?.textContent ?? '', [...el.querySelectorAll('img')], rect.height)];
  };

  const modules = contentChildren(node).flatMap(modulesFor);
```

(The `contentImageFile` helper added in Task 1 stays where it is and is now used by `toModule`; do not duplicate it.)

- [ ] **Step 4: Run the suite to verify all tests pass**

Run: `npm test`
Expected: PASS. Split test → 2 modules `['Section A','Section B']`. Guard → `Only` kept, no `Sub`. Existing fixtures unaffected: the `<main>` fixture and the no-`<main>` A1 test produce modules under 1000px, so `modulesFor` returns single modules exactly as before; the Task 1 icon test's `hero` is 120px → single module, `imageFiles` still `['photo.jpg']`.

- [ ] **Step 5: Commit**

```bash
git add src/capture/snapshot.js test/snapshot.test.js
git commit -m "feat: split coarse content blobs into per-heading modules"
```

---

### Task 3: Re-capture the 20 pages + verify the false positives are gone

Operational task — no new source files. Module data is DOM-derived, so on-disk snapshots must be re-captured. `output/` is gitignored.

- [ ] **Step 1: Full suite green**

Run: `npm test`
Expected: PASS (all tests from Tasks 1-2).

- [ ] **Step 2: Smoke-test one page**

```bash
rm -f output/snapshots/bonds-and-debentures-orig.json output/snapshots/bonds-and-debentures-mig.json
node src/run-capture.js --only bonds-and-debentures 2>&1 | grep -E '^(ok|start|FAIL)'
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const s = JSON.parse(readFileSync('output/snapshots/bonds-and-debentures-orig.json','utf8')).snapshot;
console.log('orig modules:', s.modules.length, '(was 2 coarse)');
console.log('headings:', JSON.stringify(s.modules.map((m) => m.heading)));
console.log('still one coarse การลงทุน blob:', s.modules.some((m) => m.heading === 'การลงทุน' && m.height > 1000));
console.log('any arrow-right.svg identity:', s.modules.some((m) => m.imageFiles.includes('arrow-right.svg')));
"
```

Expected: the original now exposes the real section headings (`จุดเด่นพันธบัตรตลาดแรก`, `พันธบัตรรัฐบาล`, `ข้อมูลเพิ่มเติม`, …) as separate modules; no single `การลงทุน` blob > 1000px; no module carries `arrow-right.svg`. If the blob is still one module, STOP and inspect the DOM (the split trigger didn't fire) — do not blindly re-tune thresholds.

- [ ] **Step 3: Full re-capture (paced, resumable)**

```bash
mv output/snapshots output/snapshots.pre-modsplit 2>/dev/null || true
for round in 1 2 3; do
  echo "=== round $round ==="
  node src/run-capture.js 2>&1 | grep -E '^(ok|FAIL)'
  fails=$(node --input-type=module -e 'import {readdirSync,readFileSync} from "node:fs";let n=0;try{for(const f of readdirSync("output/snapshots")){if(JSON.parse(readFileSync("output/snapshots/"+f,"utf8")).error)n++}}catch{n=-1}console.log(n)')
  echo "remaining failed captures: $fails"
  [ "$fails" = "0" ] && break
  sleep 120
done
```

Expected: 40/40 captured over ≤3 rounds. If a page persistently WAF-blocks, note it — do not fake it.

- [ ] **Step 4: Compare + report + verify**

```bash
node src/run-compare.js && node src/run-report.js
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const ids = readFileSync('pages.csv','utf8').trim().split('\n').slice(1).map((l) => l.split(',')[0]);
let mm = 0; const pages = new Set(); const vals = {};
for (const id of ids) {
  let d; try { d = JSON.parse(readFileSync('output/issues/det/' + id + '.json','utf8')); } catch { continue; }
  for (const i of (d.issues || [])) if (i.category === 'missing-module') { mm++; pages.add(id); vals[i.original] = (vals[i.original] || 0) + 1; }
}
console.log('missing-module issues:', mm, 'across', pages.size, 'pages (was 33 across 17)');
console.log('by original value:', JSON.stringify(vals, null, 1));
"
```

Expected: the `การลงทุน`/`หุ้นกู้`/`กองทุนรวม` per-page false positives and the `arrow-right.svg` site-wide row are gone. Remaining `missing-module` issues, if any, should be plausibly-real section differences (spot-check 1-2 against the screenshots). Watch for NEW over-splitting noise (a migrated module wrongly split into sub-sections) — if it appears, note it as a follow-up with the offending page/heading.

- [ ] **Step 5: Record results + clean up**

Append a "Heading-split + icon-filter verification" subsection to `docs/superpowers/specs/2026-07-02-pilot-findings.md`: before/after `missing-module` tally, whether the original now matches the migrated section headings, and any over-splitting observed. Then:

```bash
rm -rf output/snapshots.pre-modsplit
git add docs/superpowers/specs/2026-07-02-pilot-findings.md
git commit -m "docs: record heading-split + icon-filter verification results"
```

(Capture output is gitignored — commit only the findings note.)
