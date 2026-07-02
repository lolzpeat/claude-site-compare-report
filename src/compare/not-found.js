import { NOT_FOUND_PATTERNS } from '../config.js';

// True when a captured snapshot looks like a 404 / not-found page.
// Checks the title and the first few text blocks (fingerprints live near the top).
export function looksNotFound(snapshot) {
  if (!snapshot) return false;
  const probe = `${snapshot.title ?? ''} ${(snapshot.textBlocks ?? []).slice(0, 8).join(' ')}`;
  return NOT_FOUND_PATTERNS.some((re) => re.test(probe));
}
