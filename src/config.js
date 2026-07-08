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
export const ZONE_COVERAGE_MIN = 0.5; // chrome zone: matched/mappable below this → one High summary issue
export const INTER_PAGE_DELAY_MS = 20_000;
export const WAF_COOLDOWN_MS = 600_000; // 10 min pause after a WAF block (×streak, capped ×3)
export const MAX_LINK_CHECKS = 50;
export const LINK_CHECK_BATCH = 2;
export const DIRS = {
  shots: 'output/shots',
  snapshots: 'output/snapshots',
  detIssues: 'output/issues/det',
  aiIssues: 'output/issues/ai',
  report: 'output/report',
};

// Live tracking spreadsheet — a native Google Sheet, edited cell-by-cell via the
// Sheets API v4 (see scripts/sync-sheet-status.js). Superseded a Drive-hosted .xlsx
// copy of the same data (fileId 1PEI69vpymUstbpmFFuGeqvEni2gBogru) — that file no
// longer receives writes; this spreadsheet is now the single source of truth.
export const GOOGLE_SPREADSHEET_ID = '1K2t3E8tYkL7ff3IK8j3j09I6zMIc_mHnES1L3SVwl2w';
export const SERVICE_ACCOUNT_KEY_PATH = '.secrets/sheet-sync-key.json';
// Header row 3, data from row 4. URL column is always the sheet's join key against
// pages.csv's originalUrl. Column numbers are 1-indexed (1=A, 6=F, ...).
export const SHEET_TABS = {
  'TH Pages - Categorized': { headerRow: 3, urlCol: 1, statusCol: 6, openIssuesCol: 7 },
  'News & Media Articles': { headerRow: 3, urlCol: 1, statusCol: 4, openIssuesCol: 5 },
};
