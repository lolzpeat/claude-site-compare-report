import { compareLinks } from './links.js';
import { compareLinkTargets } from './link-targets.js';
import { compareImages } from './images.js';
import { compareText } from './text.js';
import { compareModules } from './modules.js';
import { detectRedirects } from './redirect.js';
import { looksNotFound } from './not-found.js';
import { isNewsDetail, compareNewsDetail } from './news-detail.js';
import { compareChrome } from './chrome.js';
import { compareHero } from './hero.js';

const NO_CHROME = { chromeIssues: [], chromeStats: [] };

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
  if (captureIssues.length > 0) return { status: 'Capture Failed', issues: captureIssues, ...NO_CHROME };

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
      ...NO_CHROME,
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
      ...NO_CHROME,
    };
  }

  // News-Detail articles use an element-level comparison instead of the generic
  // link/text/module comparators, which only produce false positives on this template
  // (the News-Detail?id=GUID → /<year>/<guid> URL transform can't be modelled, and the
  // flat original page mis-scopes chrome text into 'main').
  const chrome = compareChrome(origEnv, migEnv);

  if (isNewsDetail(origEnv, migEnv)) {
    const issues = [
      ...detectRedirects(origEnv, migEnv),
      ...compareNewsDetail(origEnv, migEnv),
    ];
    return {
      status: issues.length === 0 ? 'Passed' : 'Failed', issues,
      chromeIssues: chrome.issues, chromeStats: chrome.stats,
    };
  }

  const issues = [
    ...detectRedirects(origEnv, migEnv),
    ...compareLinks(origEnv, migEnv),
    ...compareLinkTargets(origEnv, migEnv),
    ...compareImages(origEnv, migEnv),
    ...compareText(origEnv, migEnv),
    ...compareModules(origEnv, migEnv),
    ...compareHero(origEnv, migEnv),
  ];
  return {
    status: issues.length === 0 ? 'Passed' : 'Failed', issues,
    chromeIssues: chrome.issues, chromeStats: chrome.stats,
  };
}
