import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparePair } from '../src/compare/compare.js';

const healthy = (over = {}) => ({
  requestedUrl: 'https://x/p', blocked: false, error: null, linkStatuses: {},
  snapshot: { finalUrl: 'https://x/p', title: 't', links: [], images: [], textBlocks: [], modules: [] },
  ...over,
});

test('null envelope on either side yields Capture Failed and runs no comparators', () => {
  const r = comparePair(null, healthy());
  assert.equal(r.status, 'Capture Failed');
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].category, 'capture-failure');
  assert.equal(r.issues[0].severity, 'High');
});

test('error envelope yields Capture Failed even with both files present', () => {
  const r = comparePair(healthy(), healthy({ error: 'WAF_BLOCKED', snapshot: null }));
  assert.equal(r.status, 'Capture Failed');
  assert.match(r.issues[0].description, /migrated/);
});

test('both sides failing yields two capture-failure issues', () => {
  const r = comparePair(null, null);
  assert.equal(r.issues.length, 2);
});

test('healthy identical pair passes with zero issues', () => {
  const r = comparePair(healthy(), healthy());
  assert.equal(r.status, 'Passed');
  assert.deepEqual(r.issues, []);
});

const notFound = (over = {}) => healthy({
  snapshot: { finalUrl: 'https://x/p', title: 'ไม่พบหน้าที่คุณต้องการ', links: [], images: [], textBlocks: ['ไม่พบหน้าที่คุณต้องการ'], modules: [] },
  ...over,
});

test('migrated 404 yields Not Migrated with one High issue and no comparators', () => {
  const r = comparePair(healthy(), notFound());
  assert.equal(r.status, 'Not Migrated');
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].severity, 'High');
  assert.match(r.issues[0].description, /Migrated URL serves a 404/);
});

test('original 404 with migrated content yields Retired on Original', () => {
  const r = comparePair(notFound(), healthy());
  assert.equal(r.status, 'Retired on Original');
  assert.match(r.issues[0].description, /Original URL serves a 404/);
});

test('both sides 404 yields Retired on Original noting both', () => {
  const r = comparePair(notFound(), notFound());
  assert.equal(r.status, 'Retired on Original');
  assert.match(r.issues[0].description, /Both original and migrated/);
});

test('every early-return path includes empty chromeIssues and chromeStats', () => {
  for (const r of [comparePair(null, healthy()), comparePair(healthy(), notFound()), comparePair(notFound(), healthy())]) {
    assert.deepEqual(r.chromeIssues, []);
    assert.deepEqual(r.chromeStats, []);
  }
});

test('chrome issues do not affect page status', () => {
  const orig = healthy({
    snapshot: { finalUrl: 'https://x/p', title: 't', images: [], textBlocks: [], modules: [],
      links: [{ href: 'https://www.bangkokbank.com/th-TH/Gone', text: 'หายไป', region: 'footer' }] },
  });
  const r = comparePair(orig, healthy());
  assert.equal(r.status, 'Passed');
  assert.equal(r.issues.length, 0);
  assert.equal(r.chromeIssues.length, 1);
  assert.equal(r.chromeIssues[0].zone, 'footer');
  assert.equal(r.chromeStats.length, 2);
});

test('hero issues DO affect page status', () => {
  const withHero = (files) => healthy({
    snapshot: { finalUrl: 'https://x/p', title: 't', links: [], images: [], textBlocks: [],
      modules: [{ tag: 'div', className: 'c', heading: 'ฮีโร่', imageFiles: files, height: 500, region: 'main' }] },
  });
  const r = comparePair(withHero(['hero.jpg']), withHero([]));
  assert.equal(r.status, 'Failed');
  assert.equal(r.issues[0].category, 'hero');
});

test('News-Detail pages get chrome checks but never hero', () => {
  const newsUrl = 'https://prod-aem.bangkokbank.com/th/news-and-media/2026/0a1b2c3d-0000-1111-2222-333344445555';
  const origUrl = 'https://www.bangkokbank.com/th-TH/News-and-Media/News-Detail?id=x';
  const withHeroAndChrome = healthy({
    requestedUrl: origUrl,
    snapshot: { finalUrl: origUrl, title: 't', images: [], textBlocks: [],
      links: [{ href: 'https://www.bangkokbank.com/th-TH/Gone', text: 'หายไป', region: 'footer' }],
      modules: [{ tag: 'div', className: 'c', heading: 'ฮีโร่', imageFiles: ['hero.jpg'], height: 500, region: 'main' }] },
  });
  // requestedUrl must match finalUrl on both sides here (unlike other fixtures) so
  // detectRedirects — which still runs for News-Detail pages — stays silent and this
  // test isolates chrome-vs-hero routing, not redirect detection.
  const mig = healthy({ requestedUrl: newsUrl, snapshot: { finalUrl: newsUrl, title: 't', links: [], images: [], textBlocks: [], modules: [] } });
  const r = comparePair(withHeroAndChrome, mig);
  assert.equal(r.chromeIssues.length, 1); // chrome runs on News-Detail
  assert.equal(r.issues.filter((i) => i.category === 'hero').length, 0); // hero does not
  assert.ok(r.issues.every((i) => i.category === 'news-element')); // routed to the news comparator
});
