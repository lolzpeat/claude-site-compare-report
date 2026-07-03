// Thai display strings for the report. Internal contract values (severities,
// statuses, categories, regions) stay English — only their display is Thai.
export const T = {
  reportTitle: 'รายงานเปรียบเทียบการย้ายเว็บไซต์',
  back: '← กลับ',
  original: 'ต้นฉบับ',
  migrated: 'เว็บที่ย้าย',
  ownIssues: 'ปัญหาเฉพาะหน้า', // followed by " (N)"
  noOwnIssues: 'ไม่มีปัญหาเฉพาะหน้านี้',
  siteWideTitle: 'ปัญหาระดับทั้งเว็บ', // followed by " (N)"
  noSiteWide: 'ไม่มีปัญหาระดับทั้งเว็บ',
  systemicExplainer: 'ปัญหาที่พบในหน้าที่เทียบได้อย่างน้อย 60% — แก้ครั้งเดียวที่ระดับเทมเพลต',
  bannerA: 'ปัญหาระดับทั้งเว็บ ส่งผลหลายหน้าทั่วเว็บไซต์ —', // "{N} {bannerA} {seeSystemic}"
  refA: 'ปัญหาระดับทั้งเว็บ ส่งผลกับหน้านี้ด้วย —', // "+{N} {refA} {seeSystemic}"
  seeSystemic: 'ดูรายงานปัญหาระดับระบบ',
};

export const TH_HEAD = {
  Page: 'หน้า', Category: 'หมวดหมู่', Status: 'สถานะ', Own: 'เฉพาะหน้า',
  'Site-wide': 'ทั้งเว็บ', 'Own by category': 'เฉพาะหน้าแยกตามหมวด',
  Severity: 'ความรุนแรง', Description: 'รายละเอียด', Original: 'ต้นฉบับ',
  Migrated: 'เว็บที่ย้าย', Location: 'ตำแหน่ง', Reach: 'ครอบคลุม',
  'Affected pages': 'หน้าที่ได้รับผลกระทบ',
};

export const SEVERITY_LABEL = { High: 'สูง', Medium: 'ปานกลาง', Low: 'ต่ำ' };

export const STATUS_LABEL = {
  Passed: 'ผ่าน', Failed: 'ไม่ผ่าน', 'Capture Failed': 'จับภาพไม่สำเร็จ',
  'Not Migrated': 'ยังไม่ย้าย', 'Retired on Original': 'ปลดออกจากต้นฉบับ',
};

export const CATEGORY_LABEL = {
  'broken-link': 'ลิงก์เสีย', 'link-target': 'ปลายทางลิงก์', 'image-ratio': 'สัดส่วนรูปภาพ',
  'text-language': 'ข้อความ/ภาษา', 'missing-module': 'โมดูลหาย', 'layout': 'เลย์เอาต์',
  'capture-failure': 'จับภาพล้มเหลว',
};

export const REGION_LABEL = {
  header: 'ส่วนหัว', nav: 'เมนู', footer: 'ส่วนท้าย', main: 'เนื้อหาหลัก', 'page-wide': 'ทั้งหน้า',
};
