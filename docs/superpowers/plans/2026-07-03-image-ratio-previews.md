# Image-Ratio Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show original and migrated image thumbnails on each `image-ratio` issue row in the per-page detail report so a reviewer can see which image is wrong and how it is distorted.

**Architecture:** `compareImages` attaches the matched images' absolute `src` URLs to the two `image-ratio` issue objects; `html.js` renders those URLs as `<img>` thumbnails (linking to the full image) inside the existing detail-row value cells. Pure compare + report change over existing snapshots — no re-capture.

**Tech Stack:** Node.js ≥ 20 (ESM), built-in `node:test`. No new dependencies.

## Global Constraints

- Issue shape gains two OPTIONAL fields, `originalSrc` and `migratedSrc`, set ONLY on `image-ratio` issues. All other issue fields and the issue contract are unchanged.
- `issueKey` (systemic dedup) uses `category|original|migrated` (the ratio strings) — do NOT let `originalSrc`/`migratedSrc` enter the key. Do not modify `issueKey` or `renderSystemic`.
- Thumbnails render only in the per-page detail rows (`issueRows` in `src/report/html.js`), not in the systemic table.
- The thumbnail `<img>` must have NO explicit `width`/`height` (so a distorted image renders at its true, visibly-wrong aspect), a `.thumb` class, `loading="lazy"`, and be wrapped in `<a href=… target="_blank" rel="noopener">`. Only emit it when the src matches `^https?:`; escape the src with the existing `esc()`.
- No new dependencies. No re-capture. Built-in `node:test`; run the suite with `npm test` (NOT `node --test test/`). Commit format `<type>: <description>`, no attribution footer.

## File Structure

```
src/compare/images.js         # add originalSrc/migratedSrc to the two image-ratio issues
src/report/html.js            # thumb() helper + .thumb CSS + inject into issueRows value cells
test/compare-images.test.js   # assert the src fields on an image-ratio issue
test/html.test.js             # assert thumbnails render for image-ratio, none for other issues
```

---

### Task 1: Attach image srcs to image-ratio issues

**Files:**
- Modify: `src/compare/images.js` (the two `image-ratio` `issues.push({...})` objects in `compareImages`)
- Modify: `test/compare-images.test.js` (add one test)

**Interfaces:**
- Produces: an `image-ratio` issue now carries `originalSrc` (the matched original image's `src`) and `migratedSrc` (the matched migrated image's `src`). `o` and `m` are the matched image records already bound in the `for (const [o, m] of matchImages(...))` loop.

- [ ] **Step 1: Add the failing test to `test/compare-images.test.js`**

