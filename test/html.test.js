import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderIndex, renderDetail } from '../src/report/html.js';

const pair = { id: 'my-home', originalUrl: 'https://x/o', migratedUrl: 'https://y/m', category: 'Personal', subCategory: 'My Home' };
const result = {
  pairId: 'my-home', status: 'Failed',
  issues: [{ category: 'broken-link', severity: 'High', description: 'Link returns HTTP 404: https://y/dead', location: 'สมัคร' }],
};

test('index lists each pair with status and issue counts, linking to detail', () => {
  const html = renderIndex([{ pair, result }]);
  assert.match(html, /my-home\.html/);
  assert.match(html, /Failed/);
  assert.match(html, /broken-link/);
});

test('index escapes HTML in data', () => {
  const bad = { ...pair, subCategory: '<script>x</script>' };
  const html = renderIndex([{ pair: bad, result }]);
  assert.ok(!html.includes('<script>x</script>'));
});

test('detail shows side-by-side screenshots and the issue list', () => {
  const html = renderDetail(pair, result);
  assert.match(html, /\.\.\/shots\/my-home-orig\.png/);
  assert.match(html, /\.\.\/shots\/my-home-mig\.png/);
  assert.match(html, /HTTP 404/);
  assert.match(html, /High/);
});
