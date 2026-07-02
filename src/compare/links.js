import { normalizeText } from '../lib/text-utils.js';

const MAX_MISSING_REPORTED = 20;

export function compareLinks(origEnv, migEnv) {
  const issues = [];

  const textFor = (url) =>
    migEnv.snapshot.links.find((l) => l.href === url)?.text || url;

  for (const [url, status] of Object.entries(migEnv.linkStatuses)) {
    if (status >= 400) {
      issues.push({
        category: 'broken-link', severity: 'High',
        description: `Link returns HTTP ${status}: ${url}`, location: textFor(url),
      });
    } else if (status === 0) {
      issues.push({
        category: 'broken-link', severity: 'Medium',
        description: `Link unreachable (fetch failed): ${url}`, location: textFor(url),
      });
    }
  }

  const migTexts = new Set(
    migEnv.snapshot.links.map((l) => normalizeText(l.text).toLowerCase()).filter(Boolean),
  );
  const seen = new Set();
  const missing = [];
  for (const l of origEnv.snapshot.links) {
    const t = normalizeText(l.text);
    const key = t.toLowerCase();
    if (t && !migTexts.has(key) && !seen.has(key)) {
      seen.add(key);
      missing.push(t);
    }
  }
  for (const t of missing.slice(0, MAX_MISSING_REPORTED)) {
    issues.push({
      category: 'broken-link', severity: 'Medium',
      description: `Link on original not found on migrated (matched by text): "${t}"`,
      location: 'page-wide',
    });
  }
  if (missing.length > MAX_MISSING_REPORTED) {
    issues.push({
      category: 'broken-link', severity: 'High',
      description: `${missing.length} original links missing on migrated (first ${MAX_MISSING_REPORTED} listed)`,
      location: 'page-wide',
    });
  }
  return issues;
}
