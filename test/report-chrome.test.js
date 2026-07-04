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

test('identical issues in different zones stay separate entries and render under both zones', () => {
  const agg = aggregateChrome([
    result('p1', [issue({ zone: 'header-nav' })]),
    result('p2', [issue({ zone: 'footer' })]),
  ]);
  assert.equal(agg.entries.length, 2);
  assert.deepEqual(agg.entries.map((e) => e.count), [1, 1]);
  assert.deepEqual(agg.entries.map((e) => e.issue.zone).sort(), ['footer', 'header-nav']);

  const html = renderChrome(agg);
  // The same defect must appear in BOTH zone sections of the rendered page.
  const headerStart = html.indexOf('ส่วนหัว/เมนูหลัก');
  const footerStart = html.indexOf('<h2>ส่วนท้าย');
  const headerSection = html.slice(headerStart, footerStart);
  const footerSection = html.slice(footerStart);
  assert.match(headerSection, /เมนู\/ข้อความส่วนกลางแสดงเป็นภาษาอังกฤษ/);
  assert.match(footerSection, /เมนู\/ข้อความส่วนกลางแสดงเป็นภาษาอังกฤษ/);
});

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

test('broken-only zone renders groups without the empty-zone message; empty zone still shows it', () => {
  const chromeIssues = [
    brokenIssue('https://prod-aem.bangkokbank.com/th/a', 404, 'footer'),
    brokenIssue('https://prod-aem.bangkokbank.com/th/b', 403, 'footer'),
  ];
  const html = renderChrome(aggregateChrome([result('p1', chromeIssues)]));
  const footerStart = html.indexOf('<h2>ส่วนท้าย');
  const headerSection = html.slice(0, footerStart);
  const footerSection = html.slice(footerStart);
  // footer has only broken-link entries: groups render, no contradicting empty message
  assert.doesNotMatch(footerSection, /ไม่พบปัญหาในโซนนี้/);
  assert.match(footerSection, /ลิงก์เสีย \(HTTP/);
  // header-nav has zero entries: the empty message still shows
  assert.match(headerSection, /ไม่พบปัญหาในโซนนี้/);
});

test('broken-link entries with unparseable migrated value fall back to the อื่น ๆ group', () => {
  const chromeIssues = [{
    category: 'broken-link', severity: 'Medium', zone: 'header-nav',
    description: 'Broken link: https://prod-aem.bangkokbank.com/th/x',
    location: 'x', original: '—', migrated: 'https://prod-aem.bangkokbank.com/th/x',
  }];
  const html = renderChrome(aggregateChrome([result('p1', chromeIssues)]));
  assert.match(html, /ลิงก์เสีย \(อื่น ๆ\)/);
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
