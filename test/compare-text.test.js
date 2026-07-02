import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareText } from '../src/compare/text.js';

const env = (textBlocks) => ({
  requestedUrl: 'https://x/', blocked: false, error: null, linkStatuses: {},
  snapshot: { finalUrl: 'https://x/', title: '', links: [], images: [], textBlocks, modules: [] },
});

test('flags original text blocks missing on migrated', () => {
  const orig = env(['บริการสินเชื่อบ้าน', 'อัตราดอกเบี้ยพิเศษสำหรับลูกค้าใหม่']);
  const mig = env(['บริการสินเชื่อบ้าน']);
  const issues = compareText(orig, mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'text-language');
  assert.match(issues[0].description, /อัตราดอกเบี้ยพิเศษ/);
});

test('ignores dynamic blocks (dates, numbers)', () => {
  const orig = env(['บริการสินเชื่อบ้าน', '15 มกราคม 2569', '31.25 30.50 29.75']);
  const mig = env(['บริการสินเชื่อบ้าน']);
  assert.deepEqual(compareText(orig, mig), []);
});

test('flags Thai/Latin balance shift beyond 10 points', () => {
  const orig = env(['บริการสินเชื่อบ้านและที่อยู่อาศัยสำหรับครอบครัวไทยทุกครัวเรือน']);
  const mig = env(['Home loan services for every Thai family and household nationwide']);
  const issues = compareText(orig, mig);
  assert.ok(issues.some((i) => /Thai\/English balance/.test(i.description) && i.severity === 'High'));
});

test('no issues for identical text', () => {
  const t = ['บริการสินเชื่อบ้าน', 'รายละเอียดเพิ่มเติม'];
  assert.deepEqual(compareText(env(t), env([...t])), []);
});
