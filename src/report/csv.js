const quote = (s) => `"${String(s ?? '').replaceAll('"', '""')}"`;

function summarize(issues) {
  if (issues.length === 0) return '';
  const counts = {};
  for (const i of issues) counts[i.category] = (counts[i.category] ?? 0) + 1;
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${n} ${c}`);
  return `${issues.length} issues: ${parts.join(', ')}`;
}

export function renderSheetCsv(rows) {
  const lines = ['originalUrl,validationStatus,openIssues'];
  for (const { pair, result } of rows) {
    lines.push(`${quote(pair.originalUrl)},${result.status},${quote(summarize(result.issues))}`);
  }
  return lines.join('\n') + '\n';
}
