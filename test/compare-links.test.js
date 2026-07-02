import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareLinks } from '../src/compare/links.js';

const env = (links, statuses = {}) => ({
  requestedUrl: 'https://x/', blocked: false, error: null,
  snapshot: { finalUrl: 'https://x/', title: '', links, images: [], textBlocks: [], modules: [] },
  linkStatuses: statuses,
});

test('flags 404 links on migrated as High broken-link', () => {
  const mig = env([{ href: 'https://y/dead', text: 'Dead' }], { 'https://y/dead': 404 });
  const issues = compareLinks(env([]), mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'broken-link');
  assert.equal(issues[0].severity, 'High');
  assert.match(issues[0].description, /404/);
});

test('flags unreachable (status 0) links as Medium', () => {
  const mig = env([{ href: 'https://y/x', text: 'X' }], { 'https://y/x': 0 });
  const issues = compareLinks(env([]), mig);
  assert.equal(issues[0].severity, 'Medium');
});

test('flags links present on original but missing on migrated, by text', () => {
  const orig = env([{ href: 'https://x/a', text: 'สมัครบัตร' }, { href: 'https://x/b', text: 'Home' }]);
  const mig = env([{ href: 'https://y/b', text: 'Home' }], { 'https://y/b': 200 });
  const issues = compareLinks(orig, mig);
  assert.equal(issues.length, 1);
  assert.match(issues[0].description, /สมัครบัตร/);
});

test('no issues when links match and are healthy', () => {
  const orig = env([{ href: 'https://x/a', text: 'Home' }]);
  const mig = env([{ href: 'https://y/a', text: 'Home' }], { 'https://y/a': 200 });
  assert.deepEqual(compareLinks(orig, mig), []);
});

test('caps missing-link reports at 20 and adds a High summary beyond the cap', () => {
  const origLinks = Array.from({ length: 25 }, (_, i) => ({ href: `https://x/${i}`, text: `Link number ${i}` }));
  const orig = env(origLinks);
  const mig = env([]);
  const issues = compareLinks(orig, mig);
  const missing = issues.filter((i) => /not found on migrated/.test(i.description));
  const summary = issues.filter((i) => /25 original links missing/.test(i.description));
  assert.equal(missing.length, 20);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].severity, 'High');
  assert.equal(issues.length, 21);
  assert.equal(summary[0].keyHint, 'orig-links-missing-summary');
});
