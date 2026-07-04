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
