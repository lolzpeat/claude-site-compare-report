import { chromium } from 'playwright';
import { VIEWPORT } from '../config.js';

export async function launchContext() {
  // Headed system Chrome: both sites block non-browser clients (WAF).
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await newPageContext(browser);
  return { browser, context };
}

export async function newPageContext(browser) {
  return browser.newContext({ viewport: VIEWPORT, locale: 'th-TH' });
}
