import fs from 'node:fs';
import { parsePages } from './input.js';
import { DIRS } from './config.js';
import { comparePair } from './compare/compare.js';

const readEnv = (file) => {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`warn: unreadable snapshot ${file}: ${e.message}`);
    return null;
  }
};

fs.mkdirSync(DIRS.detIssues, { recursive: true });
const pairs = parsePages(fs.readFileSync('pages.csv', 'utf8'));

for (const pair of pairs) {
  const orig = readEnv(`${DIRS.snapshots}/${pair.id}-orig.json`);
  const mig = readEnv(`${DIRS.snapshots}/${pair.id}-mig.json`);
  const result = comparePair(orig, mig);
  fs.writeFileSync(
    `${DIRS.detIssues}/${pair.id}.json`,
    JSON.stringify({ pairId: pair.id, ...result }, null, 2),
  );
  console.log(`${pair.id}: ${result.status} (${result.issues.length} issues)`);
}
