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
  const csv = renderSheetCsv([{ pair, result }]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'originalUrl,validationStatus,openIssues');
  assert.match(lines[1], /^"https:\/\/x\/o\?id=1&tag=New",Failed,"3 issues: 2 broken-link, 1 image-ratio"$/);
});

test('passed page has empty openIssues', () => {
  const result = { pairId: 'a', status: 'Passed', issues: [] };
  const csv = renderSheetCsv([{ pair, result }]);
  assert.match(csv.trim().split('\n')[1], /,Passed,""$/);
});

test('escapes double quotes in values', () => {
  const result = { pairId: 'a', status: 'Capture Failed', issues: [] };
  const p = { ...pair, originalUrl: 'https://x/"q"' };
  const csv = renderSheetCsv([{ pair: p, result }]);
  assert.ok(csv.includes('"https://x/""q"""'));
});
