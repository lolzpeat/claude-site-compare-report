const COOKIE_SELECTORS = [
  '#onetrust-accept-btn-handler',
  'button[id*="accept" i]',
  'button[class*="cookie" i]',
  '.cookie-consent button',
];

export function looksBlocked(title, bodyText) {
  const probe = `${title} ${String(bodyText).slice(0, 500)}`;
  return /access denied|attention required|pardon our interruption|request unsuccessful|challenge-platform|you don'?t have permission/i.test(probe);
}

export async function preparePage(page) {
  await page.addStyleTag({
    content: '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important;}',
  }).catch(() => {});

  for (const sel of COOKIE_SELECTORS) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      break;
    }
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
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(500);
}
