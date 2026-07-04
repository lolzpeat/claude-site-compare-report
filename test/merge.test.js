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
  const merged = mergeIssues(det, null);
  assert.equal(merged.pairId, det.pairId);
  assert.equal(merged.status, det.status);
  assert.deepEqual(merged.issues, det.issues);
  assert.deepEqual(merged.chromeIssues, []);
  assert.deepEqual(merged.chromeStats, []);
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

test('mergeIssues passes chromeIssues/chromeStats through, defaulting to empty', () => {
  const chromeIssue = { category: 'menu-label', severity: 'Medium', zone: 'footer', description: 'd' };
  const merged = mergeIssues(
    { pairId: 'p', status: 'Passed', issues: [], chromeIssues: [chromeIssue], chromeStats: [{ zone: 'footer', orig: 1, mig: 1, matched: 1, missing: 0 }] },
    null,
  );
  assert.deepEqual(merged.chromeIssues, [chromeIssue]);
  assert.equal(merged.chromeStats.length, 1);

  const legacy = mergeIssues({ pairId: 'p', status: 'Passed', issues: [] }, null);
  assert.deepEqual(legacy.chromeIssues, []);
  assert.deepEqual(legacy.chromeStats, []);
});

test('AI issues still merge into page issues only, never chrome', () => {
  const merged = mergeIssues(
    { pairId: 'p', status: 'Passed', issues: [], chromeIssues: [], chromeStats: [] },
    { issues: [{ category: 'layout', severity: 'High', description: 'x', location: 'l' }] },
  );
  assert.equal(merged.status, 'Failed');
  assert.equal(merged.issues.length, 1);
  assert.deepEqual(merged.chromeIssues, []);
});
