export function normalizeText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function thaiRatio(s) {
  const thai = (String(s).match(/[฀-๿]/g) || []).length;
  const latin = (String(s).match(/[A-Za-z]/g) || []).length;
  const total = thai + latin;
  return total === 0 ? 0 : thai / total;
}

const THAI_MONTHS =
  /(ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*\d{2,4}/;

export function isDynamicBlock(s) {
  const t = normalizeText(s);
  const digits = (t.match(/\d/g) || []).length;
  const nonSpace = t.replace(/\s/g, '').length || 1;
  if (digits / nonSpace > 0.4) return true;
  return THAI_MONTHS.test(t);
}

export function filenameOf(url) {
  try {
    const name = new URL(url).pathname.split('/').pop() || '';
    return decodeURIComponent(name).toLowerCase();
  } catch {
    return '';
  }
}
