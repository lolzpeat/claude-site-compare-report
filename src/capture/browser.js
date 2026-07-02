import { chromium } from 'playwright';
import { VIEWPORT } from '../config.js';

export async function launchContext() {
  // Headed system Chrome: both sites block non-browser clients (WAF).
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'th-TH' });
  return { browser, context };
}
