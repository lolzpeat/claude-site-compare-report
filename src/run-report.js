import fs from 'node:fs';
import { parsePages } from './input.js';
import { DIRS } from './config.js';
import { mergeIssues } from './report/merge.js';
import { renderIndex, renderDetail } from './report/html.js';
import { renderSheetCsv } from './report/csv.js';

const readJson = (file) => {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`warn: unreadable issue file ${file}: ${e.message}`);
    return null;
  }
};

fs.mkdirSync(DIRS.report, { recursive: true });
const pairs = parsePages(fs.readFileSync('pages.csv', 'utf8'));

const rows = pairs.map((pair) => {
  const det = readJson(`${DIRS.detIssues}/${pair.id}.json`)
    ?? { pairId: pair.id, status: 'Capture Failed', issues: [{ category: 'capture-failure', severity: 'High', description: 'No comparison result found — run run-capture and run-compare first', location: 'page-wide' }] };
  const ai = readJson(`${DIRS.aiIssues}/${pair.id}.json`);
  return { pair, result: mergeIssues(det, ai) };
});

fs.writeFileSync(`${DIRS.report}/index.html`, renderIndex(rows));
for (const { pair, result } of rows) {
  fs.writeFileSync(`${DIRS.report}/${pair.id}.html`, renderDetail(pair, result));
}
fs.writeFileSync('output/sheet-update.csv', renderSheetCsv(rows));

for (const { pair, result } of rows) console.log(`${pair.id}: ${result.status} (${result.issues.length} issues)`);
console.log(`\nReport: ${DIRS.report}/index.html\nSheet CSV: output/sheet-update.csv`);
