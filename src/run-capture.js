import fs from 'node:fs';
import { chromium } from 'playwright';
import { parsePages } from './input.js';
import { DIRS, INTER_PAGE_DELAY_MS, WAF_COOLDOWN_MS } from './config.js';
import { newPageContext } from './capture/browser.js';
import { captureUrl } from './capture/capture.js';

const argVal = (flag) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null);
const only = argVal('--only');
const sheet = argVal('--sheet');
const pairs = parsePages(fs.readFileSync('pages.csv', 'utf8'))
  .filter((p) => !only || p.id === only)
  .filter((p) => !sheet || p.sheet === sheet);
if (pairs.length === 0) {
  console.error(`No pairs matched${only ? ` --only ${only}` : ''}${sheet ? ` --sheet "${sheet}"` : ''}`);
  process.exit(1);
}
console.log(`capturing ${pairs.length} pairs${sheet ? ` from sheet "${sheet}"` : ''}`);

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
  let consecutiveBlocks = 0;
  const tally = { ok: 0, fail: 0, blocked: 0 };
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
        return { didWork: false, blocked: false };
      }
      console.log(`start ${pair.id} ${side} ${url}`);
      const context = await newPageContext(browser);
      try {
        const env = await captureUrl(context, url, `${DIRS.shots}/${pair.id}-${side}.png`, { checkLinkStatuses });
        fs.writeFileSync(snapFile, JSON.stringify(env, null, 2));
        console.log(env.error ? `FAIL  ${pair.id} ${side}: ${env.error}` : `ok    ${pair.id} ${side}`);
        if (env.error) tally[env.blocked ? 'blocked' : 'fail']++; else tally.ok++;
        return { didWork: true, blocked: Boolean(env.blocked) };
      } finally {
        await context.close().catch(() => {});
      }
    }));
    prevPairDidWork = results.some((r) => r.didWork);

    // WAF cool-down: a block cascades if we keep hammering, so pause hard and
    // back off progressively on consecutive blocks. Resume retries only failures.
    if (results.some((r) => r.blocked)) {
      consecutiveBlocks++;
      const cool = WAF_COOLDOWN_MS * Math.min(consecutiveBlocks, 3);
      console.log(`WAF block — cooling down ${Math.round(cool / 60000)} min (streak ${consecutiveBlocks})`);
      await sleep(cool);
    } else if (prevPairDidWork) {
      consecutiveBlocks = 0;
    }
  }
  console.log(`\ndone: ${tally.ok} ok, ${tally.fail} failed, ${tally.blocked} WAF-blocked`);
} finally {
  await browser.close().catch(() => {});
}
