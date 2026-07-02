export const VIEWPORT = { width: 1440, height: 900 };
export const NAV_TIMEOUT_MS = 45_000;
export const NETWORKIDLE_MS = 4_000; // bounded settle; bank pages rarely reach true idle, so don't wait long
export const SETTLE_MS = 800;
export const RETRIES = 2;
export const IMAGE_RATIO_TOLERANCE = 0.02;
export const THAI_RATIO_DELTA = 0.10;
export const NOT_FOUND_PATTERNS = [
  /ไม่พบหน้าที่คุณต้องการ/,
  /\bpage not found\b/i,
  /\b404\b/,
];
export const SYSTEMIC_THRESHOLD = 0.5;
export const SYSTEMIC_MIN_PAGES = 3;
export const INTER_PAGE_DELAY_MS = 20_000;
export const MAX_LINK_CHECKS = 50;
export const LINK_CHECK_BATCH = 2;
export const DIRS = {
  shots: 'output/shots',
  snapshots: 'output/snapshots',
  detIssues: 'output/issues/det',
  aiIssues: 'output/issues/ai',
  report: 'output/report',
};