Append (the file's `img(src, nw, nh, rw, rh)` and `env(images)` helpers already exist):

```js
test('image-ratio issue carries originalSrc and migratedSrc', () => {
  const orig = env([img('https://x/hero.jpg', 1600, 900, 800, 450)]);
  const mig = env([img('https://y/hero.jpg', 1600, 900, 800, 500)]);
  const issues = compareImages(orig, mig);
  assert.equal(issues[0].category, 'image-ratio');
  assert.equal(issues[0].originalSrc, 'https://x/hero.jpg');
  assert.equal(issues[0].migratedSrc, 'https://y/hero.jpg');
});
```

- [ ] **Step 2: Run the suite to verify the new test fails**

Run: `npm test`
Expected: FAIL on the new test — `issues[0].originalSrc` is `undefined` (the issue does not carry the field yet). All other tests pass.

- [ ] **Step 3: Edit `src/compare/images.js`**

In the **rendered-ratio** issue (the `differs(ro, rm)` branch) add `originalSrc: o.src, migratedSrc: m.src`:

```js
      issues.push({
        category: 'image-ratio', severity: 'Medium',
        description: `Rendered aspect ratio differs: original ${ro.toFixed(3)} vs migrated ${rm.toFixed(3)} (${name})`,
        location: name,
        original: `${ro.toFixed(3)}`, migrated: `${rm.toFixed(3)}`, region: 'main',
        originalSrc: o.src, migratedSrc: m.src,
      });
```

In the **distortion** issue (the `differs(natM, rm) && !differs(natO, ro)` branch) add the same two fields:

```js
      issues.push({
        category: 'image-ratio', severity: 'Medium',
        description: `Image distorted on migrated: natural ratio ${natM.toFixed(3)} vs rendered ${rm.toFixed(3)} (${name})`,
        location: name,
        original: `${ro.toFixed(3)}`, migrated: `${rm.toFixed(3)} (natural ${natM.toFixed(3)})`, region: 'main',
        originalSrc: o.src, migratedSrc: m.src,
      });
```

Leave the image-count `missing-module` issue unchanged.

- [ ] **Step 4: Run the suite to verify all tests pass**

Run: `npm test`
Expected: PASS (all). The new test passes; the existing `image-ratio issue carries region "main"` test still passes (same issue, extra fields don't affect it).

- [ ] **Step 5: Commit**

```bash
git add src/compare/images.js test/compare-images.test.js
git commit -m "feat: attach original/migrated image src to image-ratio issues"
```

---

### Task 2: Render image thumbnails in the detail report

**Files:**
- Modify: `src/report/html.js` (add `thumb()` helper, `.thumb` CSS, inject into `issueRows` value cells)
- Modify: `test/html.test.js` (add two tests)

**Interfaces:**
- Consumes: `issue.originalSrc` / `issue.migratedSrc` (Task 1).
- Produces: `issueRows` renders an `<a><img class="thumb"></a>` under the ratio value in the Original and Migrated cells when the issue carries an https src; other rows are unchanged.

- [ ] **Step 1: Add the two failing tests to `test/html.test.js`**

Append (the file already imports `renderDetail` and defines `pair` and `result`):

```js
test('image-ratio detail rows render original and migrated image thumbnails', () => {
  const own = [{
    category: 'image-ratio', severity: 'Medium', description: 'ratio differs',
    location: 'hero.jpg', original: '1.000', migrated: '4.289',
    originalSrc: 'https://x/hero.jpg', migratedSrc: 'https://y/hero.jpg', region: 'main',
  }];
  const html = renderDetail(pair, { ...result, status: 'Failed' }, own, 0);
  assert.match(html, /<img class="thumb"[^>]*src="https:\/\/x\/hero\.jpg"/);
  assert.match(html, /<img class="thumb"[^>]*src="https:\/\/y\/hero\.jpg"/);
});

test('non-image issues render no thumbnail', () => {
  const own = [{ category: 'layout', severity: 'High', description: 'x', location: 'hero', region: 'main' }];
  const html = renderDetail(pair, { ...result, status: 'Failed' }, own, 0);
  assert.doesNotMatch(html, /class="thumb"/);
});
```

- [ ] **Step 2: Run the suite to verify the new tests fail**

Run: `npm test`
Expected: FAIL on `image-ratio detail rows render … thumbnails` — no `thumb` markup exists yet. The `non-image issues render no thumbnail` test passes already (nothing renders a thumb). Other tests pass.

- [ ] **Step 3: Edit `src/report/html.js` — add the `thumb()` helper**

Immediately above the `const issueRows = (items) => ...` definition, add:

```js
const thumb = (src) => (src && /^https?:/.test(src))
  ? `<a href="${esc(src)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(src)}" loading="lazy" alt=""></a>`
  : '';
```

- [ ] **Step 4: Edit `src/report/html.js` — inject thumbnails into the value cells**

Change the two value-cell lines in `issueRows` from:

```js
      <td class="val val-orig">${esc(i.original ?? '—')}</td>
      <td class="val val-mig">${esc(i.migrated ?? '—')}</td>
```

to:

```js
      <td class="val val-orig">${esc(i.original ?? '—')}${thumb(i.originalSrc)}</td>
      <td class="val val-mig">${esc(i.migrated ?? '—')}${thumb(i.migratedSrc)}</td>
```

- [ ] **Step 5: Edit `src/report/html.js` — add the `.thumb` CSS**

In the `CSS` template string, add a rule after the `.val-orig`/`.val-mig` line:

```css
  .thumb{display:block;max-height:80px;max-width:100%;margin-top:6px;border:1px solid #ccc}
```

- [ ] **Step 6: Run the suite to verify all tests pass**

Run: `npm test`
Expected: PASS (all). Both new tests pass; existing detail-row tests (region badge, etc.) still pass because non-image issues produce `thumb(undefined) === ''`.

- [ ] **Step 7: Commit**

```bash
git add src/report/html.js test/html.test.js
git commit -m "feat: render image thumbnails on image-ratio issue rows"
```

---

### Task 3: Regenerate the report + eyeball a real page

Operational task — no source changes, no re-capture (this is a compare + report change over existing snapshots).

- [ ] **Step 1: Full suite green**

Run: `npm test`
Expected: PASS (all tests from Tasks 1-2).

- [ ] **Step 2: Regenerate issues + report**

Run: `node src/run-compare.js && node src/run-report.js`
Expected: per-page status lines + the "site-wide issues / Report: …" summary line.

- [ ] **Step 3: Confirm thumbnails are in the generated HTML**

```bash
grep -l 'class="thumb"' output/report/*.html | head
grep -c 'class="thumb"' output/report/aec-investment-clinic.html 2>/dev/null || echo "aec has no image-ratio issue; try another"
```

Expected: at least one detail page contains `class="thumb"` `<img>` tags (any page with an `image-ratio` issue — `aec-investment-clinic` had one historically; if the current 20-page set differs, `grep -l` finds whichever pages do).

- [ ] **Step 4: Spot-check in a browser + record**

Open a detail page that has `class="thumb"` next to its `image-ratio` issue. Confirm the original and migrated thumbnails render and the distorted one is visibly wrong. Note whether the bank CDN images load in-browser or WAF-block — if they systematically fail to load, record it in `docs/superpowers/specs/2026-07-02-pilot-findings.md` as a follow-up (escalate to inline data-URI approach B), otherwise no doc change is needed. (Report output is gitignored — nothing to commit unless you add a findings note.)
