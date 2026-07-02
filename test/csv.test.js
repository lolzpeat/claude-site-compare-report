import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSheetCsv } from '../src/report/csv.js';

const pair = { id: 'a', originalUrl: 'https://x/o?id=1&tag=New', migratedUrl: 'https://y/m', category: 'C', subCategory: 'S' };

test('renders header and one row per pair with issue summary', () => {
  const result = {
    pairId: 'a', status: 'Failed',
    issues: [
      { category: 'broken-link', severity: 'High', description: 'd', location: 'l' },
      { category: 'broken-link', severity: 'Medium', description: 'd', location: 'l' },
      { category: 'image-ratio', severity: 'Medium', description: 'd', location: 'l' },
    ],
  };
  const own = [
    { category: 'broken-link', severity: 'High', description: 'd', location: 'l' },
    { category: 'broken-link', severity: 'Medium', description: 'd', location: 'l' },
    { category: 'image-ratio', severity: 'Medium', description: 'd', location: 'l' },
  ];
  const csv = renderSheetCsv([{ pair, result, own, systemicHits: 0 }]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'originalUrl,validationStatus,openIssues');
  assert.match(lines[1], /^"https:\/\/x\/o\?id=1&tag=New",Failed,"3 own issues: 2 broken-link, 1 image-ratio"$/);
});

test('passed page has empty openIssues', () => {
  const result = { pairId: 'a', status: 'Passed', issues: [] };
  const csv = renderSheetCsv([{ pair, result, own: [], systemicHits: 0 }]);
  assert.match(csv.trim().split('\n')[1], /,Passed,""$/);
});

test('escapes double quotes in values', () => {
  const result = { pairId: 'a', status: 'Capture Failed', issues: [] };
  const p = { ...pair, originalUrl: 'https://x/"q"' };
  const csv = renderSheetCsv([{ pair: p, result, own: [], systemicHits: 0 }]);
  assert.ok(csv.includes('"https://x/""q"""'));
});

test('summary splits own issues from site-wide count', () => {
  const result = { pairId: 'a', status: 'Failed', issues: [] };
  const own = [
    { category: 'missing-module', severity: 'High', description: 'd', location: 'l' },
    { category: 'layout', severity: 'Medium', description: 'd', location: 'l' },
  ];
  const csv = renderSheetCsv([{ pair, result, own, systemicHits: 38 }]);
  assert.match(csv, /2 own issues: 1 missing-module, 1 layout \(\+38 site-wide\)/);
});

test('Not Migrated and Retired on Original carry fixed summaries', () => {
  const nm = renderSheetCsv([{ pair, result: { pairId: 'a', status: 'Not Migrated', issues: [] }, own: [], systemicHits: 0 }]);
  assert.match(nm, /,Not Migrated,"Migrated URL serves a 404 page"/);
  const ro = renderSheetCsv([{ pair, result: { pairId: 'a', status: 'Retired on Original', issues: [] }, own: [], systemicHits: 0 }]);
  assert.match(ro, /,Retired on Original,"Original URL serves a 404 page \(offering retired\?\)"/);
});

test('a clean page with only site-wide issues shows the site-wide count', () => {
  const csv = renderSheetCsv([{ pair, result: { pairId: 'a', status: 'Failed', issues: [] }, own: [], systemicHits: 12 }]);
  assert.match(csv, /,Failed,"0 own issues \(\+12 site-wide\)"/);
});
