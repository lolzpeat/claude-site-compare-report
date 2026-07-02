import fs from 'node:fs';
import { parsePages } from './input.js';
import { DIRS } from './config.js';
import { mergeIssues } from './report/merge.js';
import { aggregateIssues, issueKey } from './report/systemic.js';
import { renderIndex, renderDetail, renderSystemic } from './report/html.js';
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
fs.mkdirSync(DIRS.detIssues, { recursive: true });
const pairs = parsePages(fs.readFileSync('pages.csv', 'utf8'));

const entries = pairs.map((pair) => {
  const det = readJson(`${DIRS.detIssues}/${pair.id}.json`)
    ?? { pairId: pair.id, status: 'Capture Failed', issues: [{ category: 'capture-failure', severity: 'High', description: 'No comparison result found — run run-capture and run-compare first', location: 'page-wide' }] };
  const ai = readJson(`${DIRS.aiIssues}/${pair.id}.json`);
  return { pair, result: mergeIssues(det, ai) };
});

const { systemic, own } = aggregateIssues(entries.map((e) => e.result));
const systemicKeys = new Set(systemic.map((s) => issueKey(s.issue)));
const comparableCount = entries.filter((e) => e.result.status === 'Passed' || e.result.status === 'Failed').length;

const rows = entries.map((e) => {
  const ownIssues = own.get(e.pair.id) ?? e.result.issues;
  const systemicHits = e.result.issues.filter((i) => systemicKeys.has(issueKey(i))).length;
  return { ...e, own: ownIssues, systemicHits };
});

fs.writeFileSync(`${DIRS.report}/index.html`, renderIndex(rows, systemic.length));
fs.writeFileSync(`${DIRS.report}/systemic.html`, renderSystemic(systemic, comparableCount));
for (const { pair, result, own: ownIssues, systemicHits } of rows) {
  fs.writeFileSync(`${DIRS.report}/${pair.id}.html`, renderDetail(pair, result, ownIssues, systemicHits));
}
fs.writeFileSync('output/sheet-update.csv', renderSheetCsv(rows));
fs.writeFileSync(`${DIRS.detIssues.replace('/det', '')}/systemic.json`, JSON.stringify(systemic, null, 2));

for (const { pair, result, own: ownIssues, systemicHits } of rows) {
  console.log(`${pair.id}: ${result.status} (${ownIssues.length} own, +${systemicHits} site-wide)`);
}
console.log(`\n${systemic.length} site-wide issues. Report: ${DIRS.report}/index.html | Systemic: ${DIRS.report}/systemic.html | CSV: output/sheet-update.csv`);
