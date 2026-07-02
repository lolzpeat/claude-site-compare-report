import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeIssues } from '../src/report/merge.js';

const issue = (category, description = 'd') => ({ category, severity: 'Medium', description, location: 'x' });

test('merges AI issues into deterministic result and recomputes status', () => {
  const det = { pairId: 'a', status: 'Passed', issues: [] };
  const ai = { pairId: 'a', issues: [issue('layout', 'hero misaligned')] };
  const merged = mergeIssues(det, ai);
  assert.equal(merged.status, 'Failed');
  assert.equal(merged.issues.length, 1);
});

test('null AI review leaves deterministic result unchanged', () => {
  const det = { pairId: 'a', status: 'Failed', issues: [issue('broken-link')] };
  assert.deepEqual(mergeIssues(det, null), det);
});

test('Capture Failed status is never overwritten', () => {
  const det = { pairId: 'a', status: 'Capture Failed', issues: [issue('capture-failure')] };
  const merged = mergeIssues(det, { pairId: 'a', issues: [issue('layout')] });
  assert.equal(merged.status, 'Capture Failed');
});

test('Not Migrated and Retired on Original statuses are sticky', () => {
  const nm = mergeIssues({ pairId: 'a', status: 'Not Migrated', issues: [issue('broken-link')] }, { pairId: 'a', issues: [issue('layout')] });
  assert.equal(nm.status, 'Not Migrated');
  const ro = mergeIssues({ pairId: 'b', status: 'Retired on Original', issues: [issue('broken-link')] }, null);
  assert.equal(ro.status, 'Retired on Original');
});
