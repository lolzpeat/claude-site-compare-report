import fs from 'node:fs';
import { chromium } from 'playwright';
import { parsePages } from './input.js';
import { DIRS, INTER_PAGE_DELAY_MS } from './config.js';
import { newPageContext } from './capture/browser.js';
import { captureUrl } from './capture/capture.js';

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const pairs = parsePages(fs.readFileSync('pages.csv', 'utf8')).filter((p) => !only || p.id === only);
if (pairs.length === 0) { console.error(`No pairs matched${only ? ` --only ${only}` : ''}`); process.exit(1); }

for (const dir of [DIRS.shots, DIRS.snapshots]) fs.mkdirSync(dir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readEnv = (file) => {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`warn: unreadable snapshot ${file}: ${e.message}`);
    return null;
  }
};

// Headed system Chrome: both sites block non-browser clients (WAF).
const browser = await chromium.launch({ channel: 'chrome', headless: false });

try {
  let isFirstPair = true;
  let prevPairDidWork = false;
  for (const pair of pairs) {
    if (!isFirstPair && prevPairDidWork) {
      console.log(`wait  ${INTER_PAGE_DELAY_MS}ms before next pair`);
      await sleep(INTER_PAGE_DELAY_MS);
    }
    isFirstPair = false;

    const context = await newPageContext(browser);
    let didWork = false;
    for (const [side, url] of [['orig', pair.originalUrl], ['mig', pair.migratedUrl]]) {
      const snapFile = `${DIRS.snapshots}/${pair.id}-${side}.json`;
      const snap = readEnv(snapFile);
      if (snap && !snap.error) {
        console.log(`skip  ${pair.id} ${side} (already captured)`);
        continue;
      }
      console.log(`start ${pair.id} ${side} ${url}`);
      const env = await captureUrl(context, url, `${DIRS.shots}/${pair.id}-${side}.png`);
      fs.writeFileSync(snapFile, JSON.stringify(env, null, 2));
      console.log(env.error ? `FAIL  ${pair.id} ${side}: ${env.error}` : `ok    ${pair.id} ${side}`);
      didWork = true;
    }
    await context.close();
    prevPairDidWork = didWork;
  }
} finally {
  await browser.close().catch(() => {});
}
