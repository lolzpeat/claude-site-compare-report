import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderIndex, renderDetail, renderSystemic } from '../src/report/html.js';

const pair = { id: 'my-home', originalUrl: 'https://x/o', migratedUrl: 'https://y/m', category: 'Personal', subCategory: 'My Home' };
const result = {
  pairId: 'my-home', status: 'Failed',
  issues: [{ category: 'broken-link', severity: 'High', description: 'Link returns HTTP 404: https://y/dead', location: 'สมัคร' }],
};

test('index lists each pair with status and issue counts, linking to detail', () => {
  const html = renderIndex([{ pair, result, own: result.issues, systemicHits: 0 }], 0);
  assert.match(html, /my-home\.html/);
  assert.match(html, /ไม่ผ่าน/);       // status Failed → Thai display
  assert.match(html, /ลิงก์เสีย/);      // broken-link category → Thai display
});

test('index escapes HTML in data', () => {
  const bad = { ...pair, subCategory: '<script>x</script>' };
  const html = renderIndex([{ pair: bad, result, own: result.issues, systemicHits: 0 }], 0);
  assert.ok(!html.includes('<script>x</script>'));
});

test('detail shows side-by-side screenshots and the issue list', () => {
  const html = renderDetail(pair, result, result.issues, 0);
  assert.match(html, /\.\.\/shots\/my-home-orig\.png/);
  assert.match(html, /\.\.\/shots\/my-home-mig\.png/);
  assert.match(html, /HTTP 404/);
  assert.match(html, /High/);
});

const multiResult = {
  pairId: 'my-home', status: 'Failed',
  issues: [
    { category: 'image-ratio', severity: 'Medium', description: 'squashed hero', location: 'hero', original: '1.778', migrated: '1.600' },
    { category: 'broken-link', severity: 'Medium', description: 'dead link B', location: 'footer' },
    { category: 'broken-link', severity: 'High', description: 'dead link A', location: 'nav' },
  ],
};

test('detail groups issues into one collapsible section per category', () => {
  const html = renderDetail(pair, multiResult, multiResult.issues, 0);
  assert.equal((html.match(/<details class="cat"/g) || []).length, 2);
  assert.ok(html.includes('<span class="chip chip-count">2</span>'), 'broken-link group shows count chip');
  assert.match(html, /1 สูง/);
  assert.match(html, /1 ปานกลาง/);
});

test('groups with High issues are open and ordered first; High rows sort above Medium', () => {
  const html = renderDetail(pair, multiResult, multiResult.issues, 0);
  const brokenAt = html.indexOf('ลิงก์เสีย');
  const imageAt = html.indexOf('สัดส่วนรูปภาพ');
  assert.ok(brokenAt !== -1 && brokenAt < imageAt, 'High-bearing group listed first');
  assert.ok(html.includes('<details class="cat" open>'), 'High-bearing group open by default');
  assert.ok(html.includes('<details class="cat">'), 'Medium-only group collapsed');
  assert.ok(html.indexOf('dead link A') < html.indexOf('dead link B'), 'High severity row sorts first within group');
});

test('index renders per-category count chips', () => {
  const html = renderIndex([{ pair, result: multiResult, own: multiResult.issues, systemicHits: 0 }], 0);
  assert.match(html, /ลิงก์เสีย: 2/);
  assert.match(html, /สัดส่วนรูปภาพ: 1/);
});

test('detail renders Original and Migrated value columns', () => {
  const html = renderDetail(pair, multiResult, multiResult.issues, 0);
  assert.match(html, /<th>ต้นฉบับ<\/th><th>เว็บที่ย้าย<\/th>/);
  assert.match(html, /1\.778/);
  assert.match(html, /1\.600/);
});

test('detail shows an em-dash when an issue has no original/migrated values', () => {
  const html = renderDetail(pair, multiResult, multiResult.issues, 0);
  // the two broken-link rows have no original/migrated → cells fall back to —
  assert.ok(html.includes('<td class="val val-orig">—</td>'));
});

