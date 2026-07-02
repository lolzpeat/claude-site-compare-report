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
  assert.match(html, /Failed/);
  assert.match(html, /broken-link/);
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
  assert.match(html, /1 High/);
  assert.match(html, /1 Medium/);
});

test('groups with High issues are open and ordered first; High rows sort above Medium', () => {
  const html = renderDetail(pair, multiResult, multiResult.issues, 0);
  const brokenAt = html.indexOf('broken-link');
  const imageAt = html.indexOf('image-ratio');
  assert.ok(brokenAt !== -1 && brokenAt < imageAt, 'High-bearing group listed first');
  assert.ok(html.includes('<details class="cat" open>'), 'High-bearing group open by default');
  assert.ok(html.includes('<details class="cat">'), 'Medium-only group collapsed');
  assert.ok(html.indexOf('dead link A') < html.indexOf('dead link B'), 'High severity row sorts first within group');
});

test('index renders per-category count chips', () => {
  const html = renderIndex([{ pair, result: multiResult, own: multiResult.issues, systemicHits: 0 }], 0);
  assert.match(html, /broken-link: 2/);
  assert.match(html, /image-ratio: 1/);
});

test('detail renders Original and Migrated value columns', () => {
  const html = renderDetail(pair, multiResult, multiResult.issues, 0);
  assert.match(html, /<th>Original<\/th><th>Migrated<\/th>/);
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
  assert.match(html, /38 site-wide/);
  assert.match(html, /systemic\.html/);
});

test('detail rows show the issue region as a badge', () => {
  const own = [{ category: 'layout', severity: 'High', description: 'hero', location: 'hero', region: 'main' }];
  const html = renderDetail(pair, { ...result, status: 'Failed' }, own, 0);
  assert.match(html, /region-tag/);
  assert.match(html, />main</);
});

test('index shows Own and Site-wide columns and links to the systemic page', () => {
  const rows = [{ pair, result, own: result.issues, systemicHits: 38 }];
  const html = renderIndex(rows, 40);
  assert.match(html, /systemic\.html/);
  assert.match(html, /Own/);
  assert.match(html, /Site-wide/);
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
