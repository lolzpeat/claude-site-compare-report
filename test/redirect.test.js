import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectRedirects } from '../src/compare/redirect.js';

const env = (requestedUrl, finalUrl) => ({
  requestedUrl, blocked: false, error: null, linkStatuses: {},
  snapshot: { finalUrl, title: '', links: [], images: [], textBlocks: [], modules: [] },
});

test('flags migrated URL landing on a different path', () => {
  const orig = env('https://x/th-TH/Personal/My-Home', 'https://x/th-TH/Personal/My-Home');
  const mig = env('https://y/th/personal/my-home', 'https://y/th/404');
  const issues = detectRedirects(orig, mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'High');
  assert.match(issues[0].description, /migrated/i);
});

test('ignores case and trailing-slash differences', () => {
  const orig = env('https://x/th-TH/Personal/My-Home', 'https://x/th-th/personal/my-home/');
  const mig = env('https://y/th/personal/my-home', 'https://y/th/personal/my-home');
  assert.deepEqual(detectRedirects(orig, mig), []);
});

test('ignores query-string differences', () => {
  const orig = env('https://x/p?id=1&tag=New', 'https://x/p?id=1');
  const mig = env('https://y/p', 'https://y/p');
  assert.deepEqual(detectRedirects(orig, mig), []);
});
