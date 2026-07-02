import { NAV_TIMEOUT_MS, NETWORKIDLE_MS, RETRIES, MAX_LINK_CHECKS, LINK_CHECK_BATCH } from '../config.js';
import { extractSnapshot } from './snapshot.js';
import { preparePage, looksBlocked } from './page-prep.js';
import { checkLinks } from './link-check.js';

export async function captureUrl(context, url, shotPath, { checkLinkStatuses = true } = {}) {
  let lastError = null;
  let wasBlocked = false;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      await page.waitForLoadState('networkidle', { timeout: NETWORKIDLE_MS }).catch(() => {});
      await preparePage(page);

      const snapshot = await page.evaluate(extractSnapshot);
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
      if (looksBlocked(snapshot.title, bodyText)) throw new Error('WAF_BLOCKED');

      await page.screenshot({ path: shotPath, fullPage: true });

      // Link statuses are only consumed for the migrated side; skip on original to save time.
      let linkStatuses = {};
      if (checkLinkStatuses) {
        const origin = new URL(snapshot.finalUrl).origin;
        const sameOrigin = [...new Set(
          snapshot.links.map((l) => l.href).filter((h) => { try { return new URL(h).origin === origin; } catch { return false; } }),
        )].slice(0, MAX_LINK_CHECKS);
        linkStatuses = await checkLinks(page, sameOrigin, undefined, LINK_CHECK_BATCH);
      }

      await page.close();
      return { requestedUrl: url, snapshot, linkStatuses, blocked: false, error: null };
    } catch (e) {
      lastError = e;
      await page.close().catch(() => {});
      if (/WAF_BLOCKED/.test(String(e))) { wasBlocked = true; break; }
    }
  }
  return {
    requestedUrl: url, snapshot: null, linkStatuses: {},
    blocked: wasBlocked, error: String(lastError),
  };
}
