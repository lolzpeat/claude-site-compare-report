import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateIssues, issueKey, countSystemicHits } from '../src/report/systemic.js';

const iss = (category, over = {}) => ({ category, severity: 'High', description: 'd', location: 'l', ...over });
const page = (pairId, issues, status = 'Failed') => ({ pairId, status, issues });

// a chrome issue with identical original/migrated values, shared across pages
const chrome = () => iss('text-language', { description: 'x', original: '"นักลงทุนสัมพันธ์"', migrated: '(not found)' });

test('an issue on >= SYSTEMIC_THRESHOLD of comparable pages is systemic; a one-off is own', () => {
  const shared = chrome();
  const results = [
    page('a', [shared, iss('layout', { description: 'a-only' })]),
    page('b', [chrome()]),
    page('c', [chrome()]),
    page('d', []),
  ];
  const { systemic, own } = aggregateIssues(results);
  assert.equal(systemic.length, 1);                       // chrome issue on 3/4 = 0.75
  assert.equal(systemic[0].count, 3);
  assert.deepEqual(systemic[0].pageIds, ['a', 'b', 'c']);
  assert.equal(own.get('a').length, 1);                    // only the a-only layout issue
  assert.equal(own.get('a')[0].description, 'a-only');
  assert.equal(own.get('b').length, 0);
});

test('nothing is systemic below the minimum comparable-page floor', () => {
  const results = [page('a', [chrome()]), page('b', [chrome()])]; // N=2 < 3
  const { systemic, own } = aggregateIssues(results);
  assert.equal(systemic.length, 0);
  assert.equal(own.get('a').length, 1);
});

test('404 / capture-failed pages are excluded from the denominator and keep their issues as own', () => {
  const results = [
    page('a', [chrome()]), page('b', [chrome()]), page('c', [chrome()]),
    page('d', [iss('broken-link', { description: '404' })], 'Not Migrated'),
  ];
  const { systemic, own } = aggregateIssues(results);
  assert.equal(systemic[0].count, 3);                      // denominator is 3 comparable, not 4
  assert.equal(own.get('d').length, 1);                    // 404 verdict stays own
});

test('issues without original/migrated dedupe by normalized description', () => {
  const ai = (desc) => iss('layout', { description: desc, original: undefined, migrated: undefined });
  const results = [page('a', [ai('Hero  overlay missing')]), page('b', [ai('hero overlay missing')]), page('c', [ai('HERO OVERLAY MISSING')])];
  const { systemic } = aggregateIssues(results);
  assert.equal(systemic.length, 0); // description key is case/space-normalized but NOT case-folded → see note
});

test('countSystemicHits counts distinct systemic keys, not instances', () => {
  const dup = { category: 'broken-link', severity: 'High', description: 'd', original: '—', migrated: 'u' };
  const keys = new Set([issueKey(dup)]);
  // same issue appearing 3 times counts once; a non-systemic issue is ignored
  const issues = [dup, { ...dup }, { ...dup }, { category: 'layout', severity: 'Low', description: 'other', original: undefined, migrated: undefined }];
  assert.equal(countSystemicHits(issues, keys), 1);
});

test('countSystemicHits never exceeds the number of systemic keys', () => {
  const a = { category: 'text-language', severity: 'High', description: 'x', original: 'Thai', migrated: 'English' };
  const keys = new Set([issueKey(a)]);
  assert.ok(countSystemicHits([a, { ...a }], keys) <= keys.size);
});

test('issueKey prefers keyHint over original/migrated values', () => {
  const a = { category: 'broken-link', severity: 'High', description: 'd1', original: '114 links', migrated: '114 missing', keyHint: 'links-summary' };
  const b = { category: 'broken-link', severity: 'High', description: 'd2', original: '9 links', migrated: '9 missing', keyHint: 'links-summary' };
  assert.equal(issueKey(a), 'broken-link|links-summary');
  assert.equal(issueKey(a), issueKey(b)); // different counts, same key → dedupe
});

test('summary issues with a shared keyHint dedupe into one systemic entry despite differing counts', () => {
  const summary = (n) => ({ category: 'broken-link', severity: 'High', description: `${n} missing`, original: `${n} links`, migrated: `${n} missing`, keyHint: 'links-summary' });
  const results = [page('a', [summary(50)]), page('b', [summary(9)]), page('c', [summary(114)])];
  const { systemic, own } = aggregateIssues(results);
  assert.equal(systemic.length, 1);      // 3/3 pages, one key
  assert.equal(systemic[0].count, 3);
  assert.equal(own.get('a').length, 0);
});

test('threshold is 0.5: an issue on exactly half of comparable pages is systemic', () => {
  const shared = () => ({ category: 'layout', severity: 'Medium', description: 'x', original: 'A', migrated: 'B' });
  // 2 of 4 comparable = 0.5 → systemic; the 1-of-4 issue stays own
  const results = [
    page('a', [shared(), { category: 'layout', severity: 'Low', description: 'a-only', original: undefined, migrated: undefined }]),
    page('b', [shared()]),
    page('c', []),
    page('d', []),
  ];
  const { systemic } = aggregateIssues(results);
  assert.equal(systemic.length, 1);
  assert.equal(systemic[0].count, 2);
  assert.match(systemic[0].issue.description, /^x$/);
});
