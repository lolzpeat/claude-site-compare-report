# Readable Report Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every issue description in short Thai, shorten known-host URLs in value columns, and collapse chrome.html's per-URL broken-link rows into status groups — display layer only, per the approved spec `docs/superpowers/specs/2026-07-04-readable-report-details-design.md`.

**Architecture:** New `src/report/describe.js` maps the comparators' English description templates to concise Thai via an ordered regex rule table (fallback = original English). A `displayValue()` helper in `src/report/html.js` renders known-host URLs as shortened path anchors. `renderChrome` groups broken-link entries per zone into collapsed `<details>` by HTTP status. Comparators, det/chrome JSON, and dedup keys stay byte-identical; only `node src/run-report.js` (pure render) is needed to apply.

**Tech Stack:** Node ESM, `node:test` via `npm test` ONLY (`node --test test/` breaks on newer Node), no new dependencies.

## Global Constraints

- Display layer only: do NOT touch `src/compare/**`, `src/run-compare.js`, `output/**` data shapes, or `issueKey` (`src/report/systemic.js`).
- Report UI text is Thai; contract values and CSS class names stay English. New Thai strings for descriptions live in `describe.js` (they are parameterized renderings, not static labels — labels.js stays for static labels).
- `describeIssue` fallback MUST return the original description unchanged when no rule matches — unknown/future patterns degrade to English, never lose information.
- `displayValue` shortens ONLY URLs on known hosts (`www.bangkokbank.com`, `prod-aem.bangkokbank.com`); other values (including unknown-host URLs) pass through escaped and unchanged. It returns HTML — callers must NOT wrap it in `esc()` again.
- Acceptance (spec Testing #5): 100% of descriptions the CURRENT comparators emit are matched by a rule, measured against real `output/issues/det/*.json`.
- Run tests ONLY via `npm test`; the whole suite stays green. NEVER run `node src/run-capture.js` (WAF).
- The only existing test that asserts an English description in rendered HTML is `test/report-chrome.test.js:77-78` (`/Chrome label rendered in English/` in both zone slices) — Task 3 updates it to the Thai string deliberately. All other description literals in tests are fixture data whose assertions don't check the description text.

## File Structure

| File | Responsibility |
|---|---|
| Create `src/report/describe.js` | `describeIssue(issue)` — ordered regex rules English→Thai, fallback passthrough |
| Modify `src/report/html.js` | export `displayValue`; use `describeIssue`+`displayValue` in `issueRows`, detail chrome block, `renderSystemic` |
| Modify `src/report/chrome.js` | use `describeIssue`+`displayValue` in `zoneRows`; group broken-link entries by HTTP status into collapsed `<details>` |
| Create `test/describe.test.js` | one case per rule + fallback |
| Modify `test/html.test.js`, `test/report-chrome.test.js` | new displayValue/wiring/grouping tests; update the two English-description assertions |
| Create `scripts/describe-coverage.py` | validation: % of real descriptions matched (Task 5) |
| Modify `CLAUDE.md`, spec status line | Task 5 docs |

---

### Task 1: `describe.js` — Thai description rules

**Files:**
- Create: `src/report/describe.js`
- Test: Create `test/describe.test.js`

**Interfaces:**
- Consumes: nothing (pure function; no imports needed).
- Produces: `describeIssue(issue: {description?: string}) → string` — Thai when a rule matches, otherwise `issue.description` unchanged (`''` for null/undefined input). Tasks 2–4 import it from `./describe.js` (html.js) / `./describe.js` (chrome.js).

- [ ] **Step 1: Write the failing tests**

Create `test/describe.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeIssue } from '../src/report/describe.js';

const d = (description) => describeIssue({ description });

// One case per comparator template — the exact English strings the comparators emit today.
const CASES = [
  // links.js
  ['Link returns HTTP 404: https://prod-aem.bangkokbank.com/th/x', 'ลิงก์เสีย (HTTP 404)'],
  ['Link returns HTTP 403: https://x/y', 'ลิงก์เสีย (HTTP 403)'],
  ['Link unreachable (fetch failed): https://x/y', 'ลิงก์เข้าไม่ถึง (เชื่อมต่อไม่สำเร็จ)'],
  ['Link on original not found on migrated (matched by text): "กองทุนรวม"', 'ลิงก์บนหน้าเดิมไม่พบบนเว็บที่ย้าย (เทียบด้วยข้อความ)'],
  ['37 original links missing on migrated (first 20 listed)', 'ลิงก์เดิมหายไปมากกว่าที่แสดง (แสดง 20 รายการแรก)'],
  // link-targets.js
  ['Link "สินเชื่อ" on original points to prod-aem.bangkokbank.com/th/loans — no matching link on migrated', 'ปลายทางลิงก์ที่คาดหวังไม่ถูกลิงก์บนเว็บที่ย้าย'],
  ['25 original links have no matching destination on migrated (first 20 listed)', 'ปลายทางลิงก์หายไปมากกว่าที่แสดง (แสดง 20 รายการแรก)'],
  // chrome.js
  ['Chrome label rendered in English instead of Thai: "กิจการธนาคารต่างประเทศ"', 'เมนู/ข้อความส่วนกลางแสดงเป็นภาษาอังกฤษ'],
  ['Link points to the same URL but its label differs from original', 'URL เดียวกันแต่ชื่อเมนูไม่ตรงกับเดิม'],
  ['Chrome link "ศูนย์ความช่วยเหลือ" has no matching link in the migrated zone', 'ลิงก์ส่วนกลางหายไปจากโซนบนเว็บที่ย้าย'],
  ['Fewer than 50% of mappable original links found in the migrated zone', 'ลิงก์ในโซนจับคู่ได้ต่ำกว่า 50%'],
  ['More original links missing in this zone than itemized (first 20 listed)', 'ลิงก์ที่หายมีมากกว่าที่แสดง (แสดง 20 รายการแรก)'],
  // hero.js
  ['Hero banner image missing on migrated page', 'รูปแบนเนอร์หลักหายไปบนเว็บที่ย้าย'],
  ['Hero banner image differs from original', 'รูปแบนเนอร์หลักคนละไฟล์กับต้นฉบับ'],
  ['Hero heading differs from original', 'หัวข้อแบนเนอร์หลักไม่ตรงกับต้นฉบับ'],
  // text.js
  ['Text on original not found on migrated: "สมัครบัตรเครดิต"', 'ข้อความบนหน้าเดิมไม่พบบนเว็บที่ย้าย'],
  ['22 original text blocks missing on migrated (first 15 listed)', 'ข้อความหายไปมากกว่าที่แสดง (แสดง 15 รายการแรก)'],
  ['Thai/English balance differs: original 85% Thai vs migrated 40% Thai', 'สัดส่วนภาษาไทย/อังกฤษต่างไปจากเดิม'],
  // images.js
  ['Rendered aspect ratio differs: original 1.500 vs migrated 1.200 (hero.jpg)', 'สัดส่วนรูปภาพเปลี่ยนไปจากเดิม'],
  ['Image distorted on migrated: natural ratio 1.500 vs rendered 1.200 (hero.jpg)', 'รูปภาพถูกบีบ/ยืดผิดสัดส่วนบนเว็บที่ย้าย'],
  ['Migrated page renders 3 images vs 9 on original', 'จำนวนรูปภาพน้อยกว่าหน้าเดิม'],
  // modules.js
  ['Module not found on migrated: "อัตราดอกเบี้ย" (~500px tall)', 'โมดูล/ส่วนเนื้อหาหายไปบนเว็บที่ย้าย'],
  // redirect.js
  ['The original URL redirected: requested https://a but landed on https://b', 'URL ฝั่งต้นฉบับถูก redirect ไปหน้าอื่น'],
  ['The migrated URL redirected: requested https://a but landed on https://b', 'URL ฝั่งเว็บที่ย้ายถูก redirect ไปหน้าอื่น'],
  // compare.js (capture / 404)
  ['Capture failed for original page: WAF_BLOCKED', 'จับภาพหน้าต้นฉบับไม่สำเร็จ (WAF_BLOCKED)'],
  ['Capture failed for migrated page: no snapshot file', 'จับภาพหน้าเว็บที่ย้ายไม่สำเร็จ (no snapshot file)'],
  ['Migrated URL serves a 404 page', 'เว็บที่ย้ายขึ้นหน้า 404'],
  ['Original URL serves a 404 page (offering retired?) while migrated has content', 'หน้าต้นฉบับขึ้น 404 (อาจถูกปลดออก) แต่เว็บที่ย้ายมีเนื้อหา'],
  ['Both original and migrated URLs serve a 404 page', 'ทั้งสองฝั่งขึ้นหน้า 404'],
  // news-detail.js
  ['Article content not detected on migrated page', 'ไม่พบเนื้อหาบทความบนเว็บที่ย้าย'],
  ['News headline missing on migrated', 'หัวข้อข่าวหายไป'],
  ['News headline differs from original', 'หัวข้อข่าวไม่ตรงกับต้นฉบับ'],
  ['News date renders as "Invalid Date" on migrated', 'วันที่ข่าวแสดงเป็น "Invalid Date"'],
  ['News date missing on migrated', 'วันที่ข่าวหายไป'],
  ['News date differs from original', 'วันที่ข่าวไม่ตรงกับต้นฉบับ'],
  ['News body content missing or too short on migrated (42 chars)', 'เนื้อหาข่าวหายหรือสั้นผิดปกติ'],
  ['Content image missing on migrated article', 'รูปประกอบข่าวหายไป'],
  ['Content image differs on migrated article', 'รูปประกอบข่าวคนละรูปกับต้นฉบับ'],
  ['Breadcrumb missing on migrated', 'เส้นทางหน้า (breadcrumb) หายไป'],
  ['Breadcrumb not localized to Thai on migrated', 'เส้นทางหน้า (breadcrumb) ไม่เป็นภาษาไทย'],
  ['Social share buttons missing on migrated', 'ปุ่มแชร์โซเชียลหายไป'],
  // run-report.js fallback det
  ['No comparison result found — run run-capture and run-compare first', 'ยังไม่มีผลเปรียบเทียบ — ต้องรัน run-capture และ run-compare ก่อน'],
];

for (const [en, th] of CASES) {
  test(`describeIssue: ${en.slice(0, 60)}`, () => {
    assert.equal(d(en), th);
  });
}

test('describeIssue falls back to the original description when no rule matches', () => {
  assert.equal(d('AI visual review: layout broken in hero'), 'AI visual review: layout broken in hero');
  assert.equal(d('เลย์เอาต์เพี้ยนจากรีวิวภาพ'), 'เลย์เอาต์เพี้ยนจากรีวิวภาพ');
});

test('describeIssue tolerates missing description', () => {
  assert.equal(describeIssue({}), '');
  assert.equal(describeIssue(null), '');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/report/describe.js'`.

- [ ] **Step 3: Implement**

Create `src/report/describe.js`:

```js
// Render-time Thai descriptions. Comparators emit English description strings that
// are load-bearing data (issueKey falls back to normalizeText(description), and det
// JSON stores them), so translation happens ONLY here at display time. Values embedded
// in the English sentences are dropped — they render in the ต้นฉบับ/เว็บที่ย้าย columns.
// No rule matched → return the description unchanged (safe degradation to English).
// When adding a comparator check, add a rule + a test/describe.test.js case;
// scripts/describe-coverage.py measures real-data coverage.

const RULES = [
  // links.js
  { re: /^Link returns HTTP (\d+): /, th: (m) => `ลิงก์เสีย (HTTP ${m[1]})` },
  { re: /^Link unreachable \(fetch failed\): /, th: () => 'ลิงก์เข้าไม่ถึง (เชื่อมต่อไม่สำเร็จ)' },
  { re: /^Link on original not found on migrated \(matched by text\): /, th: () => 'ลิงก์บนหน้าเดิมไม่พบบนเว็บที่ย้าย (เทียบด้วยข้อความ)' },
  { re: /^\d+ original links missing on migrated \(first (\d+) listed\)$/, th: (m) => `ลิงก์เดิมหายไปมากกว่าที่แสดง (แสดง ${m[1]} รายการแรก)` },
  // link-targets.js
  { re: /^Link ".*" on original points to .* — no matching link on migrated$/, th: () => 'ปลายทางลิงก์ที่คาดหวังไม่ถูกลิงก์บนเว็บที่ย้าย' },
  { re: /^\d+ original links have no matching destination on migrated \(first (\d+) listed\)$/, th: (m) => `ปลายทางลิงก์หายไปมากกว่าที่แสดง (แสดง ${m[1]} รายการแรก)` },
  // chrome.js
  { re: /^Chrome label rendered in English instead of Thai: /, th: () => 'เมนู/ข้อความส่วนกลางแสดงเป็นภาษาอังกฤษ' },
  { re: /^Link points to the same URL but its label differs from original$/, th: () => 'URL เดียวกันแต่ชื่อเมนูไม่ตรงกับเดิม' },
  { re: /^Chrome link ".*" has no matching link in the migrated zone$/, th: () => 'ลิงก์ส่วนกลางหายไปจากโซนบนเว็บที่ย้าย' },
  { re: /^Fewer than (\d+)% of mappable original links found in the migrated zone$/, th: (m) => `ลิงก์ในโซนจับคู่ได้ต่ำกว่า ${m[1]}%` },
  { re: /^More original links missing in this zone than itemized \(first (\d+) listed\)$/, th: (m) => `ลิงก์ที่หายมีมากกว่าที่แสดง (แสดง ${m[1]} รายการแรก)` },
  // hero.js
  { re: /^Hero banner image missing on migrated page$/, th: () => 'รูปแบนเนอร์หลักหายไปบนเว็บที่ย้าย' },
  { re: /^Hero banner image differs from original$/, th: () => 'รูปแบนเนอร์หลักคนละไฟล์กับต้นฉบับ' },
  { re: /^Hero heading differs from original$/, th: () => 'หัวข้อแบนเนอร์หลักไม่ตรงกับต้นฉบับ' },
  // text.js
  { re: /^Text on original not found on migrated: /, th: () => 'ข้อความบนหน้าเดิมไม่พบบนเว็บที่ย้าย' },
  { re: /^\d+ original text blocks missing on migrated \(first (\d+) listed\)$/, th: (m) => `ข้อความหายไปมากกว่าที่แสดง (แสดง ${m[1]} รายการแรก)` },
  { re: /^Thai\/English balance differs: /, th: () => 'สัดส่วนภาษาไทย/อังกฤษต่างไปจากเดิม' },
  // images.js
  { re: /^Rendered aspect ratio differs: /, th: () => 'สัดส่วนรูปภาพเปลี่ยนไปจากเดิม' },
  { re: /^Image distorted on migrated: /, th: () => 'รูปภาพถูกบีบ/ยืดผิดสัดส่วนบนเว็บที่ย้าย' },
  { re: /^Migrated page renders \d+ images vs \d+ on original$/, th: () => 'จำนวนรูปภาพน้อยกว่าหน้าเดิม' },
  // modules.js
  { re: /^Module not found on migrated: /, th: () => 'โมดูล/ส่วนเนื้อหาหายไปบนเว็บที่ย้าย' },
  // redirect.js
  { re: /^The original URL redirected: /, th: () => 'URL ฝั่งต้นฉบับถูก redirect ไปหน้าอื่น' },
  { re: /^The migrated URL redirected: /, th: () => 'URL ฝั่งเว็บที่ย้ายถูก redirect ไปหน้าอื่น' },
  // compare.js capture / 404
  { re: /^Capture failed for original page: (.*)$/, th: (m) => `จับภาพหน้าต้นฉบับไม่สำเร็จ (${m[1]})` },
  { re: /^Capture failed for migrated page: (.*)$/, th: (m) => `จับภาพหน้าเว็บที่ย้ายไม่สำเร็จ (${m[1]})` },
  { re: /^Migrated URL serves a 404 page$/, th: () => 'เว็บที่ย้ายขึ้นหน้า 404' },
  { re: /^Original URL serves a 404 page \(offering retired\?\) while migrated has content$/, th: () => 'หน้าต้นฉบับขึ้น 404 (อาจถูกปลดออก) แต่เว็บที่ย้ายมีเนื้อหา' },
  { re: /^Both original and migrated URLs serve a 404 page$/, th: () => 'ทั้งสองฝั่งขึ้นหน้า 404' },
  // news-detail.js
  { re: /^Article content not detected on migrated page$/, th: () => 'ไม่พบเนื้อหาบทความบนเว็บที่ย้าย' },
  { re: /^News headline missing on migrated$/, th: () => 'หัวข้อข่าวหายไป' },
  { re: /^News headline differs from original$/, th: () => 'หัวข้อข่าวไม่ตรงกับต้นฉบับ' },
  { re: /^News date renders as "Invalid Date" on migrated$/, th: () => 'วันที่ข่าวแสดงเป็น "Invalid Date"' },
  { re: /^News date missing on migrated$/, th: () => 'วันที่ข่าวหายไป' },
  { re: /^News date differs from original$/, th: () => 'วันที่ข่าวไม่ตรงกับต้นฉบับ' },
  { re: /^News body content missing or too short on migrated /, th: () => 'เนื้อหาข่าวหายหรือสั้นผิดปกติ' },
  { re: /^Content image missing on migrated article$/, th: () => 'รูปประกอบข่าวหายไป' },
  { re: /^Content image differs on migrated article$/, th: () => 'รูปประกอบข่าวคนละรูปกับต้นฉบับ' },
  { re: /^Breadcrumb missing on migrated$/, th: () => 'เส้นทางหน้า (breadcrumb) หายไป' },
  { re: /^Breadcrumb not localized to Thai on migrated$/, th: () => 'เส้นทางหน้า (breadcrumb) ไม่เป็นภาษาไทย' },
  { re: /^Social share buttons missing on migrated$/, th: () => 'ปุ่มแชร์โซเชียลหายไป' },
  // run-report.js fallback det entry
  { re: /^No comparison result found — /, th: () => 'ยังไม่มีผลเปรียบเทียบ — ต้องรัน run-capture และ run-compare ก่อน' },
];

export function describeIssue(issue) {
  const description = issue?.description ?? '';
  for (const { re, th } of RULES) {
    const m = re.exec(description);
    if (m) return th(m);
  }
  return description;
}
```

NOTE: the `—` in the link-targets rule is U+2014 (em dash), exactly as `src/compare/link-targets.js` emits it. Copy the rule strings verbatim from this plan — they were transcribed from the comparators' source.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, full suite green (nothing imports describe.js yet).

- [ ] **Step 5: Commit**

```bash
git add src/report/describe.js test/describe.test.js
git commit -m "feat: Thai render-time issue descriptions (describe.js rule table)"
```

---

### Task 2: `displayValue` URL shortening (html.js)

**Files:**
- Modify: `src/report/html.js` (add export next to `esc`)
- Test: `test/html.test.js` (append)

**Interfaces:**
- Consumes: `esc` (same file).
- Produces: `displayValue(value) → string` (HTML, self-escaped — callers must not re-esc). Known-host URLs (`www.bangkokbank.com` / `prod-aem.bangkokbank.com`, with or without scheme) become `<a href="<full>" title="<raw>" target="_blank" rel="noopener"><path, middle-ellipsized ≥60 chars></a>`; everything else (including unknown-host URLs) is escaped text, unchanged. Mixed values (`<url> → HTTP 404`, `requested: <url>`, `<hostpath> (expected)`) shorten only the URL part.

- [ ] **Step 1: Write the failing tests**

Append to `test/html.test.js` (it already imports from `../src/report/html.js` — add `displayValue` to that import):

```js
test('displayValue shortens known-host URLs to a path anchor with full href/title', () => {
  const html = displayValue('https://prod-aem.bangkokbank.com/th/personal/loans');
  assert.match(html, /<a href="https:\/\/prod-aem\.bangkokbank\.com\/th\/personal\/loans"/);
  assert.match(html, />\/th\/personal\/loans</); // text = path only, host stripped
  assert.match(html, /title="https:\/\/prod-aem\.bangkokbank\.com\/th\/personal\/loans"/);
});

test('displayValue middle-ellipsizes long known-host paths', () => {
  const long = `https://prod-aem.bangkokbank.com/-/media/files/personal/save-and-invest/mutual-funds/announcements/very-long-file-name-2568.pdf`;
  const html = displayValue(long);
  assert.match(html, /…/);
  assert.doesNotMatch(html, />\/-\/media\/files\/personal\/save-and-invest\/mutual-funds\/announcements\/very-long-file-name-2568\.pdf</);
  assert.match(html, new RegExp(`href="${long.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"`)); // full href kept
});

