import { NETWORKIDLE_MS, SETTLE_MS } from '../config.js';

const COOKIE_SELECTOR = [
  '#onetrust-accept-btn-handler',
  'button[id*="accept" i]',
  'button[class*="cookie" i]',
  '.cookie-consent button',
].join(', ');

export function looksBlocked(title, bodyText) {
  const probe = `${title} ${String(bodyText).slice(0, 500)}`;
  return /access denied|attention required|pardon our interruption|request unsuccessful|challenge-platform|you don'?t have permission/i.test(probe);
}

export async function preparePage(page) {
  await page.addStyleTag({
    content: '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important;}',
  }).catch(() => {});

  // One combined probe instead of one 1s wait per selector.
  try {
    const btn = page.locator(COOKIE_SELECTOR).first();
    await btn.waitFor({ state: 'visible', timeout: 1500 });
    await btn.click({ timeout: 2000 });
  } catch {
    // no cookie banner present — proceed
  }

  // Scroll through the page to trigger lazy-loaded images, then return to top.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    const max = document.body.scrollHeight;
    for (let y = 0; y <= max; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle', { timeout: NETWORKIDLE_MS }).catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}
