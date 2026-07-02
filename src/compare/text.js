import { normalizeText, thaiRatio, isDynamicBlock } from '../lib/text-utils.js';
import { THAI_RATIO_DELTA } from '../config.js';

const MAX_MISSING_REPORTED = 15;
const MIN_BLOCK_LENGTH = 4;

export function compareText(origEnv, migEnv) {
  const issues = [];
  const migSet = new Set(migEnv.snapshot.textBlocks.map((t) => normalizeText(t)));

  const missing = [...new Set(
    origEnv.snapshot.textBlocks
      .map((t) => normalizeText(t))
      .filter((t) => t.length >= MIN_BLOCK_LENGTH && !isDynamicBlock(t) && !migSet.has(t)),
  )];

  for (const t of missing.slice(0, MAX_MISSING_REPORTED)) {
    issues.push({
      category: 'text-language', severity: 'Medium',
      description: `Text on original not found on migrated: "${t.slice(0, 120)}"`,
      location: 'text',
    });
  }
  if (missing.length > MAX_MISSING_REPORTED) {
    issues.push({
      category: 'text-language', severity: 'High',
      description: `${missing.length} original text blocks missing on migrated (first ${MAX_MISSING_REPORTED} listed)`,
      location: 'page-wide',
    });
  }

  const origRatio = thaiRatio(origEnv.snapshot.textBlocks.join(' '));
  const migRatio = thaiRatio(migEnv.snapshot.textBlocks.join(' '));
  if (Math.abs(origRatio - migRatio) > THAI_RATIO_DELTA) {
    issues.push({
      category: 'text-language', severity: 'High',
      description: `Thai/English balance differs: original ${(origRatio * 100).toFixed(0)}% Thai vs migrated ${(migRatio * 100).toFixed(0)}% Thai`,
      location: 'page-wide',
    });
  }
  return issues;
}
