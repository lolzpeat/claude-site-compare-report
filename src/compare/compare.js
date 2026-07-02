import { compareLinks } from './links.js';
import { compareLinkTargets } from './link-targets.js';
import { compareImages } from './images.js';
import { compareText } from './text.js';
import { compareModules } from './modules.js';
import { detectRedirects } from './redirect.js';
import { looksNotFound } from './not-found.js';

export function comparePair(origEnv, migEnv) {
  const captureIssues = [];
  for (const [side, env] of [['original', origEnv], ['migrated', migEnv]]) {
    if (!env || env.error || !env.snapshot) {
      captureIssues.push({
        category: 'capture-failure', severity: 'High',
        description: `Capture failed for ${side} page: ${env?.error ?? 'no snapshot file'}`,
        location: 'page-wide',
      });
    }
  }
  if (captureIssues.length > 0) return { status: 'Capture Failed', issues: captureIssues };

  const origNotFound = looksNotFound(origEnv.snapshot);
  const migNotFound = looksNotFound(migEnv.snapshot);
  if (migNotFound) {
    return {
      status: origNotFound ? 'Retired on Original' : 'Not Migrated',
      issues: [{
        category: 'broken-link', severity: 'High',
        description: origNotFound
          ? 'Both original and migrated URLs serve a 404 page'
          : 'Migrated URL serves a 404 page',
        location: 'page-wide',
        original: origNotFound ? '404' : 'page exists',
        migrated: '404',
      }],
    };
  }
  if (origNotFound) {
    return {
      status: 'Retired on Original',
      issues: [{
        category: 'broken-link', severity: 'High',
        description: 'Original URL serves a 404 page (offering retired?) while migrated has content',
        location: 'page-wide',
        original: '404 (page retired)', migrated: 'page exists',
      }],
    };
  }

  const issues = [
    ...detectRedirects(origEnv, migEnv),
    ...compareLinks(origEnv, migEnv),
    ...compareLinkTargets(origEnv, migEnv),
    ...compareImages(origEnv, migEnv),
    ...compareText(origEnv, migEnv),
    ...compareModules(origEnv, migEnv),
  ];
  return { status: issues.length === 0 ? 'Passed' : 'Failed', issues };
}
