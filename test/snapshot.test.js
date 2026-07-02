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

test('extracts links with absolute hrefs and text', async () => {
  const snap = await page.evaluate(extractSnapshot);
  const hrefs = snap.links.map((l) => l.href);
  assert.ok(hrefs.some((h) => h.endsWith('/th/personal/cards')));
  assert.ok(hrefs.includes('https://external.example.com/x'));
  assert.ok(snap.links.some((l) => l.text === 'บัตรเครดิต'));
});

test('extracts images with natural and rendered dimensions', async () => {
  const snap = await page.evaluate(extractSnapshot);
  const img = snap.images.find((i) => i.src.includes('hero-banner.jpg'));
  assert.ok(img);
  assert.equal(img.renderedWidth, 400);
  assert.equal(img.renderedHeight, 225);
});

test('extracts text blocks and modules with headings', async () => {
  const snap = await page.evaluate(extractSnapshot);
  assert.ok(snap.textBlocks.includes('โปรโมชั่นพิเศษ'));
  assert.ok(snap.textBlocks.includes('รายละเอียดผลิตภัณฑ์ของเรา'));
  const headings = snap.modules.map((m) => m.heading);
  assert.deepEqual(headings, ['โปรโมชั่นพิเศษ', 'Products']); // 10px div filtered out
  assert.deepEqual(snap.modules[0].imageFiles, ['hero-banner.jpg']);
});

test('records finalUrl and title', async () => {
  const snap = await page.evaluate(extractSnapshot);
  assert.equal(snap.title, 'Fixture Page');
  assert.ok(snap.finalUrl.startsWith(base));
});
