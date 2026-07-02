const quote = (s) => `"${String(s ?? '').replaceAll('"', '""')}"`;

const FIXED = {
  'Not Migrated': 'Migrated URL serves a 404 page',
  'Retired on Original': 'Original URL serves a 404 page (offering retired?)',
};

function summarize(own, systemicHits, status) {
  if (FIXED[status]) return FIXED[status];
  const site = systemicHits > 0 ? ` (+${systemicHits} site-wide)` : '';
  if (own.length === 0) return systemicHits > 0 ? `0 own issues${site}` : '';
  const counts = {};
  for (const i of own) counts[i.category] = (counts[i.category] ?? 0) + 1;
  const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} ${c}`);
  return `${own.length} own issues: ${parts.join(', ')}${site}`;
}

export function renderSheetCsv(rows) {
  const lines = ['originalUrl,validationStatus,openIssues'];
  for (const { pair, result, own, systemicHits } of rows) {
    lines.push(`${quote(pair.originalUrl)},${result.status},${quote(summarize(own, systemicHits, result.status))}`);
  }
  return lines.join('\n') + '\n';
}
