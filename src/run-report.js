import fs from 'node:fs';
import { parsePages } from './input.js';
import { DIRS } from './config.js';
import { mergeIssues } from './report/merge.js';
import { aggregateIssues, issueKey, countSystemicHits } from './report/systemic.js';
import { renderIndex, renderDetail, renderSystemic, renderLanding } from './report/html.js';
import { renderCriteria } from './report/criteria.js';
import { aggregateChrome, renderChrome } from './report/chrome.js';
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

const argVal = (flag) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null);
const onlySheet = argVal('--sheet');

const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sheet';
const sheetOf = (p) => (p.sheet && p.sheet.trim() ? p.sheet.trim() : (p.category || 'Pages'));

fs.mkdirSync(DIRS.report, { recursive: true });
fs.mkdirSync(DIRS.detIssues, { recursive: true });

const pairs = parsePages(fs.readFileSync('pages.csv', 'utf8'))
  .filter((p) => !onlySheet || sheetOf(p) === onlySheet);

const entries = pairs.map((pair) => {
  const det = readJson(`${DIRS.detIssues}/${pair.id}.json`)
    ?? { pairId: pair.id, status: 'Capture Failed', issues: [{ category: 'capture-failure', severity: 'High', description: 'No comparison result found — run run-capture and run-compare first', location: 'page-wide' }] };
  det.pairId = pair.id;
  const ai = readJson(`${DIRS.aiIssues}/${pair.id}.json`);
  return { pair, result: mergeIssues(det, ai) };
});

// Group into sheets, preserving first-seen order.
const groups = new Map();
for (const e of entries) {
  const name = sheetOf(e.pair);
  if (!groups.has(name)) groups.set(name, []);
  groups.get(name).push(e);
}

const sheetNav = [...groups.keys()].map((n) => ({ name: n, slug: slugify(n) }));

const allRows = [];
const sheetSummaries = [];

for (const [name, group] of groups) {
  const slug = slugify(name);
  const dir = `${DIRS.report}/${slug}`;
  fs.mkdirSync(dir, { recursive: true });

  const { systemic, own } = aggregateIssues(group.map((e) => e.result));
  const chromeAgg = aggregateChrome(group.map((e) => e.result));
  const systemicKeys = new Set(systemic.map((s) => issueKey(s.issue)));
  const comparableCount = group.filter((e) => e.result.status === 'Passed' || e.result.status === 'Failed').length;

  const rows = group.map((e) => ({
    ...e,
    own: own.get(e.pair.id) ?? [],
    systemicHits: countSystemicHits(e.result.issues, systemicKeys),
  }));

  fs.writeFileSync(`${dir}/index.html`, renderIndex(rows, systemic.length, chromeAgg.entries.length,
    sheetNav.map((s) => ({ ...s, current: s.slug === slug }))));

  fs.writeFileSync(`${dir}/chrome.html`, renderChrome(chromeAgg));
  fs.writeFileSync(`${dir}/chrome.json`, JSON.stringify(chromeAgg, null, 2));
  fs.writeFileSync(`${dir}/criteria.html`, renderCriteria());
  fs.writeFileSync(`${dir}/systemic.html`, renderSystemic(systemic, comparableCount));
  for (const { pair, result, own: ownIssues, systemicHits } of rows) {
    // detail pages live in report/<slug>/, so screenshots (output/shots) are two levels up
    fs.writeFileSync(`${dir}/${pair.id}.html`, renderDetail(pair, result, ownIssues, systemicHits, '../../shots'));
  }
  fs.writeFileSync(`${dir}/systemic.json`, JSON.stringify(systemic, null, 2));

  const statusCounts = {};
  for (const r of rows) statusCounts[r.result.status] = (statusCounts[r.result.status] ?? 0) + 1;
  sheetSummaries.push({ name, slug, total: rows.length, statusCounts, systemicCount: systemic.length, chromeCount: chromeAgg.entries.length });
  allRows.push(...rows);

  console.log(`[${name}] ${rows.length} pages, ${systemic.length} site-wide, ${chromeAgg.entries.length} chrome → ${dir}/index.html`);
}

fs.writeFileSync(`${DIRS.report}/index.html`, renderLanding(sheetSummaries));
fs.writeFileSync('output/sheet-update.csv', renderSheetCsv(allRows));

// Vercel static-deploy helpers. Deploy root is output/ (so /report/ and /shots/ are
// siblings — detail pages reference ../../shots). Entry is /report/; this redirect
// makes / land there. .vercelignore trims the data dirs that aren't needed to view.
fs.writeFileSync('output/index.html',
  '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=report/"><title>redirecting…</title><a href="report/">report/</a>');
// shots-full/ holds the full-res PNG originals; scripts/optimize-shots.sh moves them
// there and leaves downscaled JPEGs (same .png names) in shots/ for a lighter deploy.
fs.writeFileSync('output/.vercelignore', ['snapshots/', 'issues/', 'shots-full/', '.omc/', '.DS_Store', ''].join('\n'));

console.log(`\n${sheetSummaries.length} sheet dashboard(s). Landing: ${DIRS.report}/index.html | CSV: output/sheet-update.csv`);
