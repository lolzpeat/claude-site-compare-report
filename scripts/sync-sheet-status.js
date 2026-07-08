// Syncs two columns in the live tracking spreadsheet (native Google Sheet, via the
// Sheets API v4 — direct cell writes, no whole-file download/re-upload) against local
// compare results in output/issues/det/ (+ output/issues/ai/ overrides):
//  - "Automatiion Validation Status": sticky — only moves blank/"Not Started" rows to
//    "1st Validation" once a compare result exists; never overwrites a further-along value.
//  - "Open Issues": always refreshed to a Thai one-line category-count summary of the
//    page's current own issues (see src/report/sheet-summary.js), so it reflects fixes too.
//
// Usage:
//   node scripts/sync-sheet-status.js            # dry run — prints the diff, writes nothing
//   node scripts/sync-sheet-status.js --write     # applies the changes to the live sheet
//   node scripts/sync-sheet-status.js --sheet "News & Media Articles" [--write]
//   node scripts/sync-sheet-status.js --sheet "News & Media Articles" --limit 10 [--write]

import fs from 'node:fs';
import { google } from 'googleapis';
import { parsePages } from '../src/input.js';
import { DIRS, GOOGLE_SPREADSHEET_ID, SERVICE_ACCOUNT_KEY_PATH, SHEET_TABS } from '../src/config.js';
import { mergeIssues } from '../src/report/merge.js';
import { summarizeIssuesThai } from '../src/report/sheet-summary.js';

const WRITE = process.argv.includes('--write');
const argVal = (flag) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null);
const onlySheet = argVal('--sheet');
const limitArg = argVal('--limit');
const limit = limitArg ? Number(limitArg) : null;
const BATCH_SIZE = 500; // values.batchUpdate data entries per request

const sheetOf = (p) => (p.sheet && p.sheet.trim() ? p.sheet.trim() : (p.category || 'Pages'));
const isBlankOrNotStarted = (v) => {
  const s = (v ?? '').toString().trim().toLowerCase();
  return s === '' || s === 'not started';
};

const readJson = (file) => {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`warn: unreadable issue file ${file}: ${e.message}`);
    return null;
  }
};

// 1 -> A, 26 -> Z, 27 -> AA
const colLetter = (n) => {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

async function main() {
  const pairs = parsePages(fs.readFileSync('pages.csv', 'utf8'))
    .filter((p) => !onlySheet || sheetOf(p) === onlySheet);

  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheetsApi = google.sheets({ version: 'v4', auth });

  let totalUpdated = 0;
  let totalOpenIssuesUpdated = 0;
  let totalSkippedNotCompared = 0;
  let totalSkippedAlreadyProgressed = 0;
  const unmatched = [];
  const cellUpdates = []; // { range, values: [[value]] }

  for (const [tabName, { headerRow, urlCol, statusCol, openIssuesCol }] of Object.entries(SHEET_TABS)) {
    if (onlySheet && tabName !== onlySheet) continue;

    const lastCol = colLetter(Math.max(urlCol, statusCol, openIssuesCol));
    const range = `'${tabName}'!A${headerRow + 1}:${lastCol}1000`;
    console.log(`Reading ${range}...`);
    const res = await sheetsApi.spreadsheets.values.get({ spreadsheetId: GOOGLE_SPREADSHEET_ID, range });
    const rows = res.data.values ?? [];

    const rowByUrl = new Map();
    rows.forEach((row, i) => {
      const url = row[urlCol - 1];
      if (typeof url === 'string' && url.trim()) rowByUrl.set(url.trim(), headerRow + 1 + i);
    });

    let tabPairs = pairs.filter((p) => sheetOf(p) === tabName);
    if (limit) tabPairs = tabPairs.slice(0, limit);

    let tabUpdated = 0;
    let tabOpenIssuesUpdated = 0;
    for (const pair of tabPairs) {
      const rowNum = rowByUrl.get(pair.originalUrl.trim());
      if (!rowNum) { unmatched.push(`${tabName}: ${pair.originalUrl}`); continue; }

      const det = readJson(`${DIRS.detIssues}/${pair.id}.json`);
      if (!det) { totalSkippedNotCompared++; continue; }

      const rowValues = rows[rowNum - headerRow - 1] ?? [];
      const currentStatus = rowValues[statusCol - 1];
      if (isBlankOrNotStarted(currentStatus)) {
        cellUpdates.push({ range: `'${tabName}'!${colLetter(statusCol)}${rowNum}`, values: [['1st Validation']] });
        tabUpdated++;
      } else {
        totalSkippedAlreadyProgressed++;
      }

      const ai = readJson(`${DIRS.aiIssues}/${pair.id}.json`);
      const merged = mergeIssues(det, ai);
      const summary = summarizeIssuesThai(merged.issues);
      cellUpdates.push({ range: `'${tabName}'!${colLetter(openIssuesCol)}${rowNum}`, values: [[summary]] });
      tabOpenIssuesUpdated++;
    }
    totalUpdated += tabUpdated;
    totalOpenIssuesUpdated += tabOpenIssuesUpdated;
    console.log(`[${tabName}] ${tabUpdated} row(s) would move Not Started -> 1st Validation, ${tabOpenIssuesUpdated} row(s) would get an Open Issues summary (of ${tabPairs.length} pages checked)`);
  }

  if (unmatched.length) {
    console.warn(`\n${unmatched.length} page(s) had no matching URL row in the sheet (showing up to 10):`);
    for (const u of unmatched.slice(0, 10)) console.warn(`  ${u}`);
  }

  console.log(`\nTotals: ${totalUpdated} status update(s), ${totalOpenIssuesUpdated} open-issues summary update(s), ${totalSkippedNotCompared} not yet compared, ${totalSkippedAlreadyProgressed} status already past "Not Started".`);

  if (!WRITE) {
    console.log('\nDry run only — no changes written. Re-run with --write to apply.');
    return;
  }

  console.log(`Writing ${cellUpdates.length} cell update(s)...`);
  for (let i = 0; i < cellUpdates.length; i += BATCH_SIZE) {
    const chunk = cellUpdates.slice(i, i + BATCH_SIZE);
    await sheetsApi.spreadsheets.values.batchUpdate({
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: chunk },
    });
  }
  console.log(`Done — ${totalUpdated} status update(s), ${totalOpenIssuesUpdated} open-issues summary update(s) written to the live sheet.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
