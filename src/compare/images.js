import { filenameOf } from '../lib/text-utils.js';
import { IMAGE_RATIO_TOLERANCE } from '../config.js';

export function matchImages(origImages, migImages) {
  const pairs = [];
  const usedMig = new Set();

  for (const o of origImages) {
    const key = filenameOf(o.src);
    if (!key) continue;
    const idx = migImages.findIndex((m, i) => !usedMig.has(i) && filenameOf(m.src) === key);
    if (idx !== -1) { usedMig.add(idx); pairs.push([o, migImages[idx]]); }
  }

  const restOrig = origImages.filter((o) => !pairs.some(([po]) => po === o));
  const restMig = migImages.filter((_, i) => !usedMig.has(i));
  restOrig.forEach((o, i) => { if (restMig[i]) pairs.push([o, restMig[i]]); });

  return pairs;
}

const ratio = (w, h) => (h > 0 ? w / h : 0);
const differs = (a, b) => a > 0 && b > 0 && Math.abs(a - b) / a > IMAGE_RATIO_TOLERANCE;

export function compareImages(origEnv, migEnv) {
  const issues = [];
  const origImages = origEnv.snapshot.images;
  const migImages = migEnv.snapshot.images;

  for (const [o, m] of matchImages(origImages, migImages)) {
    const name = filenameOf(m.src) || m.src;
    const ro = ratio(o.renderedWidth, o.renderedHeight);
    const rm = ratio(m.renderedWidth, m.renderedHeight);
    if (differs(ro, rm)) {
      issues.push({
        category: 'image-ratio', severity: 'Medium',
        description: `Rendered aspect ratio differs: original ${ro.toFixed(3)} vs migrated ${rm.toFixed(3)} (${name})`,
        location: name,
        original: `${ro.toFixed(3)}`, migrated: `${rm.toFixed(3)}`,
      });
      continue; // distortion check would double-report the same root cause
    }
    const natM = ratio(m.naturalWidth, m.naturalHeight);
    const natO = ratio(o.naturalWidth, o.naturalHeight);
    // Only flag distortion that is NEW on migrated (original renders its natural ratio, migrated doesn't).
    if (differs(natM, rm) && !differs(natO, ro)) {
      issues.push({
        category: 'image-ratio', severity: 'Medium',
        description: `Image distorted on migrated: natural ratio ${natM.toFixed(3)} vs rendered ${rm.toFixed(3)} (${name})`,
        location: name,
        original: `${ro.toFixed(3)}`, migrated: `${rm.toFixed(3)} (natural ${natM.toFixed(3)})`,
      });
    }
  }

  if (migImages.length < origImages.length - 2) {
    issues.push({
      category: 'missing-module', severity: 'Medium',
      description: `Migrated page renders ${migImages.length} images vs ${origImages.length} on original`,
      location: 'page-wide',
      original: `${origImages.length} images`, migrated: `${migImages.length} images`,
    });
  }
  return issues;
}
