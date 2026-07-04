import { normalizeText } from '../lib/text-utils.js';
import { CHROME_REGIONS } from './zones.js';

const MAX_REPORTED = 20;
const ORIG_HOST = 'www.bangkokbank.com';
const MIG_HOST = 'prod-aem.bangkokbank.com';

// Transform an original-site URL to the host+path key its migrated equivalent
// should have (host swap, /th-TH/ -> /th/, lowercased, no trailing slash).
// Returns null for links we can't map: external, already-migrated, non-th-TH,
// or query-string pages (news/dynamic pages restructure and don't follow the rule).
export function expectedKey(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (url.hostname !== ORIG_HOST) return null;
  if (url.search) return null;
  if (!/^\/th-TH\//i.test(url.pathname)) return null;
  const migPath = url.pathname.replace(/^\/th-TH\//i, '/th/');
  return `${MIG_HOST}${migPath}`.replace(/\/+$/, '').toLowerCase();
}

// Normalize a migrated link to the same host+path key for matching.
export function migKey(href) {
  try {
    const u = new URL(href);
    return `${u.hostname}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return null;
  }
}

export function compareLinkTargets(origEnv, migEnv) {
  const issues = [];
  const migTargets = new Set(migEnv.snapshot.links.map((l) => migKey(l.href)).filter(Boolean));

  const seen = new Set();
  const missing = [];
  for (const l of origEnv.snapshot.links) {
    if (CHROME_REGIONS.has(l.region)) continue;
    const key = expectedKey(l.href);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!migTargets.has(key)) missing.push({ text: normalizeText(l.text), key, region: l.region ?? 'page-wide' });
  }

  for (const m of missing.slice(0, MAX_REPORTED)) {
    issues.push({
      category: 'link-target', severity: 'High',
      description: `Link "${m.text}" on original points to ${m.key} — no matching link on migrated`,
      location: m.text || 'link',
      original: `${m.key} (expected)`, migrated: 'not linked', region: m.region,
    });
  }
  if (missing.length > MAX_REPORTED) {
    issues.push({
      category: 'link-target', severity: 'High',
      description: `${missing.length} original links have no matching destination on migrated (first ${MAX_REPORTED} listed)`,
      location: 'page-wide',
      original: `${missing.length} link targets`, migrated: `${missing.length} unmatched`,
      keyHint: 'link-targets-missing-summary', region: 'page-wide',
    });
  }
  return issues;
}
