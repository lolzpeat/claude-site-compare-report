import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksNotFound } from '../src/compare/not-found.js';

// Production textBlocks are {text, region} objects — mirror that shape here.
const snap = (title, textBlocks = []) => ({
  title,
  textBlocks: textBlocks.map((t) => (typeof t === 'string' ? { text: t, region: 'main' } : t)),
  finalUrl: 'https://x/', links: [], images: [], modules: [],
});

test('detects the Thai 404 fingerprint in title or text', () => {
  assert.equal(looksNotFound(snap('ขออภัย ไม่พบหน้าที่คุณต้องการค้นหา')), true);
  assert.equal(looksNotFound(snap('บริการ', ['ไม่พบหน้าที่คุณต้องการ', 'อื่น'])), true);
});

test('detects an English 404 fingerprint', () => {
  assert.equal(looksNotFound(snap('Page Not Found')), true);
  assert.equal(looksNotFound(snap('Error 404')), true);
});

test('does not flag a normal content page', () => {
  assert.equal(looksNotFound(snap('พันธบัตรตลาดแรก', ['ลงทุนในพันธบัตร', 'อัตราดอกเบี้ย'])), false);
});

test('tolerates a null snapshot', () => {
  assert.equal(looksNotFound(null), false);
});
