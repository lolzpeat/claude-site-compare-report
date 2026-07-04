import { normalizeText } from '../lib/text-utils.js';
import { CHROME_REGIONS } from './zones.js';

const MAX_MISSING_REPORTED = 20;

// Regions the generic (per-page) link comparators own; chrome regions belong to
// src/compare/chrome.js so the same defect can't both fail the page and appear
// site-wide.
export const CONTENT_REGIONS = new Set(['main', 'page-wide']);

// HTTP-status half of the link comparison: report migrated links that 404 / fail to
// fetch. Shared with the news-detail comparator, which wants this signal WITHOUT the
// text-transform "missing link" comparison below.
export function migLinkStatusIssues(migEnv, regions = null) {
  const issues = [];
  const linkFor = (url) => migEnv.snapshot.links.find((l) => l.href === url);

  for (const [url, status] of Object.entries(migEnv.linkStatuses ?? {})) {
    const ml = linkFor(url);
    const region = ml?.region ?? 'page-wide';
    if (regions && !regions.has(region)) continue;
    if (status >= 400) {
      issues.push({
        category: 'broken-link', severity: 'High',
        description: `Link returns HTTP ${status}: ${url}`, location: ml?.text || url,
        original: '—', migrated: `${url} → HTTP ${status}`, region,
      });
    } else if (status === 0) {
      issues.push({
        category: 'broken-link', severity: 'Medium',
        description: `Link unreachable (fetch failed): ${url}`, location: ml?.text || url,
        original: '—', migrated: `${url} → unreachable`, region,
      });
    }
  }
  return issues;
}

export function compareLinks(origEnv, migEnv) {
  const issues = [...migLinkStatusIssues(migEnv, CONTENT_REGIONS)];

  const migTexts = new Set(
    migEnv.snapshot.links.map((l) => normalizeText(l.text).toLowerCase()).filter(Boolean),
  );
  const seen = new Set();
  const missing = [];
  for (const l of origEnv.snapshot.links) {
    if (CHROME_REGIONS.has(l.region)) continue;
    const t = normalizeText(l.text);
    const key = t.toLowerCase();
    if (t && !migTexts.has(key) && !seen.has(key)) {
      seen.add(key);
      missing.push({ text: t, region: l.region ?? 'page-wide' });
    }
  }
  for (const m of missing.slice(0, MAX_MISSING_REPORTED)) {
    issues.push({
      category: 'broken-link', severity: 'Medium',
      description: `Link on original not found on migrated (matched by text): "${m.text}"`,
      location: 'page-wide',
      original: `"${m.text}"`, migrated: '(not found)', region: m.region,
    });
  }
  if (missing.length > MAX_MISSING_REPORTED) {
    issues.push({
      category: 'broken-link', severity: 'High',
      description: `${missing.length} original links missing on migrated (first ${MAX_MISSING_REPORTED} listed)`,
      location: 'page-wide',
      original: `${missing.length} original links`, migrated: `${missing.length} missing`,
      keyHint: 'orig-links-missing-summary', region: 'page-wide',
    });
  }
  return issues;
}
