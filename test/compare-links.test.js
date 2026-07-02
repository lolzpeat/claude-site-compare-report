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
