# Criteria & Methodology Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Thai `criteria.html` page to the report documenting each issue category's criteria, detection method, calculation, thresholds, statuses, severities, and the site-wide aggregation rule — with numeric thresholds imported live from `config.js`.

**Architecture:** A new `src/report/criteria.js` exports `renderCriteria()`, building the page from data arrays and live config imports. It reuses `esc`/`CSS` (exported from `html.js`) and the Thai label maps from `labels.js`. `run-report.js` writes `criteria.html`; `renderIndex` links to it.

**Tech Stack:** Node.js ≥ 20 (ESM), built-in `node:test`. No new dependencies.

## Global Constraints

- Numeric thresholds MUST be imported from `src/config.js` (`IMAGE_RATIO_TOLERANCE`, `THAI_RATIO_DELTA`, `SYSTEMIC_THRESHOLD`, `SYSTEMIC_MIN_PAGES`, `MAX_LINK_CHECKS`) — no divorced hardcoded copies. The three snapshot-inline constants (`MIN_MODULE_HEIGHT` 40/80, `COARSE_MODULE_MIN_HEIGHT` 1000, `ICON_MAX_PX` 48) are shown as documented literals with a note pointing to `snapshot.js`/`modules.js`.
- All page text is Thai. Category/status/severity display uses `CATEGORY_LABEL`/`STATUS_LABEL`/`SEVERITY_LABEL` from `labels.js`, with the raw contract value shown in a `<code>` tag for transparency.
- Do NOT change any comparator, config value, CSS class, or the issue contract. Documentation/display only.
- Reuse the report `CSS`; set `<html lang="th">`.
- No new dependencies. No re-capture (pure render). Built-in `node:test`; run the suite with `npm test` (NOT `node --test test/`). Commit format `<type>: <description>`, no attribution footer.

## File Structure

```
src/report/criteria.js     # NEW — renderCriteria(): the Thai criteria page from data arrays + live config
src/report/html.js         # add `export` to `esc` and `CSS`; add criteria.html nav link in renderIndex
src/run-report.js          # write output/report/criteria.html
test/criteria.test.js      # NEW — assert live thresholds, all labels, sections
test/html.test.js          # add: renderIndex output links criteria.html
```

---

### Task 1: The criteria module

**Files:**
- Modify: `src/report/html.js` (add `export` to `const esc` and `const CSS` — no behavior change)
- Create: `src/report/criteria.js`
- Create: `test/criteria.test.js`

**Interfaces:**
- Consumes: `esc`, `CSS` (now exported from `html.js`); `T`, `CATEGORY_LABEL`, `STATUS_LABEL`, `SEVERITY_LABEL` (from `labels.js`); config threshold constants.
- Produces: `renderCriteria(): string` — a complete `<!doctype html>` Thai page.

- [ ] **Step 1: Export `esc` and `CSS` from `src/report/html.js`**

Change the two declarations (add `export`; nothing else):

```js
export const esc = (s) => String(s ?? '')
```

