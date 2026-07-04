import { normalizeText } from '../lib/text-utils.js';

// Conservative hero-banner check. Only fires when the ORIGINAL clearly has a hero
// (its first main-region module carries an image) — flat original pages make hero
// detection heuristic, so when in doubt we stay silent (spec: "never guess").
// Unlike chrome issues, hero issues count toward per-page status.
export function compareHero(origEnv, migEnv) {
  const firstMain = (snap) => (snap.modules ?? []).find((m) => m.region === 'main');
  const orig = firstMain(origEnv.snapshot);
  const origImages = (orig?.imageFiles ?? []).map((f) => String(f).toLowerCase());
  if (!orig || origImages.length === 0) return [];

  const issues = [];
  const mig = firstMain(migEnv.snapshot);
  const migImages = (mig?.imageFiles ?? []).map((f) => String(f).toLowerCase());

  if (migImages.length === 0) {
    issues.push({
      category: 'hero', severity: 'Medium', zone: 'hero',
      description: 'Hero banner image missing on migrated page', location: 'hero',
      original: origImages[0], migrated: '(none)',
    });
  } else if (!origImages.some((f) => migImages.includes(f))) {
    issues.push({
      category: 'hero', severity: 'Medium', zone: 'hero',
      description: 'Hero banner image differs from original', location: 'hero',
      original: origImages[0], migrated: migImages[0],
    });
  }

  const origHeading = normalizeText(orig.heading ?? '');
  const migHeading = normalizeText(mig?.heading ?? '');
  if (mig && origHeading && migHeading && origHeading !== migHeading) {
    issues.push({
      category: 'hero', severity: 'Medium', zone: 'hero',
      description: 'Hero heading differs from original', location: 'hero',
      original: origHeading, migrated: migHeading,
    });
  }
  return issues;
}
