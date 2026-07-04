// Render-time Thai descriptions. Comparators emit English description strings that
// are load-bearing data (issueKey falls back to normalizeText(description), and det
// JSON stores them), so translation happens ONLY here at display time. Values embedded
// in the English sentences are dropped — they render in the ต้นฉบับ/เว็บที่ย้าย columns.
// No rule matched → return the description unchanged (safe degradation to English).
// When adding a comparator check, add a rule + a test/describe.test.js case;
// scripts/describe-coverage.py measures real-data coverage.

const RULES = [
  // links.js
  { re: /^Link returns HTTP (\d+): /, th: (m) => `ลิงก์เสีย (HTTP ${m[1]})` },
  { re: /^Link unreachable \(fetch failed\): /, th: () => 'ลิงก์เข้าไม่ถึง (เชื่อมต่อไม่สำเร็จ)' },
  { re: /^Link on original not found on migrated \(matched by text\): /, th: () => 'ลิงก์บนหน้าเดิมไม่พบบนเว็บที่ย้าย (เทียบด้วยข้อความ)' },
  { re: /^\d+ original links missing on migrated \(first (\d+) listed\)$/, th: (m) => `ลิงก์เดิมหายไปมากกว่าที่แสดง (แสดง ${m[1]} รายการแรก)` },
  // link-targets.js
  { re: /^Link ".*" on original points to .* — no matching link on migrated$/, th: () => 'ปลายทางลิงก์ที่คาดหวังไม่ถูกลิงก์บนเว็บที่ย้าย' },
  { re: /^\d+ original links have no matching destination on migrated \(first (\d+) listed\)$/, th: (m) => `ปลายทางลิงก์หายไปมากกว่าที่แสดง (แสดง ${m[1]} รายการแรก)` },
  // chrome.js
  { re: /^Chrome label rendered in English instead of Thai: /, th: () => 'เมนู/ข้อความส่วนกลางแสดงเป็นภาษาอังกฤษ' },
  { re: /^Link points to the same URL but its label differs from original$/, th: () => 'URL เดียวกันแต่ชื่อเมนูไม่ตรงกับเดิม' },
  { re: /^Chrome link ".*" has no matching link in the migrated zone$/, th: () => 'ลิงก์ส่วนกลางหายไปจากโซนบนเว็บที่ย้าย' },
  { re: /^Fewer than (\d+)% of mappable original links found in the migrated zone$/, th: (m) => `ลิงก์ในโซนจับคู่ได้ต่ำกว่า ${m[1]}%` },
  { re: /^More original links missing in this zone than itemized \(first (\d+) listed\)$/, th: (m) => `ลิงก์ที่หายมีมากกว่าที่แสดง (แสดง ${m[1]} รายการแรก)` },
  // hero.js
  { re: /^Hero banner image missing on migrated page$/, th: () => 'รูปแบนเนอร์หลักหายไปบนเว็บที่ย้าย' },
  { re: /^Hero banner image differs from original$/, th: () => 'รูปแบนเนอร์หลักคนละไฟล์กับต้นฉบับ' },
  { re: /^Hero heading differs from original$/, th: () => 'หัวข้อแบนเนอร์หลักไม่ตรงกับต้นฉบับ' },
  // text.js
  { re: /^Text on original not found on migrated: /, th: () => 'ข้อความบนหน้าเดิมไม่พบบนเว็บที่ย้าย' },
  { re: /^\d+ original text blocks missing on migrated \(first (\d+) listed\)$/, th: (m) => `ข้อความหายไปมากกว่าที่แสดง (แสดง ${m[1]} รายการแรก)` },
  { re: /^Thai\/English balance differs: /, th: () => 'สัดส่วนภาษาไทย/อังกฤษต่างไปจากเดิม' },
  // images.js
  { re: /^Rendered aspect ratio differs: /, th: () => 'สัดส่วนรูปภาพเปลี่ยนไปจากเดิม' },
  { re: /^Image distorted on migrated: /, th: () => 'รูปภาพถูกบีบ/ยืดผิดสัดส่วนบนเว็บที่ย้าย' },
  { re: /^Migrated page renders \d+ images vs \d+ on original$/, th: () => 'จำนวนรูปภาพน้อยกว่าหน้าเดิม' },
  // modules.js
  { re: /^Module not found on migrated: /, th: () => 'โมดูล/ส่วนเนื้อหาหายไปบนเว็บที่ย้าย' },
  // redirect.js
  { re: /^The original URL redirected: /, th: () => 'URL ฝั่งต้นฉบับถูก redirect ไปหน้าอื่น' },
  { re: /^The migrated URL redirected: /, th: () => 'URL ฝั่งเว็บที่ย้ายถูก redirect ไปหน้าอื่น' },
  // compare.js capture / 404
  { re: /^Capture failed for original page: (.*)$/, th: (m) => `จับภาพหน้าต้นฉบับไม่สำเร็จ (${m[1]})` },
  { re: /^Capture failed for migrated page: (.*)$/, th: (m) => `จับภาพหน้าเว็บที่ย้ายไม่สำเร็จ (${m[1]})` },
  { re: /^Migrated URL serves a 404 page$/, th: () => 'เว็บที่ย้ายขึ้นหน้า 404' },
  { re: /^Original URL serves a 404 page \(offering retired\?\) while migrated has content$/, th: () => 'หน้าต้นฉบับขึ้น 404 (อาจถูกปลดออก) แต่เว็บที่ย้ายมีเนื้อหา' },
  { re: /^Both original and migrated URLs serve a 404 page$/, th: () => 'ทั้งสองฝั่งขึ้นหน้า 404' },
  // news-detail.js
  { re: /^Article content not detected on migrated page$/, th: () => 'ไม่พบเนื้อหาบทความบนเว็บที่ย้าย' },
  { re: /^News headline missing on migrated$/, th: () => 'หัวข้อข่าวหายไป' },
  { re: /^News headline differs from original$/, th: () => 'หัวข้อข่าวไม่ตรงกับต้นฉบับ' },
  { re: /^News date renders as "Invalid Date" on migrated$/, th: () => 'วันที่ข่าวแสดงเป็น "Invalid Date"' },
  { re: /^News date missing on migrated$/, th: () => 'วันที่ข่าวหายไป' },
  { re: /^News date differs from original$/, th: () => 'วันที่ข่าวไม่ตรงกับต้นฉบับ' },
  { re: /^News body content missing or too short on migrated /, th: () => 'เนื้อหาข่าวหายหรือสั้นผิดปกติ' },
  { re: /^Content image missing on migrated article$/, th: () => 'รูปประกอบข่าวหายไป' },
  { re: /^Content image differs on migrated article$/, th: () => 'รูปประกอบข่าวคนละรูปกับต้นฉบับ' },
  { re: /^Breadcrumb missing on migrated$/, th: () => 'เส้นทางหน้า (breadcrumb) หายไป' },
  { re: /^Breadcrumb not localized to Thai on migrated$/, th: () => 'เส้นทางหน้า (breadcrumb) ไม่เป็นภาษาไทย' },
  { re: /^Social share buttons missing on migrated$/, th: () => 'ปุ่มแชร์โซเชียลหายไป' },
  // run-report.js fallback det entry
  { re: /^No comparison result found — /, th: () => 'ยังไม่มีผลเปรียบเทียบ — ต้องรัน run-capture และ run-compare ก่อน' },
];

export function describeIssue(issue) {
  const description = issue?.description ?? '';
  for (const { re, th } of RULES) {
    const m = re.exec(description);
    if (m) return th(m);
  }
  return description;
}