```js
export const CSS = `
```

(Both are currently `const esc = ...` and `const CSS = ...`. The existing internal uses in `html.js` keep working unchanged.)

- [ ] **Step 2: Write `test/criteria.test.js` (failing — module does not exist yet)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCriteria } from '../src/report/criteria.js';
import { IMAGE_RATIO_TOLERANCE, THAI_RATIO_DELTA, SYSTEMIC_THRESHOLD, SYSTEMIC_MIN_PAGES, MAX_LINK_CHECKS } from '../src/config.js';
import { CATEGORY_LABEL, STATUS_LABEL, SEVERITY_LABEL } from '../src/report/labels.js';

test('renders the live config thresholds (no divorced literals)', () => {
  const html = renderCriteria();
  assert.ok(html.includes(`${Math.round(IMAGE_RATIO_TOLERANCE * 100)}%`), 'image ratio %');
  assert.ok(html.includes(`${Math.round(THAI_RATIO_DELTA * 100)} จุด`), 'thai delta points');
  assert.ok(html.includes(`${Math.round(SYSTEMIC_THRESHOLD * 100)}%`), 'systemic %');
  assert.ok(html.includes(String(SYSTEMIC_MIN_PAGES)), 'min pages');
  assert.ok(html.includes(String(MAX_LINK_CHECKS)), 'max link checks');
});

test('lists every category, status, and severity Thai label', () => {
  const html = renderCriteria();
  for (const label of Object.values(CATEGORY_LABEL)) assert.ok(html.includes(label), `missing category label ${label}`);
  for (const label of Object.values(STATUS_LABEL)) assert.ok(html.includes(label), `missing status label ${label}`);
  for (const label of Object.values(SEVERITY_LABEL)) assert.ok(html.includes(label), `missing severity label ${label}`);
});

test('is a Thai HTML document with the expected sections', () => {
  const html = renderCriteria();
  assert.match(html, /^<!doctype html><html lang="th">/);
  assert.match(html, /เกณฑ์การตรวจรายหมวด/);
  assert.match(html, /ค่าเกณฑ์/);
  assert.match(html, /สถานะการตรวจ/);
  assert.match(html, /ระดับความรุนแรง/);
  assert.match(html, /การรวมปัญหาระดับทั้งเว็บ/);
});
```

- [ ] **Step 3: Run the new test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/report/criteria.js` cannot be resolved (module missing). Other tests pass.

- [ ] **Step 4: Create `src/report/criteria.js`**

```js
import { IMAGE_RATIO_TOLERANCE, THAI_RATIO_DELTA, SYSTEMIC_THRESHOLD, SYSTEMIC_MIN_PAGES, MAX_LINK_CHECKS } from '../config.js';
import { esc, CSS } from './html.js';
import { T, CATEGORY_LABEL, STATUS_LABEL, SEVERITY_LABEL } from './labels.js';

const pct = (x) => `${Math.round(x * 100)}%`;
const pts = (x) => `${Math.round(x * 100)} จุด`;
const catLabel = (c) => CATEGORY_LABEL[c] ?? c;

