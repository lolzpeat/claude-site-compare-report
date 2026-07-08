import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeIssuesThai } from '../src/report/sheet-summary.js';

test('empty issues gives empty string', () => {
  assert.equal(summarizeIssuesThai([]), '');
  assert.equal(summarizeIssuesThai(undefined), '');
});

test('counts by category, sorted descending, with Thai labels', () => {
  const issues = [
    { category: 'broken-link', severity: 'High', description: 'd' },
    { category: 'broken-link', severity: 'Medium', description: 'd' },
    { category: 'news-element', severity: 'Low', description: 'd' },
  ];
  assert.equal(summarizeIssuesThai(issues), '3 ปัญหา: 2 ลิงก์เสีย, 1 องค์ประกอบข่าว');
});

test('falls back to the raw category key when no Thai label exists', () => {
  const issues = [{ category: 'made-up-category', severity: 'Low', description: 'd' }];
  assert.equal(summarizeIssuesThai(issues), '1 ปัญหา: 1 made-up-category');
});
