import { normalizeText } from '../lib/text-utils.js';
import { SYSTEMIC_THRESHOLD, SYSTEMIC_MIN_PAGES } from '../config.js';

const SEVERITY_ORDER = ['High', 'Medium', 'Low'];
const sevRank = (s) => {
  const r = SEVERITY_ORDER.indexOf(s);
  return r === -1 ? SEVERITY_ORDER.length : r;
};

export function issueKey(i) {
  const hasVals = (i.original != null && i.original !== '') || (i.migrated != null && i.migrated !== '');
  return hasVals
    ? `${i.category}|${i.original ?? ''}|${i.migrated ?? ''}`
    : `${i.category}|${normalizeText(i.description)}`;
}

export function aggregateIssues(results) {
  const comparable = results.filter((r) => r.status === 'Passed' || r.status === 'Failed');
  const n = comparable.length;
  const keyToPages = new Map(); // key -> Set(pairId)
  const keyToIssue = new Map(); // key -> representative issue

  if (n >= SYSTEMIC_MIN_PAGES) {
    for (const r of comparable) {
      const seen = new Set();
      for (const i of r.issues) {
        const k = issueKey(i);
        if (!keyToIssue.has(k)) keyToIssue.set(k, i);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!keyToPages.has(k)) keyToPages.set(k, new Set());
        keyToPages.get(k).add(r.pairId);
      }
    }
  }

  const systemicKeys = new Set();
  for (const [k, pages] of keyToPages) {
    if (pages.size / n >= SYSTEMIC_THRESHOLD) systemicKeys.add(k);
  }

  const systemic = [...systemicKeys]
    .map((k) => ({ issue: keyToIssue.get(k), pageIds: [...keyToPages.get(k)].sort(), count: keyToPages.get(k).size }))
    .sort((a, b) => b.count - a.count || sevRank(a.issue.severity) - sevRank(b.issue.severity));

  const own = new Map();
  for (const r of results) {
    own.set(r.pairId, r.issues.filter((i) => !systemicKeys.has(issueKey(i))));
  }
  return { systemic, own };
}