test('detail renders only own issues plus a site-wide reference line', () => {
  const own = [{ category: 'layout', severity: 'High', description: 'hero missing', location: 'hero', original: 'title present', migrated: 'blank' }];
  const html = renderDetail(pair, { ...result, status: 'Failed' }, own, 38);
  assert.match(html, /hero missing/);
  assert.match(html, /38 ปัญหาระดับทั้งเว็บ/);
  assert.match(html, /systemic\.html/);
});

test('detail rows show the issue region as a badge', () => {
  const own = [{ category: 'layout', severity: 'High', description: 'hero', location: 'hero', region: 'main' }];
  const html = renderDetail(pair, { ...result, status: 'Failed' }, own, 0);
  assert.match(html, /region-tag/);
  assert.match(html, />เนื้อหาหลัก</);
});

test('index shows Own and Site-wide columns and links to the systemic page', () => {
  const rows = [{ pair, result, own: result.issues, systemicHits: 38 }];
  const html = renderIndex(rows, 40);
  assert.match(html, /systemic\.html/);
  assert.match(html, /เฉพาะหน้า/);
  assert.match(html, /ทั้งเว็บ/);
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

test('display labels are Thai while CSS classes / contract values stay English', () => {
  const own = [{ category: 'image-ratio', severity: 'High', description: 'd', location: 'hero', region: 'header' }];
  const html = renderDetail(pair, { ...result, status: 'Not Migrated' }, own, 0);
  // Thai display text
  assert.match(html, /สัดส่วนรูปภาพ/);   // category
  assert.match(html, /ยังไม่ย้าย/);       // status
  assert.match(html, />สูง</);            // severity cell
  assert.match(html, /ส่วนหัว/);          // region badge
  // English CSS classes / contract values preserved
  assert.match(html, /class="sev-High"/);
  assert.match(html, /class="chip region-tag"/);
  assert.match(html, /class="Not"/);       // status class from split(' ')[0]
});

test('an unmapped enum value falls back to its raw string', () => {
  const own = [{ category: 'brand-new-cat', severity: 'Critical', description: 'd', location: 'x' }];
  const html = renderDetail(pair, { ...result, status: 'Failed' }, own, 0);
  assert.match(html, /brand-new-cat/);   // unknown category → raw
  assert.match(html, />Critical</);      // unknown severity → raw
});

test('index links to the criteria page', () => {
  const html = renderIndex([{ pair, result, own: result.issues, systemicHits: 0 }], 0);
  assert.match(html, /criteria\.html/);
  assert.match(html, /เกณฑ์การตรวจสอบ/);
});

test('index renders the toolbar controls (search, filters, limit, clear, pager)', () => {
  const html = renderIndex([{ pair, result: multiResult, own: multiResult.issues, systemicHits: 0 }], 0);
  assert.match(html, /id="q"[^>]*type="search"/);
  assert.match(html, /id="f-status"/);
  assert.match(html, /id="f-cat"/);
  assert.match(html, /id="f-limit"/);
  assert.match(html, /id="f-clear"/);
  assert.match(html, /id="pager"/);
  assert.match(html, /ล้างตัวกรอง/);
});

test('index rows carry the sheet sequence number and filter/sort data attributes', () => {
  const rows = [
    { pair, result, own: result.issues, systemicHits: 3 },
    { pair: { ...pair, id: 'second-page' }, result: { ...result, status: 'Passed' }, own: [], systemicHits: 0 },
  ];
  const html = renderIndex(rows, 0);
  // sequence from sheet order
  assert.match(html, /data-seq="1"[\s\S]*data-seq="2"/);
  // status rail class + filter/search data on the first row
  assert.match(html, /class="row r-Failed"/);
  assert.match(html, /data-status="Failed"/);
  assert.match(html, /data-search="my-home/);
  // numeric counts feed sortable columns
  assert.match(html, /data-own="1"/);
  assert.match(html, /data-sys="3"/);
});

test('index has sortable ledger headers and clickable status stat chips', () => {
  const html = renderIndex([{ pair, result, own: result.issues, systemicHits: 0 }], 0);
  assert.match(html, /<th data-key="seq"[^>]*aria-sort="ascending"/);
  assert.match(html, /<th data-key="own"/);
  assert.match(html, /<button type="button" class="stat b-Failed" data-status="Failed">/);
});
