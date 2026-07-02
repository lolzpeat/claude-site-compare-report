import { normalizeText } from '../lib/text-utils.js';

const MIN_MODULE_HEIGHT = 80;

export function compareModules(origEnv, migEnv) {
  const issues = [];
  const migModules = migEnv.snapshot.modules;
  const migHeadings = new Set(
    migModules.map((m) => normalizeText(m.heading).toLowerCase()).filter(Boolean),
  );
  const migFiles = new Set(
    migModules.flatMap((m) => m.imageFiles.map((f) => f.toLowerCase())),
  );

  for (const mod of origEnv.snapshot.modules) {
    if (mod.height < MIN_MODULE_HEIGHT) continue;
    const heading = normalizeText(mod.heading).toLowerCase();
    const hasIdentity = Boolean(heading) || mod.imageFiles.length > 0;
    if (!hasIdentity) continue;

    const byHeading = heading && migHeadings.has(heading);
    const byImage = mod.imageFiles.some((f) => migFiles.has(f.toLowerCase()));
    if (!byHeading && !byImage) {
      issues.push({
        category: 'missing-module', severity: 'High',
        description: `Module not found on migrated: "${mod.heading || mod.imageFiles[0]}" (~${mod.height}px tall)`,
        location: mod.heading || mod.imageFiles[0],
      });
    }
  }
  return issues;
}