// One row per issue category: what it checks, how it is detected/calculated, the threshold, severity.
const CRITERIA = [
  {
    cat: 'broken-link',
    check: 'ลิงก์บนหน้าที่ย้ายใช้งานได้ไหม และลิงก์เดิมยังอยู่ครบไหม',
    method: `ยิงตรวจสถานะ HTTP ของลิงก์ในหน้าที่ย้าย (สูงสุด ${MAX_LINK_CHECKS} ลิงก์/หน้า); เทียบข้อความลิงก์ต้นฉบับกับหน้าที่ย้าย`,
    threshold: 'HTTP ≥ 400 = เสีย, สถานะ 0 = เข้าไม่ถึง, ลิงก์เดิมจับคู่ข้อความไม่เจอ = หาย',
    sev: 'สูง / ปานกลาง',
  },
  {
    cat: 'link-target',
    check: 'เมนู/ลิงก์เดิมชี้ไปปลายทางที่ถูกต้องบนหน้าที่ย้ายไหม',
    method: 'แปลง URL ต้นฉบับ /th-TH/… → เปลี่ยนโฮสต์เป็น prod-aem, /th-TH/→/th/, ตัวพิมพ์เล็ก, ตัด / ท้าย แล้วหาลิงก์ที่ตรงบนหน้าที่ย้าย',
    threshold: 'ไม่มีลิงก์ปลายทางที่ตรง = ปัญหา (ข้ามลิงก์นอกเว็บ, ลิงก์ที่มี query string, ลิงก์ที่ไม่ใช่ /th-TH/)',
    sev: 'สูง',
  },
  {
    cat: 'image-ratio',
    check: 'รูปภาพในเนื้อหาหลักถูกบีบ/ยืดผิดสัดส่วนบนหน้าที่ย้ายไหม',
    method: 'จับคู่รูปด้วยชื่อไฟล์ (แล้วตามลำดับ) เฉพาะรูปในเนื้อหาหลัก; เทียบสัดส่วน กว้าง/สูง ที่เรนเดอร์จริง',
    threshold: `|สัดส่วนต้นฉบับ − สัดส่วนที่ย้าย| ÷ สัดส่วนต้นฉบับ > ${pct(IMAGE_RATIO_TOLERANCE)}; และตรวจการบิดเบี้ยว (สัดส่วนไฟล์จริง vs ที่เรนเดอร์)`,
    sev: 'ปานกลาง',
  },
  {
    cat: 'text-language',
    check: 'ข้อความเนื้อหาหลักครบไหม และสัดส่วนภาษาไทย/อังกฤษเปลี่ยนไปไหม',
    method: 'เทียบบล็อกข้อความในเนื้อหาหลัก (ตัดช่องว่างซ้ำ, ยาว ≥ 4 ตัวอักษร, ไม่ใช่ข้อความไดนามิก); คำนวณสัดส่วนอักษรไทย',
    threshold: `ข้อความต้นฉบับไม่พบบนหน้าที่ย้าย = หาย; สัดส่วนไทยต่างกัน > ${pts(THAI_RATIO_DELTA)}`,
    sev: 'ปานกลาง / สูง',
  },
  {
    cat: 'missing-module',
    check: 'บล็อก/โมดูลเนื้อหาหลักหายไปบนหน้าที่ย้ายไหม',
    method: 'แยกโมดูลในเนื้อหาหลัก (ตัด chrome; บล็อกสูง ≥ 1000px แยกตาม h2; ไม่นับไอคอน < 48px; เทียบเฉพาะโมดูลสูง ≥ 80px ที่มีหัวข้อหรือรูปเนื้อหา) แล้วจับคู่กับหน้าที่ย้ายด้วยหัวข้อหรือชื่อไฟล์รูป',
    threshold: 'โมดูลต้นฉบับจับคู่ไม่ได้ทั้งหัวข้อและรูป = หาย; และจำนวนรูปเนื้อหาหน้าที่ย้าย < ต้นฉบับ − 2',
    sev: 'สูง',
  },
  {
    cat: 'layout',
    check: 'เลย์เอาต์/การจัดวางผิดเพี้ยนไปจากต้นฉบับ',
    method: 'ตรวจด้วยการรีวิวภาพ (AI visual review) เทียบสกรีนช็อต — ไม่ใช่กฎอัตโนมัติ',
    threshold: 'ขึ้นกับการรีวิวภาพ',
    sev: 'สูง / ปานกลาง',
  },
  {
    cat: 'capture-failure',
    check: 'จับภาพหน้าไม่สำเร็จ (ถูก WAF บล็อก หรือโหลดหน้าไม่ได้)',
    method: 'ตรวจว่าหน้าโหลดสำเร็จและไม่ถูกบล็อกก่อนนำไปเทียบ',
    threshold: 'ถ้าจับภาพไม่ได้ หน้าถูกทำเครื่องหมาย “จับภาพไม่สำเร็จ” (ไม่รายงานว่าผ่าน)',
    sev: 'สูง',
  },
];

