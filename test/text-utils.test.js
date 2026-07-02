import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, thaiRatio, isDynamicBlock, filenameOf } from '../src/lib/text-utils.js';

test('normalizeText collapses whitespace', () => {
  assert.equal(normalizeText('  สวัสดี\n\tครับ  '), 'สวัสดี ครับ');
});

test('thaiRatio is 1 for pure Thai, 0 for pure Latin, ~0.5 mixed', () => {
  assert.equal(thaiRatio('สวัสดี'), 1);
  assert.equal(thaiRatio('hello'), 0);
  const mixed = thaiRatio('สวัสดี hello!');
  assert.ok(mixed > 0.4 && mixed < 0.7);
});

test('thaiRatio is 0 for empty/no letters', () => {
  assert.equal(thaiRatio('12345 --'), 0);
});

test('isDynamicBlock flags digit-heavy and Thai-date text', () => {
  assert.equal(isDynamicBlock('31.25 30.50 29.75 28.00'), true);
  assert.equal(isDynamicBlock('15 มกราคม 2569'), true);
  assert.equal(isDynamicBlock('บริการบัญชีเงินฝากสำหรับครอบครัว'), false);
});

test('filenameOf extracts lowercase basename without query', () => {
  assert.equal(filenameOf('https://x.com/a/B/Hero-IMG.JPG?v=2'), 'hero-img.jpg');
  assert.equal(filenameOf('not a url'), '');
});
