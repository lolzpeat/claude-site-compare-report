import fs from 'node:fs';
import { parsePages } from './input.js';
import { DIRS } from './config.js';
import { launchContext } from './capture/browser.js';
import { captureUrl } from './capture/capture.js';

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const pairs = parsePages(fs.readFileSync('pages.csv', 'utf8')).filter((p) => !only || p.id === only);
if (pairs.length === 0) { console.error(`No pairs matched${only ? ` --only ${only}` : ''}`); process.exit(1); }

for (const dir of [DIRS.shots, DIRS.snapshots]) fs.mkdirSync(dir, { recursive: true });

const { browser, context } = await launchContext();
for (const pair of pairs) {
  for (const [side, url] of [['orig', pair.originalUrl], ['mig', pair.migratedUrl]]) {
    const snapFile = `${DIRS.snapshots}/${pair.id}-${side}.json`;
    if (fs.existsSync(snapFile) && !JSON.parse(fs.readFileSync(snapFile, 'utf8')).error) {
      console.log(`skip  ${pair.id} ${side} (already captured)`);
      continue;
    }
    console.log(`start ${pair.id} ${side} ${url}`);
    const env = await captureUrl(context, url, `${DIRS.shots}/${pair.id}-${side}.png`);
    fs.writeFileSync(snapFile, JSON.stringify(env, null, 2));
    console.log(env.error ? `FAIL  ${pair.id} ${side}: ${env.error}` : `ok    ${pair.id} ${side}`);
  }
}
await browser.close();