const CONFIG_ROWS = [
  ['IMAGE_RATIO_TOLERANCE', pct(IMAGE_RATIO_TOLERANCE), 'เกณฑ์ความต่างสัดส่วนรูปที่ถือว่าผิด'],
  ['THAI_RATIO_DELTA', pts(THAI_RATIO_DELTA), 'ความต่างสัดส่วนอักษรไทยที่ถือว่าผิด'],
  ['SYSTEMIC_THRESHOLD', pct(SYSTEMIC_THRESHOLD), 'สัดส่วนหน้าขั้นต่ำที่ทำให้ปัญหาเป็นระดับทั้งเว็บ'],
  ['SYSTEMIC_MIN_PAGES', String(SYSTEMIC_MIN_PAGES), 'จำนวนหน้าขั้นต่ำสำหรับปัญหาระดับทั้งเว็บ'],
  ['MAX_LINK_CHECKS', String(MAX_LINK_CHECKS), 'จำนวนลิงก์สูงสุดที่ตรวจต่อหน้า'],
  ['MIN_MODULE_HEIGHT', '40px (จับภาพ) / 80px (เทียบ)', 'ความสูงขั้นต่ำของโมดูล — อยู่ใน snapshot.js / modules.js'],
  ['COARSE_MODULE_MIN_HEIGHT', '1000px', 'บล็อกที่สูงเกินนี้และมี ≥ 2 h2 จะถูกแยก — อยู่ใน snapshot.js'],
  ['ICON_MAX_PX', '48px', 'รูปเล็กกว่านี้ถือเป็นไอคอน ไม่นับเป็นตัวตนของโมดูล — อยู่ใน snapshot.js'],
];

const STATUS_ROWS = [
  ['Passed', 'ผ่านการตรวจ ไม่พบปัญหา'],
  ['Failed', 'พบปัญหาอย่างน้อยหนึ่งข้อ'],
  ['Capture Failed', 'จับภาพหน้าไม่สำเร็จ'],
  ['Not Migrated', 'หน้าที่ย้ายขึ้น 404 (ตรงกับ NOT_FOUND_PATTERNS)'],
  ['Retired on Original', 'หน้าต้นฉบับขึ้น 404'],
];

const SEVERITY_ROWS = [
  ['High', 'ปัญหารุนแรง ควรแก้ก่อน'],
  ['Medium', 'ปัญหาระดับกลาง'],
  ['Low', 'ปัญหาเล็กน้อย'],
];

const critRows = CRITERIA.map((c) => `
    <tr>
      <td>${esc(catLabel(c.cat))} <code>${esc(c.cat)}</code></td>
      <td>${esc(c.check)}</td><td>${esc(c.method)}</td>
      <td>${esc(c.threshold)}</td><td>${esc(c.sev)}</td>
    </tr>`).join('');