test('displayValue shortens scheme-less host+path keys and keeps suffixes', () => {
  const html = displayValue('prod-aem.bangkokbank.com/th/help-center (expected)');
  assert.match(html, />\/th\/help-center</);
  assert.match(html, /\(expected\)/);
  assert.match(html, /href="https:\/\/prod-aem\.bangkokbank\.com\/th\/help-center"/);
});

test('displayValue shortens only the URL part of mixed status values', () => {
  const html = displayValue('https://prod-aem.bangkokbank.com/th/privacy → HTTP 404');
  assert.match(html, />\/th\/privacy</);
  assert.match(html, /→ HTTP 404/);
});

test('displayValue leaves unknown-host URLs and plain text unchanged (escaped)', () => {
  assert.equal(displayValue('https://y/dead → HTTP 404'), 'https://y/dead → HTTP 404');
  assert.equal(displayValue('กองทุนรวม'), 'กองทุนรวม');
  assert.equal(displayValue('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  assert.equal(displayValue(null), '—');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `displayValue` is not exported.

- [ ] **Step 3: Implement**

In `src/report/html.js`, add below the `esc` export:

```js
const KNOWN_HOSTS = new Set(['www.bangkokbank.com', 'prod-aem.bangkokbank.com']);
const URLISH_RE = /(https?:\/\/[^\s]+|(?:www|prod-aem)\.bangkokbank\.com\/[^\s]+)/g;
const MAX_URL_TEXT = 60;

const midEllipsis = (s) =>
  s.length <= MAX_URL_TEXT ? s : `${s.slice(0, 32)}…${s.slice(-24)}`;

const urlAnchor = (raw) => {
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try { url = new URL(href); } catch { return esc(raw); }
  if (!KNOWN_HOSTS.has(url.hostname)) return esc(raw);
  const text = midEllipsis((url.pathname + url.search) || '/');
  return `<a href="${esc(href)}" title="${esc(raw)}" target="_blank" rel="noopener">${esc(text)}</a>`;
};

// Value-column renderer: shortens known-host URLs to clickable paths, escapes
// everything else. Returns HTML — callers must NOT wrap the result in esc().
export function displayValue(value) {
  const s = String(value ?? '—');
  let out = '';
  let last = 0;
  for (const m of s.matchAll(URLISH_RE)) {
    out += esc(s.slice(last, m.index)) + urlAnchor(m[0]);
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (nothing calls displayValue in renderers yet; the unknown-host case `https://y/dead` hits `urlAnchor` and returns escaped raw — identical output).

- [ ] **Step 5: Commit**

```bash
git add src/report/html.js test/html.test.js
git commit -m "feat: displayValue — shortened clickable paths for known-host URLs"
```

---

### Task 3: Wire describeIssue + displayValue into all render sites

**Files:**
- Modify: `src/report/html.js` (`issueRows`, detail chrome block rows, `renderSystemic` rows)
- Modify: `src/report/chrome.js` (`zoneRows`)
- Test: `test/html.test.js`, `test/report-chrome.test.js` (update two assertions + add wiring tests)

**Interfaces:**
- Consumes: `describeIssue` (Task 1), `displayValue` (Task 2).
- Produces: all four issue-table render sites show `describeIssue(i)` in the description cell and `displayValue(...)` in the original/migrated cells. No signature changes.

- [ ] **Step 1: Write/adjust the failing tests**

Append to `test/html.test.js`:

```js
test('renderDetail renders Thai descriptions and shortened URL values', () => {
  const pair = { id: 'p1', originalUrl: 'https://o', migratedUrl: 'https://m', category: 'c', subCategory: 's' };
  const own = [{
    category: 'broken-link', severity: 'High',
    description: 'Link returns HTTP 404: https://prod-aem.bangkokbank.com/th/privacy',
    location: 'x', original: '—', migrated: 'https://prod-aem.bangkokbank.com/th/privacy → HTTP 404',
  }];
  const html = renderDetail(pair, { status: 'Failed', issues: own, chromeIssues: [] }, own, 0);
  assert.match(html, /ลิงก์เสีย \(HTTP 404\)/);
  assert.doesNotMatch(html, /Link returns HTTP 404/);
  assert.match(html, />\/th\/privacy</); // shortened value anchor
});

test('renderSystemic renders Thai descriptions', () => {
  const systemic = [{
    issue: { category: 'text-language', severity: 'High', description: 'Thai/English balance differs: original 85% Thai vs migrated 40% Thai', original: '85% Thai', migrated: '40% Thai' },
    pageIds: ['p1'], count: 1,
  }];
  const html = renderSystemic(systemic, 1);
  assert.match(html, /สัดส่วนภาษาไทย\/อังกฤษต่างไปจากเดิม/);
  assert.doesNotMatch(html, /balance differs/);
});
```

In `test/report-chrome.test.js`, update lines 77-78 (the cross-zone rendering assertions) from `/Chrome label rendered in English/` to the Thai rendering:

```js
  assert.match(headerSection, /เมนู\/ข้อความส่วนกลางแสดงเป็นภาษาอังกฤษ/);
  assert.match(footerSection, /เมนู\/ข้อความส่วนกลางแสดงเป็นภาษาอังกฤษ/);
```

(The escaping test at report-chrome.test.js:59 — `doesNotMatch /<b>x<\/b>/` — must keep passing: `displayValue('<b>x</b>')` escapes it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — the two new html tests (English still rendered) and the two updated report-chrome assertions (Thai not rendered yet).

- [ ] **Step 3: Implement**

In `src/report/html.js`:

Add the import at the top:

```js
import { describeIssue } from './describe.js';
```

In `issueRows`, replace the description and value cells:

```js
const issueRows = (items) => items.map((i) => `
    <tr class="sev-${esc(i.severity)}">
      <td>${esc(sevText(i.severity))}</td><td>${esc(describeIssue(i))}</td>
      <td class="val val-orig">${displayValue(i.original ?? '—')}${thumb(i.originalSrc)}</td>
      <td class="val val-mig">${displayValue(i.migrated ?? '—')}${thumb(i.migratedSrc)}</td>
      <td>${esc(i.location)}${i.region ? ` <span class="chip region-tag">${esc(regionText(i.region))}</span>` : ''}</td>
    </tr>`).join('');
```

In `renderDetail`'s `chromeRows`, apply the same substitutions:

```js
      <td>${esc(describeIssue(i))}</td>
      <td class="val val-orig">${displayValue(i.original ?? '—')}</td>
      <td class="val val-mig">${displayValue(i.migrated ?? '—')}</td>
```

In `renderSystemic`'s row template, replace the description/original/migrated cells the same way:

```js
      <td>${esc(sevText(s.issue.severity))}</td><td>${esc(describeIssue(s.issue))}</td>
      <td class="val val-orig">${displayValue(s.issue.original ?? '—')}</td>
      <td class="val val-mig">${displayValue(s.issue.migrated ?? '—')}</td>
```

In `src/report/chrome.js`:

Add imports (extend the existing `./html.js` import and add describe):

```js
import { esc, CSS, displayValue } from './html.js';
import { describeIssue } from './describe.js';
```

In `zoneRows`, replace the description/original/migrated cells:

```js
      <td>${esc(describeIssue(issue))}</td>
      <td class="val val-orig">${displayValue(issue.original ?? '—')}</td>
      <td class="val val-mig">${displayValue(issue.migrated ?? '—')}</td>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, full suite green. Custom fixture descriptions in older tests (e.g. 'dead link A', 'English label') pass through `describeIssue` unchanged, so their assertions hold.

- [ ] **Step 5: Commit**

```bash
git add src/report/html.js src/report/chrome.js test/html.test.js test/report-chrome.test.js
git commit -m "feat: render Thai descriptions and shortened values in all issue tables"
```

---

### Task 4: chrome.html broken-link grouping by HTTP status

**Files:**
- Modify: `src/report/chrome.js` (`renderChrome`)
- Test: `test/report-chrome.test.js` (append)

**Interfaces:**
- Consumes: `zoneRows` (existing, Task 3-updated), aggregation entries `{issue, count, pageIds}`.
- Produces: per zone, non-broken-link entries keep the current main table; broken-link entries render as collapsed `<details class="cat">` groups keyed by HTTP status parsed from `issue.migrated` (`→ HTTP <n>` → `HTTP <n>`, `→ unreachable` → `เข้าไม่ถึง`, else `อื่น ๆ`), summary `ลิงก์เสีย (<status>)` + count chip, full row table inside. No entry lost.

- [ ] **Step 1: Write the failing tests**

Append to `test/report-chrome.test.js`:

```js
const brokenIssue = (url, status, zone = 'header-nav') => ({
  category: 'broken-link', severity: 'High', zone,
  description: `Link returns HTTP ${status}: ${url}`,
  location: url, original: '—', migrated: `${url} → HTTP ${status}`,
});

test('renderChrome collapses broken-link entries into per-status groups', () => {
  const chromeIssues = [
    brokenIssue('https://prod-aem.bangkokbank.com/th/a', 404),
    brokenIssue('https://prod-aem.bangkokbank.com/th/b', 404),
    brokenIssue('https://prod-aem.bangkokbank.com/th/c', 403),
    issue(), // non-broken text-language entry stays in the main table
  ];
  const html = renderChrome(aggregateChrome([result('p1', chromeIssues)]));
  assert.match(html, /ลิงก์เสีย \(HTTP 404\)[\s\S]*?2/); // group summary with count
  assert.match(html, /ลิงก์เสีย \(HTTP 403\)/);
  // groups are collapsed details WITHOUT open
  assert.match(html, /<details class="cat">\s*<summary>ลิงก์เสีย/);
  // all three broken URLs still present inside groups
  for (const p of ['\\/th\\/a', '\\/th\\/b', '\\/th\\/c']) assert.match(html, new RegExp(p));
  // the non-broken entry still renders in the zone's main table
  assert.match(html, /เมนู\/ข้อความส่วนกลางแสดงเป็นภาษาอังกฤษ/);
});

test('renderChrome groups unreachable links separately', () => {
  const chromeIssues = [{
    category: 'broken-link', severity: 'Medium', zone: 'footer',
    description: 'Link unreachable (fetch failed): https://prod-aem.bangkokbank.com/th/x',
    location: 'x', original: '—', migrated: 'https://prod-aem.bangkokbank.com/th/x → unreachable',
  }];
  const html = renderChrome(aggregateChrome([result('p1', chromeIssues)]));
  assert.match(html, /ลิงก์เสีย \(เข้าไม่ถึง\)/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — no grouping markup yet (broken-link rows render in the flat main table).

- [ ] **Step 3: Implement**

In `src/report/chrome.js`, add above `renderChrome`:

```js
const brokenStatusLabel = (entry) => {
  const migrated = entry.issue.migrated ?? '';
  const m = /→ HTTP (\d+)/.exec(migrated);
  if (m) return `HTTP ${m[1]}`;
  if (/→ unreachable/.test(migrated)) return 'เข้าไม่ถึง';
  return 'อื่น ๆ';
};

const brokenGroups = (entries, comparableCount) => {
  const byStatus = new Map();
  for (const e of entries) {
    const label = brokenStatusLabel(e);
    byStatus.set(label, [...(byStatus.get(label) ?? []), e]);
  }
  return [...byStatus.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, group]) => `
<details class="cat">
  <summary>ลิงก์เสีย (${esc(label)}) <span class="chip chip-count">${group.length} ลิงก์</span></summary>
  <table><tr><th>${th('Category')}</th><th>${th('Severity')}</th><th>${th('Description')}</th><th>${th('Original')}</th><th>${th('Migrated')}</th><th>${th('Found on')}</th><th>${th('Examples')}</th></tr>${zoneRows(group, comparableCount)}</table>
</details>`).join('');
};
```

In `renderChrome`, change the per-zone section body to split entries:

```js
  const sections = CHROME_ZONES.map((zone) => {
    const entries = agg.entries.filter((e) => (e.issue.zone ?? 'header-nav') === zone);
    const broken = entries.filter((e) => e.issue.category === 'broken-link');
    const rest = entries.filter((e) => e.issue.category !== 'broken-link');
    const table = rest.length
      ? `<table><tr><th>${th('Category')}</th><th>${th('Severity')}</th><th>${th('Description')}</th><th>${th('Original')}</th><th>${th('Migrated')}</th><th>${th('Found on')}</th><th>${th('Examples')}</th></tr>${zoneRows(rest, agg.comparableCount)}</table>`
      : `<p class="muted">ไม่พบปัญหาในโซนนี้</p>`;
    return `<h2>${esc(ZONE_LABEL[zone] ?? zone)}</h2>${statStrip(agg.statsByZone[zone] ?? { orig: 0, mig: 0, matched: 0, missing: 0 })}${table}${brokenGroups(broken, agg.comparableCount)}`;
  }).join('\n');
```

(Adjust to the file's actual local names if they drifted — the existing helpers are `zoneRows(entries, comparableCount)`, `statStrip(stats)`, `th(key)`; the empty-zone message shows only when `rest` is empty, matching current behavior for non-broken content.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, full suite green (existing renderChrome tests use non-broken categories and keep matching the main table).

- [ ] **Step 5: Commit**

```bash
git add src/report/chrome.js test/report-chrome.test.js
git commit -m "feat: collapse chrome broken-link entries into per-status groups"
```

---

### Task 5: Real-data validation + docs

**Files:**
- Create: `scripts/describe-coverage.py`
- Modify: `CLAUDE.md` (one line), `docs/superpowers/specs/2026-07-04-readable-report-details-design.md` (status line)
- No comparator changes. NEVER run run-capture.

- [ ] **Step 1: Write the coverage script**

Create `scripts/describe-coverage.py`:

```python
#!/usr/bin/env python3
"""Measure describeIssue rule coverage against real det JSON.

Runs every distinct description in output/issues/det/ through
src/report/describe.js (via a node one-liner) and reports the untranslated
remainder. Acceptance: 0 untranslated among patterns the CURRENT comparators
emit (stale patterns from old JSON may remain and are listed for review).
"""
import json, glob, subprocess, sys

descs = set()
for f in glob.glob('output/issues/det/*.json'):
    d = json.load(open(f))
    for i in (d.get('issues') or []) + (d.get('chromeIssues') or []):
        descs.add(i.get('description', ''))

node = subprocess.run(
    ['node', '--input-type=module', '-e',
     'import { describeIssue } from "./src/report/describe.js";'
     'import fs from "node:fs";'
     'const ds = JSON.parse(fs.readFileSync(0, "utf8"));'
     'process.stdout.write(JSON.stringify(ds.filter(d => describeIssue({description: d}) === d)));'],
    input=json.dumps(sorted(descs)), capture_output=True, text=True, check=True)

untranslated = json.loads(node.stdout)
print(f'distinct descriptions: {len(descs)}, untranslated: {len(untranslated)}')
for d in untranslated[:30]:
    print('  MISS |', d[:110])
sys.exit(0 if not untranslated else 1)
```

- [ ] **Step 2: Run coverage against real data**

Run: `python3 scripts/describe-coverage.py`
Expected: `untranslated: 0` → exit 0. If misses appear: AI-review descriptions (free-form, from output/issues/ai/) are acceptable misses — they are intentionally fallback-rendered; adjust the script conclusion accordingly in your report. A miss that comes from a comparator template means a rule regex is wrong — fix the rule in `src/report/describe.js` (and its test) until comparator-emitted patterns all match.

- [ ] **Step 3: Regenerate and inspect the report**

Run: `node src/run-report.js` (render only — no re-compare needed)
Then verify:
- `grep -c "ลิงก์เสีย (HTTP" output/report/news-and-media-articles/chrome.html` → > 0 (grouped summaries present)
- `grep -c "Link returns HTTP" output/report/news-and-media-articles/chrome.html` → 0 (no English descriptions remain)
- Open one Failed detail page and chrome.html via `python3 -m http.server` in `output/` (or grep-verify and note that visual browsing is left to the human).

- [ ] **Step 4: Update docs**

- `CLAUDE.md`, section "## Report rendering (src/report/)", add one line:
  `- Issue descriptions are translated to Thai at RENDER time by src/report/describe.js (regex rules over the comparators' English strings; unmatched → English fallback). When adding a comparator check, add a describe.js rule + test; python3 scripts/describe-coverage.py measures real-data coverage. Value columns shorten known-host URLs via displayValue (html.js) — it returns HTML, never re-esc it.`
- Spec status line: `**Status:** Draft (awaiting review)` → `**Status:** Implemented (2026-07-04)`.

- [ ] **Step 5: Full suite + commit**

Run: `npm test`
Expected: PASS.

```bash
git add scripts/describe-coverage.py CLAUDE.md docs/superpowers/specs/2026-07-04-readable-report-details-design.md
git commit -m "docs: describe.js coverage script and render-time translation contract"
```

---

## Post-plan notes for the executor

- Everything here is render-layer: after any of Tasks 1–4, `node src/run-report.js` alone refreshes output/report/ — never run run-capture, never re-run run-compare (comparators untouched).
- `output/issues/ai/` descriptions are free-form (possibly already Thai) — they hit the describeIssue fallback by design.
- The exact English rule strings in Task 1 were transcribed from the comparators' source at plan time; if a regex fails to match in Task 5's coverage run, trust the comparator source over the plan and fix the rule.
