import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { captureUrl } from '../src/capture/capture.js';

let server, base, browser, context, counts, tmpDir;

before(async () => {
  counts = { blocked: 0, ok: 0 };
  server = http.createServer((req, res) => {
    if (req.url === '/blocked') {
      counts.blocked += 1;
      res.statusCode = 200;
      res.end('<html><head><title>Access Denied</title></head><body>You don\'t have permission</body></html>');
    } else if (req.url === '/ok') {
      counts.ok += 1;
      res.statusCode = 200;
      res.end('<html><head><title>OK Page</title></head><body><h1>Hello</h1></body></html>');
    } else {
      res.statusCode = 404;
      res.end('nope');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  context = await browser.newContext();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-'));
});

after(async () => {
  await context.close();
  await browser.close();
  server.closeAllConnections();
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('escapes retry loop on WAF block with sticky blocked flag and no repeat requests', async () => {
  const shotPath = path.join(tmpDir, 'blocked.png');
  const env = await captureUrl(context, `${base}/blocked`, shotPath);
  assert.equal(env.blocked, true);
  assert.equal(env.snapshot, null);
  assert.match(env.error, /WAF_BLOCKED/);
  assert.equal(counts.blocked, 1);
});

test('captures a normal page successfully', async () => {
  const shotPath = path.join(tmpDir, 'ok.png');
  const env = await captureUrl(context, `${base}/ok`, shotPath);
  assert.equal(env.blocked, false);
  assert.equal(env.error, null);
  assert.ok(env.snapshot);
  assert.match(env.snapshot.finalUrl, /\/ok$/);
  assert.ok(fs.existsSync(shotPath));
});