const configRows = CONFIG_ROWS.map(([a, b, c]) =>
  `<tr><td><code>${esc(a)}</code></td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join('');

const statusRows = STATUS_ROWS.map(([s, d]) =>
  `<tr><td>${esc(STATUS_LABEL[s] ?? s)} <code>${esc(s)}</code></td><td>${esc(d)}</td></tr>`).join('');

const severityRows = SEVERITY_ROWS.map(([s, d]) =>
  `<tr><td>${esc(SEVERITY_LABEL[s] ?? s)} <code>${esc(s)}</code></td><td>${esc(d)}</td></tr>`).join('');

export function renderCriteria() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>เกณฑ์การตรวจสอบ</title>
<style>${CSS}</style></head><body>
<p><a href="index.html">${T.back}</a></p>
<h1>เกณฑ์และวิธีการตรวจสอบ</h1>
<p>เครื่องมือนี้เปิดหน้าเว็บต้นฉบับ (www.bangkokbank.com) และหน้าที่ย้าย (prod-aem.bangkokbank.com) ด้วยเบราว์เซอร์จริง แล้วเทียบเฉพาะส่วนเนื้อหาหลัก (ตัดส่วนหัว/เมนู/ส่วนท้ายออกจากการตรวจเนื้อหา ส่วนลิงก์ตรวจทั้งหน้า)</p>

<h2>เกณฑ์การตรวจรายหมวด</h2>
<table><tr><th>หมวดหมู่</th><th>ตรวจอะไร</th><th>วิธีตรวจ/คำนวณ</th><th>เกณฑ์</th><th>ความรุนแรง</th></tr>${critRows}</table>

<h2>ค่าเกณฑ์ (config)</h2>
<table><tr><th>ชื่อ</th><th>ค่า</th><th>ความหมาย</th></tr>${configRows}</table>

<h2>สถานะการตรวจ</h2>
<table><tr><th>สถานะ</th><th>ความหมาย</th></tr>${statusRows}</table>

<h2>ระดับความรุนแรง</h2>
<table><tr><th>ระดับ</th><th>ความหมาย</th></tr>${severityRows}</table>

<h2>การรวมปัญหาระดับทั้งเว็บ (systemic)</h2>
<p>ปัญหาที่พบบนหน้าที่เทียบได้ (ผ่าน/ไม่ผ่าน) ตั้งแต่ ${pct(SYSTEMIC_THRESHOLD)} ของหน้าขึ้นไป และอย่างน้อย ${SYSTEMIC_MIN_PAGES} หน้า จะถูกจัดเป็นปัญหาระดับทั้งเว็บ (แก้ครั้งเดียวที่ระดับเทมเพลต) โดยรวมปัญหาซ้ำด้วยคีย์ <code>category|original|migrated</code></p>
</body></html>`;
}
```

- [ ] **Step 5: Run the suite to verify all tests pass**

Run: `npm test`
Expected: PASS (all). The three criteria tests pass; every `CATEGORY_LABEL` value (including `เลย์เอาต์` for `layout`) appears because `CRITERIA` has a `layout` row.

- [ ] **Step 6: Commit**

```bash
git add src/report/html.js src/report/criteria.js test/criteria.test.js
git commit -m "feat: add Thai criteria & methodology page renderer"
```

---

### Task 2: Wire criteria.html into the report + index link

**Files:**
- Modify: `src/report/html.js` (add the criteria link in `renderIndex`)
- Modify: `src/run-report.js` (import + write `criteria.html`)
- Modify: `test/html.test.js` (assert the index links `criteria.html`)

**Interfaces:**
- Consumes: `renderCriteria()` (Task 1).
- Produces: `output/report/criteria.html`; the index page links to it.

- [ ] **Step 1: Add the failing index-link test to `test/html.test.js`**

Append:

```js
test('index links to the criteria page', () => {
  const html = renderIndex([{ pair, result, own: result.issues, systemicHits: 0 }], 0);
  assert.match(html, /criteria\.html/);
  assert.match(html, /เกณฑ์การตรวจสอบ/);
});
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `npm test`
Expected: FAIL on the new test — `renderIndex` output has no `criteria.html` link yet.

- [ ] **Step 3: Add the criteria nav link in `renderIndex` (`src/report/html.js`)**

Change the header block from:

```js
<h1>${T.reportTitle}</h1>
${banner}
```

to:

```js
<h1>${T.reportTitle}</h1>
<p><a href="criteria.html">เกณฑ์การตรวจสอบ</a></p>
${banner}
```

- [ ] **Step 4: Run the suite to verify the link test passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Write `criteria.html` in `src/run-report.js`**

Add `renderCriteria` to the `html.js` import (it re-exports? No — import from criteria.js). Update the report import line and add a write. Change:

```js
import { renderIndex, renderDetail, renderSystemic } from './report/html.js';
```

to add a second import line right after it:

```js
import { renderCriteria } from './report/criteria.js';
```

Then, next to the other `writeFileSync` report writes (after the `index.html` write), add:

```js
fs.writeFileSync(`${DIRS.report}/criteria.html`, renderCriteria());
```

- [ ] **Step 6: Regenerate the report and confirm criteria.html**

Run:
```bash
node src/run-report.js && test -f output/report/criteria.html && grep -c 'เกณฑ์การตรวจรายหมวด' output/report/criteria.html && grep -o 'criteria\.html' output/report/index.html | head -1
```
Expected: `run-report` prints its summary; `criteria.html` exists and contains `เกณฑ์การตรวจรายหมวด` (count ≥ 1); `index.html` contains the `criteria.html` link.

- [ ] **Step 7: Full suite + commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/report/html.js src/run-report.js test/html.test.js
git commit -m "feat: write criteria.html and link it from the report index"
```
