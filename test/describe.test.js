import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeIssue } from '../src/report/describe.js';

const d = (description) => describeIssue({ description });

// One case per comparator template — the exact English strings the comparators emit today.
const CASES = [
  // links.js
  ['Link returns HTTP 404: https://prod-aem.bangkokbank.com/th/x', 'ลิงก์เสีย (HTTP 404)'],
  ['Link returns HTTP 403: https://x/y', 'ลิงก์เสีย (HTTP 403)'],
  ['Link unreachable (fetch failed): https://x/y', 'ลิงก์เข้าไม่ถึง (เชื่อมต่อไม่สำเร็จ)'],
  ['Link on original not found on migrated (matched by text): "กองทุนรวม"', 'ลิงก์บนหน้าเดิมไม่พบบนเว็บที่ย้าย (เทียบด้วยข้อความ)'],
  ['37 original links missing on migrated (first 20 listed)', 'ลิงก์เดิมหายไปมากกว่าที่แสดง (แสดง 20 รายการแรก)'],
  // link-targets.js
  ['Link "สินเชื่อ" on original points to prod-aem.bangkokbank.com/th/loans — no matching link on migrated', 'ปลายทางลิงก์ที่คาดหวังไม่ถูกลิงก์บนเว็บที่ย้าย'],
  ['25 original links have no matching destination on migrated (first 20 listed)', 'ปลายทางลิงก์หายไปมากกว่าที่แสดง (แสดง 20 รายการแรก)'],
  // chrome.js
  ['Chrome label rendered in English instead of Thai: "กิจการธนาคารต่างประเทศ"', 'เมนู/ข้อความส่วนกลางแสดงเป็นภาษาอังกฤษ'],
  ['Link points to the same URL but its label differs from original', 'URL เดียวกันแต่ชื่อเมนูไม่ตรงกับเดิม'],
  ['Chrome link "ศูนย์ความช่วยเหลือ" has no matching link in the migrated zone', 'ลิงก์ส่วนกลางหายไปจากโซนบนเว็บที่ย้าย'],
  ['Fewer than 50% of mappable original links found in the migrated zone', 'ลิงก์ในโซนจับคู่ได้ต่ำกว่า 50%'],
  ['More original links missing in this zone than itemized (first 20 listed)', 'ลิงก์ที่หายมีมากกว่าที่แสดง (แสดง 20 รายการแรก)'],
  // hero.js
  ['Hero banner image missing on migrated page', 'รูปแบนเนอร์หลักหายไปบนเว็บที่ย้าย'],
  ['Hero banner image differs from original', 'รูปแบนเนอร์หลักคนละไฟล์กับต้นฉบับ'],
  ['Hero heading differs from original', 'หัวข้อแบนเนอร์หลักไม่ตรงกับต้นฉบับ'],
  // text.js
  ['Text on original not found on migrated: "สมัครบัตรเครดิต"', 'ข้อความบนหน้าเดิมไม่พบบนเว็บที่ย้าย'],
  ['22 original text blocks missing on migrated (first 15 listed)', 'ข้อความหายไปมากกว่าที่แสดง (แสดง 15 รายการแรก)'],
  ['Thai/English balance differs: original 85% Thai vs migrated 40% Thai', 'สัดส่วนภาษาไทย/อังกฤษต่างไปจากเดิม'],
  // images.js
  ['Rendered aspect ratio differs: original 1.500 vs migrated 1.200 (hero.jpg)', 'สัดส่วนรูปภาพเปลี่ยนไปจากเดิม'],
  ['Image distorted on migrated: natural ratio 1.500 vs rendered 1.200 (hero.jpg)', 'รูปภาพถูกบีบ/ยืดผิดสัดส่วนบนเว็บที่ย้าย'],
  ['Migrated page renders 3 images vs 9 on original', 'จำนวนรูปภาพน้อยกว่าหน้าเดิม'],
  // modules.js
  ['Module not found on migrated: "อัตราดอกเบี้ย" (~500px tall)', 'โมดูล/ส่วนเนื้อหาหายไปบนเว็บที่ย้าย'],
  // redirect.js
  ['The original URL redirected: requested https://a but landed on https://b', 'URL ฝั่งต้นฉบับถูก redirect ไปหน้าอื่น'],
  ['The migrated URL redirected: requested https://a but landed on https://b', 'URL ฝั่งเว็บที่ย้ายถูก redirect ไปหน้าอื่น'],
  // compare.js (capture / 404)
  ['Capture failed for original page: WAF_BLOCKED', 'จับภาพหน้าต้นฉบับไม่สำเร็จ (WAF_BLOCKED)'],
  ['Capture failed for migrated page: no snapshot file', 'จับภาพหน้าเว็บที่ย้ายไม่สำเร็จ (no snapshot file)'],
  ['Migrated URL serves a 404 page', 'เว็บที่ย้ายขึ้นหน้า 404'],
  ['Original URL serves a 404 page (offering retired?) while migrated has content', 'หน้าต้นฉบับขึ้น 404 (อาจถูกปลดออก) แต่เว็บที่ย้ายมีเนื้อหา'],
  ['Both original and migrated URLs serve a 404 page', 'ทั้งสองฝั่งขึ้นหน้า 404'],
  // news-detail.js
  ['Article content not detected on migrated page', 'ไม่พบเนื้อหาบทความบนเว็บที่ย้าย'],
  ['News headline missing on migrated', 'หัวข้อข่าวหายไป'],
  ['News headline differs from original', 'หัวข้อข่าวไม่ตรงกับต้นฉบับ'],
  ['News date renders as "Invalid Date" on migrated', 'วันที่ข่าวแสดงเป็น "Invalid Date"'],
  ['News date missing on migrated', 'วันที่ข่าวหายไป'],
  ['News date differs from original', 'วันที่ข่าวไม่ตรงกับต้นฉบับ'],
  ['News body content missing or too short on migrated (42 chars)', 'เนื้อหาข่าวหายหรือสั้นผิดปกติ'],
  ['Content image missing on migrated article', 'รูปประกอบข่าวหายไป'],
  ['Content image differs on migrated article', 'รูปประกอบข่าวคนละรูปกับต้นฉบับ'],
  ['Breadcrumb missing on migrated', 'เส้นทางหน้า (breadcrumb) หายไป'],
  ['Breadcrumb not localized to Thai on migrated', 'เส้นทางหน้า (breadcrumb) ไม่เป็นภาษาไทย'],
  ['Social share buttons missing on migrated', 'ปุ่มแชร์โซเชียลหายไป'],
  // run-report.js fallback det
  ['No comparison result found — run run-capture and run-compare first', 'ยังไม่มีผลเปรียบเทียบ — ต้องรัน run-capture และ run-compare ก่อน'],
];

for (const [en, th] of CASES) {
  test(`describeIssue: ${en.slice(0, 60)}`, () => {
    assert.equal(d(en), th);
  });
}

test('describeIssue falls back to the original description when no rule matches', () => {
  assert.equal(d('AI visual review: layout broken in hero'), 'AI visual review: layout broken in hero');
  assert.equal(d('เลย์เอาต์เพี้ยนจากรีวิวภาพ'), 'เลย์เอาต์เพี้ยนจากรีวิวภาพ');
});

test('describeIssue tolerates missing description', () => {
  assert.equal(describeIssue({}), '');
  assert.equal(describeIssue(null), '');
});
