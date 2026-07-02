import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import { checkLinks } from '../src/capture/link-check.js';
import { looksBlocked } from '../src/capture/page-prep.js';

let server, base, browser, page;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/ok') { res.statusCode = 200; res.end('<html><body>ok</body></html>'); }
    else { res.statusCode = 404; res.end('nope'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto(`${base}/ok`);
});
after(async () => { await browser.close(); server.close(); });

test('reports 200 for live links and 404 for dead links', async () => {
  const statuses = await checkLinks(page, [`${base}/ok`, `${base}/missing`]);
  assert.equal(statuses[`${base}/ok`], 200);
  assert.equal(statuses[`${base}/missing`], 404);
});

test('reports 0 for unreachable hosts', async () => {
  const statuses = await checkLinks(page, ['http://127.0.0.1:1/x']);
  assert.equal(statuses['http://127.0.0.1:1/x'], 0);
});

test('looksBlocked detects WAF challenge pages', () => {
  assert.equal(looksBlocked('Access Denied', 'You don\'t have permission'), true);
  assert.equal(looksBlocked('Pardon Our Interruption', '…'), true);
  assert.equal(looksBlocked('ธนาคารกรุงเทพ', 'บริการทางการเงิน'), false);
});
