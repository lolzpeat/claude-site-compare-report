import { issueKey } from './systemic.js';
import { esc, CSS } from './html.js';
import { T, TH_HEAD, SEVERITY_LABEL, CATEGORY_LABEL, ZONE_LABEL } from './labels.js';
import { CHROME_ZONES } from '../compare/zones.js';

const MAX_EXAMPLE_PAGES = 5;
const SEVERITY_ORDER = ['High', 'Medium', 'Low'];
const sevRank = (s) => {
  const r = SEVERITY_ORDER.indexOf(s);
  return r === -1 ? SEVERITY_ORDER.length : r;
};
const th = (k) => TH_HEAD[k] ?? k;

const median = (xs) => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// Same dedup mechanics as aggregateIssues (systemic.js), but over chromeIssues and
// with no threshold: chrome is shared furniture, so every deduped defect is
// site-wide by construction and reported with its page reach.
export function aggregateChrome(results) {
  const comparable = results.filter((r) => r.status === 'Passed' || r.status === 'Failed');
  const keyToPages = new Map();
  const keyToIssue = new Map();
  for (const r of comparable) {
    const seen = new Set();
    for (const i of r.chromeIssues ?? []) {
      // Zone-aware key: the same defect in header-nav AND footer (footers repeat
      // header links) must stay two entries, one per zone section. issueKey itself
      // stays zone-free — systemic.js is a different consumer.
      const k = `${i.zone ?? 'header-nav'}|${issueKey(i)}`;
      if (!keyToIssue.has(k)) keyToIssue.set(k, i);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!keyToPages.has(k)) keyToPages.set(k, new Set());
      keyToPages.get(k).add(r.pairId);
    }
  }
  const entries = [...keyToPages.entries()]
    .map(([k, pages]) => ({ issue: keyToIssue.get(k), count: pages.size, pageIds: [...pages].sort() }))
    .sort((a, b) => b.count - a.count || sevRank(a.issue.severity) - sevRank(b.issue.severity));

  const statsByZone = {};
  for (const zone of CHROME_ZONES) {
    const zs = comparable.flatMap((r) => (r.chromeStats ?? []).filter((s) => s.zone === zone));
    statsByZone[zone] = {
      orig: median(zs.map((s) => s.orig)), mig: median(zs.map((s) => s.mig)),
      matched: median(zs.map((s) => s.matched)), missing: median(zs.map((s) => s.missing)),
    };
  }
  return { entries, statsByZone, comparableCount: comparable.length };
}

const statStrip = (s) => `
<p class="zone-stats">
  <span class="chip chip-count">${T.zoneStatOrig} ${s.orig} → ${T.zoneStatMig} ${s.mig}</span>
  <span class="chip chip-count">${T.zoneStatMatched} ${s.matched}</span>
  <span class="chip ${s.missing > 0 ? 'chip-Medium' : 'chip-count'}">${T.zoneStatMissing} ${s.missing}</span>
</p>`;

const exampleLinks = (pageIds) => {
  const shown = pageIds.slice(0, MAX_EXAMPLE_PAGES)
    .map((id) => `<a href="${esc(id)}.html">${esc(id)}</a>`).join(', ');
  const rest = pageIds.length - MAX_EXAMPLE_PAGES;
  return rest > 0 ? `${shown} <span class="muted">${T.moreExamples} ${rest} หน้า</span>` : shown;
};

const zoneRows = (entries, comparableCount) => entries.map(({ issue, count, pageIds }) => `
    <tr class="sev-${esc(issue.severity)}">
      <td>${esc(CATEGORY_LABEL[issue.category] ?? issue.category)}</td>
      <td>${esc(SEVERITY_LABEL[issue.severity] ?? issue.severity)}</td>
      <td>${esc(issue.description)}</td>
      <td class="val val-orig">${esc(issue.original ?? '—')}</td>
      <td class="val val-mig">${esc(issue.migrated ?? '—')}</td>
      <td><span class="chip reach">${count} / ${comparableCount}</span></td>
      <td>${exampleLinks(pageIds)}</td>
    </tr>`).join('');

export function renderChrome(agg) {
  const sections = CHROME_ZONES.map((zone) => {
    const entries = agg.entries.filter((e) => (e.issue.zone ?? 'header-nav') === zone);
    const table = entries.length
      ? `<table><tr><th>${th('Category')}</th><th>${th('Severity')}</th><th>${th('Description')}</th><th>${th('Original')}</th><th>${th('Migrated')}</th><th>${th('Found on')}</th><th>${th('Examples')}</th></tr>${zoneRows(entries, agg.comparableCount)}</table>`
      : `<p class="muted">ไม่พบปัญหาในโซนนี้</p>`;
    return `<h2>${esc(ZONE_LABEL[zone] ?? zone)}</h2>${statStrip(agg.statsByZone[zone] ?? { orig: 0, mig: 0, matched: 0, missing: 0 })}${table}`;
  }).join('\n');

  const extraCss = '.zone-stats{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px}';
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${T.chromeTitle}</title>
<style>${CSS}${extraCss}</style></head><body>
<p><a href="index.html">${T.back}</a></p>
<h1>${T.chromeTitle} (${agg.entries.length})</h1>
<p>${T.chromeExplainer}</p>
${sections}
</body></html>`;
}
