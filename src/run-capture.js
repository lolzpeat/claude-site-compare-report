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

    // Original (www) and migrated (prod-aem) are different hosts with
    // independent WAF limits, so capture both sides concurrently in their
    // own contexts. Link statuses are only used for the migrated side.
    const sides = [
      ['orig', pair.originalUrl, false],
      ['mig', pair.migratedUrl, true],
    ];
    const results = await Promise.all(sides.map(async ([side, url, checkLinkStatuses]) => {
      const snapFile = `${DIRS.snapshots}/${pair.id}-${side}.json`;
      const snap = readEnv(snapFile);
      if (snap && !snap.error) {
        console.log(`skip  ${pair.id} ${side} (already captured)`);
        return false;
      }
      console.log(`start ${pair.id} ${side} ${url}`);
      const context = await newPageContext(browser);
      try {
        const env = await captureUrl(context, url, `${DIRS.shots}/${pair.id}-${side}.png`, { checkLinkStatuses });
        fs.writeFileSync(snapFile, JSON.stringify(env, null, 2));
        console.log(env.error ? `FAIL  ${pair.id} ${side}: ${env.error}` : `ok    ${pair.id} ${side}`);
      } finally {
        await context.close().catch(() => {});
      }
      return true;
    }));
    prevPairDidWork = results.some(Boolean);
  }
} finally {
  await browser.close().catch(() => {});
}
