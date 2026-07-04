import { normalizeText, thaiRatio } from '../lib/text-utils.js';
import { expectedKey, migKey } from './link-targets.js';
import { migLinkStatusIssues } from './links.js';
import { CHROME_REGIONS, ZONE_OF_REGION, CHROME_ZONES } from './zones.js';
import { ZONE_COVERAGE_MIN } from '../config.js';

const MAX_REPORTED_PER_ZONE = 20;
const MIN_MAPPABLE_FOR_COVERAGE = 5;
const THAI_ORIG_MIN = 0.5; // original label counts as Thai above this ratio
const THAI_MIG_MAX = 0.2; // migrated label counts as not-Thai below this ratio

const zoneLinks = (snapshot, zone) =>
  (snapshot.links ?? []).filter((l) => ZONE_OF_REGION[l.region] === zone);

// Compare the shared chrome (header/nav + footer) between sides. Links are matched
// across sides by expected URL, not by text, so label checks only run on real pairs.
// Issues returned here are aggregated site-wide by run-report and NEVER affect
// per-page status.
export function compareChrome(origEnv, migEnv) {
  const issues = [];
  const stats = [];

  for (const zone of CHROME_ZONES) {
    const origLinks = zoneLinks(origEnv.snapshot, zone);
    const migLinks = zoneLinks(migEnv.snapshot, zone);

    const migByKey = new Map();
    for (const l of migLinks) {
      const k = migKey(l.href);
      if (k && !migByKey.has(k)) migByKey.set(k, l);
    }

    const seen = new Set();
    let matched = 0;
    const missing = [];
    for (const l of origLinks) {
      const key = expectedKey(l.href);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const mig = migByKey.get(key);
      if (!mig) {
        missing.push({ text: normalizeText(l.text), key });
        continue;
      }
      matched += 1;
      const origText = normalizeText(l.text);
      const migText = normalizeText(mig.text);
      if (!origText || !migText) continue;
      if (thaiRatio(origText) > THAI_ORIG_MIN && thaiRatio(migText) < THAI_MIG_MAX) {
        issues.push({
          category: 'text-language', severity: 'High', zone,
          description: `Chrome label rendered in English instead of Thai: "${origText}"`,
          location: origText, original: origText, migrated: migText,
        });
      } else if (origText.toLowerCase() !== migText.toLowerCase()) {
        issues.push({
          category: 'menu-label', severity: 'Medium', zone,
          description: 'Link points to the same URL but its label differs from original',
          location: origText, original: origText, migrated: migText,
        });
      }
    }

    for (const m of missing.slice(0, MAX_REPORTED_PER_ZONE)) {
      issues.push({
        category: 'link-target', severity: 'Medium', zone,
        description: `Chrome link "${m.text}" has no matching link in the migrated zone`,
        location: m.text || 'link',
        original: `${m.key} (expected)`, migrated: 'not linked',
      });
    }

    const mappable = matched + missing.length;
    if (mappable >= MIN_MAPPABLE_FOR_COVERAGE && matched / mappable < ZONE_COVERAGE_MIN) {
      issues.push({
        category: 'link-target', severity: 'High', zone,
        description: `Fewer than ${Math.round(ZONE_COVERAGE_MIN * 100)}% of mappable original links found in the migrated zone`,
        location: zone, keyHint: `chrome-${zone}-coverage`,
      });
    }

    stats.push({ zone, orig: origLinks.length, mig: migLinks.length, matched, missing: missing.length });
  }

  for (const i of migLinkStatusIssues(migEnv, CHROME_REGIONS)) {
    issues.push({ ...i, zone: ZONE_OF_REGION[i.region] ?? 'header-nav' });
  }
  return { issues, stats };
}
