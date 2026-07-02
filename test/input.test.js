import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePages } from '../src/input.js';

test('parses simple rows', () => {
  const csv = 'id,originalUrl,migratedUrl,category,subCategory\na,https://x/1,https://y/1,Personal,Cards\n';
  assert.deepEqual(parsePages(csv), [
    { id: 'a', originalUrl: 'https://x/1', migratedUrl: 'https://y/1', category: 'Personal', subCategory: 'Cards' },
  ]);
});

test('parses quoted fields containing commas and ampersands', () => {
  const csv = 'id,originalUrl,migratedUrl,category,subCategory\nn,"https://x/p?id=1&tag=New,Old",https://y/p,About Us,News\n';
  assert.equal(parsePages(csv)[0].originalUrl, 'https://x/p?id=1&tag=New,Old');
});

test('skips blank lines', () => {
  const csv = 'id,originalUrl,migratedUrl,category,subCategory\n\na,https://x,https://y,C,S\n\n';
  assert.equal(parsePages(csv).length, 1);
});
