import { CATEGORY_LABEL } from './labels.js';

// Thai one-line summary of a page's own content issues, for the tracking sheet's
// "Open Issues" column. Category counts only (no per-issue detail — the HTML report
// carries the full breakdown); empty string when there are no issues.
export function summarizeIssuesThai(issues) {
  if (!issues || issues.length === 0) return '';
  const counts = {};
  for (const i of issues) counts[i.category] = (counts[i.category] ?? 0) + 1;
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([category, n]) => `${n} ${CATEGORY_LABEL[category] ?? category}`);
  return `${issues.length} ปัญหา: ${parts.join(', ')}`;
}
