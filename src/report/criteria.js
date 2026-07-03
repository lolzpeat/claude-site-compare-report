import { IMAGE_RATIO_TOLERANCE, THAI_RATIO_DELTA, SYSTEMIC_THRESHOLD, SYSTEMIC_MIN_PAGES, MAX_LINK_CHECKS } from '../config.js';
import { esc, CSS } from './html.js';
import { T, CATEGORY_LABEL, STATUS_LABEL, SEVERITY_LABEL } from './labels.js';

const pct = (x) => `${Math.round(x * 100)}%`;
const pts = (x) => `${Math.round(x * 100)} จุด`;
const catLabel = (c) => CATEGORY_LABEL[c] ?? c;

// One row per issue category: what it checks, how it is detected/calculated, the threshold, severity.
const CRITERIA = [
  {
    cat: 'broken-link',
    check: 'ลิงก์บนหน้าที่ย้ายใช้งานได้ไหม และลิงก์เดิมยังอยู่ครบไหม',
    method: `ยิงตรวจสถานะ HTTP ของลิงก์ในหน้าที่ย้าย (สูงสุด ${MAX_LINK_CHECKS} ลิงก์/หน้า); เทียบข้อความลิงก์ต้นฉบับกับหน้าที่ย้าย`,
    threshold: 'HTTP ≥ 400 = เสีย, สถานะ 0 = เข้าไม่ถึง, ลิงก์เดิมจับคู่ข้อความไม่เจอ = หาย',
    sev: 'สูง / ปานกลาง',
  },
  {
    cat: 'link-target',
    check: 'เมนู/ลิงก์เดิมชี้ไปปลายทางที่ถูกต้องบนหน้าที่ย้ายไหม',
    method: 'แปลง URL ต้นฉบับ /th-TH/… → เปลี่ยนโฮสต์เป็น prod-aem, /th-TH/→/th/, ตัวพิมพ์เล็ก, ตัด / ท้าย แล้วหาลิงก์ที่ตรงบนหน้าที่ย้าย',
    threshold: 'ไม่มีลิงก์ปลายทางที่ตรง = ปัญหา (ข้ามลิงก์นอกเว็บ, ลิงก์ที่มี query string, ลิงก์ที่ไม่ใช่ /th-TH/)',
    sev: 'สูง',
  },
  {
    cat: 'image-ratio',
    check: 'รูปภาพในเนื้อหาหลักถูกบีบ/ยืดผิดสัดส่วนบนหน้าที่ย้ายไหม',
    method: 'จับคู่รูปด้วยชื่อไฟล์ (แล้วตามลำดับ) เฉพาะรูปในเนื้อหาหลัก; เทียบสัดส่วน กว้าง/สูง ที่เรนเดอร์จริง',
    threshold: `|สัดส่วนต้นฉบับ − สัดส่วนที่ย้าย| ÷ สัดส่วนต้นฉบับ > ${pct(IMAGE_RATIO_TOLERANCE)}; และตรวจการบิดเบี้ยว (สัดส่วนไฟล์จริง vs ที่เรนเดอร์)`,
    sev: 'ปานกลาง',
  },
  {
    cat: 'text-language',
    check: 'ข้อความเนื้อหาหลักครบไหม และสัดส่วนภาษาไทย/อังกฤษเปลี่ยนไปไหม',
    method: 'เทียบบล็อกข้อความในเนื้อหาหลัก (ตัดช่องว่างซ้ำ, ยาว ≥ 4 ตัวอักษร, ไม่ใช่ข้อความไดนามิก); คำนวณสัดส่วนอักษรไทย',
    threshold: `ข้อความต้นฉบับไม่พบบนหน้าที่ย้าย = หาย; สัดส่วนไทยต่างกัน > ${pts(THAI_RATIO_DELTA)}`,
    sev: 'ปานกลาง / สูง',
  },
  {
    cat: 'missing-module',
    check: 'บล็อก/โมดูลเนื้อหาหลักหายไปบนหน้าที่ย้ายไหม',
    method: 'แยกโมดูลในเนื้อหาหลัก (ตัด chrome; บล็อกสูง ≥ 1000px แยกตาม h2; ไม่นับไอคอน < 48px; เทียบเฉพาะโมดูลสูง ≥ 80px ที่มีหัวข้อหรือรูปเนื้อหา) แล้วจับคู่กับหน้าที่ย้ายด้วยหัวข้อหรือชื่อไฟล์รูป',
    threshold: 'โมดูลต้นฉบับจับคู่ไม่ได้ทั้งหัวข้อและรูป = หาย; และจำนวนรูปเนื้อหาหน้าที่ย้าย < ต้นฉบับ − 2',
    sev: 'สูง',
  },
  {
    cat: 'layout',
    check: 'เลย์เอาต์/การจัดวางผิดเพี้ยนไปจากต้นฉบับ',
    method: 'ตรวจด้วยการรีวิวภาพ (AI visual review) เทียบสกรีนช็อต — ไม่ใช่กฎอัตโนมัติ',
    threshold: 'ขึ้นกับการรีวิวภาพ',
    sev: 'สูง / ปานกลาง',
  },
  {
    cat: 'capture-failure',
    check: 'จับภาพหน้าไม่สำเร็จ (ถูก WAF บล็อก หรือโหลดหน้าไม่ได้)',
    method: 'ตรวจว่าหน้าโหลดสำเร็จและไม่ถูกบล็อกก่อนนำไปเทียบ',
    threshold: 'ถ้าจับภาพไม่ได้ หน้าถูกทำเครื่องหมาย “จับภาพไม่สำเร็จ” (ไม่รายงานว่าผ่าน)',
    sev: 'สูง',
  },
];

