import { compareLinks } from './links.js';
import { compareLinkTargets } from './link-targets.js';
import { compareImages } from './images.js';
import { compareText } from './text.js';
import { compareModules } from './modules.js';
import { detectRedirects } from './redirect.js';

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
