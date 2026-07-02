import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { extractSnapshot } from '../src/capture/snapshot.js';

// Served over local HTTP (not file://) so relative links resolve to http:// URLs,
// which extractSnapshot's /^https?:/ filter keeps.
let server, base, browser, page;
before(async () => {
  const html = readFileSync(new URL('./fixtures/sample.html', import.meta.url));
  server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto(`${base}/`);
});
after(async () => { await browser.close(); server.close(); });

test('tags links with their region; nav-inside-header is nav', async () => {
  const snap = await page.evaluate(extractSnapshot);
  const nav = snap.links.find((l) => l.href.endsWith('/th/investor-relations'));
  assert.equal(nav.region, 'nav'); // nearest landmark (nav) wins over header
  const main = snap.links.find((l) => l.href.endsWith('/th/personal/cards'));
  assert.equal(main.region, 'main');
  const foot = snap.links.find((l) => l.href.endsWith('/th/privacy'));
  assert.equal(foot.region, 'footer');
});

test('tags text blocks with region; footer text is footer, hero text is main', async () => {
  const snap = await page.evaluate(extractSnapshot);
  const hero = snap.textBlocks.find((b) => b.text === 'โปรโมชั่นพิเศษ');
  assert.equal(hero.region, 'main');
  const foot = snap.textBlocks.find((b) => b.text === 'สงวนลิขสิทธิ์');
  assert.equal(foot.region, 'footer');
});

test('tags images with region', async () => {
  const snap = await page.evaluate(extractSnapshot);
  const img = snap.images.find((i) => i.src.includes('hero-banner.jpg'));
  assert.ok(img);
  assert.equal(img.region, 'main');
  assert.equal(img.renderedWidth, 400);
});

test('segmentation descends through the single wrapper to the real sections', async () => {
  const snap = await page.evaluate(extractSnapshot);
  // main has one child (div.wrapper); descent yields hero + products (10px div filtered out)
  assert.equal(snap.modules.length, 2);
  assert.deepEqual(snap.modules.map((m) => m.heading), ['โปรโมชั่นพิเศษ', 'Products']);
  assert.ok(snap.modules.every((m) => m.region === 'main'));
});

test('records finalUrl and title', async () => {
  const snap = await page.evaluate(extractSnapshot);
  assert.equal(snap.title, 'Fixture Page');
  assert.ok(snap.finalUrl.startsWith(base));
});