const CONFIG_ROWS = [
  ['IMAGE_RATIO_TOLERANCE', pct(IMAGE_RATIO_TOLERANCE), 'เกณฑ์ความต่างสัดส่วนรูปที่ถือว่าผิด'],
  ['THAI_RATIO_DELTA', pts(THAI_RATIO_DELTA), 'ความต่างสัดส่วนอักษรไทยที่ถือว่าผิด'],
  ['SYSTEMIC_THRESHOLD', pct(SYSTEMIC_THRESHOLD), 'สัดส่วนหน้าขั้นต่ำที่ทำให้ปัญหาเป็นระดับทั้งเว็บ'],
  ['SYSTEMIC_MIN_PAGES', String(SYSTEMIC_MIN_PAGES), 'จำนวนหน้าขั้นต่ำสำหรับปัญหาระดับทั้งเว็บ'],
  ['MAX_LINK_CHECKS', String(MAX_LINK_CHECKS), 'จำนวนลิงก์สูงสุดที่ตรวจต่อหน้า'],
  ['MIN_MODULE_HEIGHT', '40px (จับภาพ) / 80px (เทียบ)', 'ความสูงขั้นต่ำของโมดูล — อยู่ใน snapshot.js / modules.js'],
  ['COARSE_MODULE_MIN_HEIGHT', '1000px', 'บล็อกที่สูงเกินนี้และมี ≥ 2 h2 จะถูกแยก — อยู่ใน snapshot.js'],
  ['ICON_MAX_PX', '48px', 'รูปเล็กกว่านี้ถือเป็นไอคอน ไม่นับเป็นตัวตนของโมดูล — อยู่ใน snapshot.js'],
];

const STATUS_ROWS = [
  ['Passed', 'ผ่านการตรวจ ไม่พบปัญหา'],
  ['Failed', 'พบปัญหาอย่างน้อยหนึ่งข้อ'],
  ['Capture Failed', 'จับภาพหน้าไม่สำเร็จ'],
  ['Not Migrated', 'หน้าที่ย้ายขึ้น 404 (ตรงกับ NOT_FOUND_PATTERNS)'],
  ['Retired on Original', 'หน้าต้นฉบับขึ้น 404'],
];

const SEVERITY_ROWS = [
  ['High', 'ปัญหารุนแรง ควรแก้ก่อน'],
  ['Medium', 'ปัญหาระดับกลาง'],
  ['Low', 'ปัญหาเล็กน้อย'],
];

const critRows = CRITERIA.map((c) => `
    <tr>
      <td>${esc(catLabel(c.cat))} <code>${esc(c.cat)}</code></td>
      <td>${esc(c.check)}</td><td>${esc(c.method)}</td>
      <td>${esc(c.threshold)}</td><td>${esc(c.sev)}</td>
    </tr>`).join('');

const configRows = CONFIG_ROWS.map(([a, b, c]) =>
  `<tr><td><code>${esc(a)}</code></td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join('');

const statusRows = STATUS_ROWS.map(([s, d]) =>
  `<tr><td>${esc(STATUS_LABEL[s] ?? s)} <code>${esc(s)}</code></td><td>${esc(d)}</td></tr>`).join('');

const severityRows = SEVERITY_ROWS.map(([s, d]) =>
  `<tr><td>${esc(SEVERITY_LABEL[s] ?? s)} <code>${esc(s)}</code></td><td>${esc(d)}</td></tr>`).join('');

export function renderCriteria() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>เกณฑ์การตรวจสอบ</title>
<style>${CSS}</style></head><body>
<p><a href="index.html">${T.back}</a></p>
<h1>เกณฑ์และวิธีการตรวจสอบ</h1>
<p>เครื่องมือนี้เปิดหน้าเว็บต้นฉบับ (www.bangkokbank.com) และหน้าที่ย้าย (prod-aem.bangkokbank.com) ด้วยเบราว์เซอร์จริง แล้วเทียบเฉพาะส่วนเนื้อหาหลัก (ตัดส่วนหัว/เมนู/ส่วนท้ายออกจากการตรวจเนื้อหา ส่วนลิงก์ตรวจทั้งหน้า)</p>

<h2>เกณฑ์การตรวจรายหมวด</h2>
<table><tr><th>หมวดหมู่</th><th>ตรวจอะไร</th><th>วิธีตรวจ/คำนวณ</th><th>เกณฑ์</th><th>ความรุนแรง</th></tr>${critRows}</table>

<h2>ค่าเกณฑ์ (config)</h2>
<table><tr><th>ชื่อ</th><th>ค่า</th><th>ความหมาย</th></tr>${configRows}</table>

<h2>สถานะการตรวจ</h2>
<table><tr><th>สถานะ</th><th>ความหมาย</th></tr>${statusRows}</table>

<h2>ระดับความรุนแรง</h2>
<table><tr><th>ระดับ</th><th>ความหมาย</th></tr>${severityRows}</table>

<h2>การรวมปัญหาระดับทั้งเว็บ (systemic)</h2>
<p>ปัญหาที่พบบนหน้าที่เทียบได้ (ผ่าน/ไม่ผ่าน) ตั้งแต่ ${pct(SYSTEMIC_THRESHOLD)} ของหน้าขึ้นไป และอย่างน้อย ${SYSTEMIC_MIN_PAGES} หน้า จะถูกจัดเป็นปัญหาระดับทั้งเว็บ (แก้ครั้งเดียวที่ระดับเทมเพลต) โดยรวมปัญหาซ้ำด้วยคีย์ <code>category|original|migrated</code></p>
</body></html>`;
}
