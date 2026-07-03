import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewsDetail, extractArticle, compareNewsDetail } from '../src/compare/news-detail.js';
import { comparePair } from '../src/compare/compare.js';

const MIG_URL =
  'https://prod-aem.bangkokbank.com/th/about-us/news-and-media/2569/3ae3ce57-9512-436b-9f18-ba198e727e2c';
const ORIG_URL =
  'https://www.bangkokbank.com/th-TH/About-Us/News-and-Media/News-Detail?id=3AE3CE57-9512-436B-9F18-BA198E727E2C&tag=New';

// Build a news-detail env. `over` overrides snapshot fields.
const env = (url, main, over = {}) => ({
  requestedUrl: url,
  blocked: false,
  error: null,
  linkStatuses: over.linkStatuses ?? {},
  snapshot: {
    finalUrl: over.finalUrl ?? url,
    title: 'ข่าวธนาคาร',
    links: over.links ?? [],
    images: over.images ?? [],
    textBlocks: main.map((t) => ({ text: t, region: 'main' })),
    modules: over.modules ?? [],
  },
});

const HEADLINE = 'ธนาคารกรุงเทพผนึกกรุงเทพประกันชีวิต เปิดตัว 2 แผนประกัน';
const BODY = 'ธนาคารกรุงเทพร่วมกับกรุงเทพประกันชีวิต เปิดตัวแผนประกันชีวิตสะสมทรัพย์ใหม่ '.repeat(6);
const SHARE = [
  { href: 'https://facebook.com/share', text: 'Facebook', region: 'main' },
  { href: 'https://x.com/share', text: 'X', region: 'main' },
  { href: 'https://line.me/share', text: 'Line', region: 'main' },
];
const HERO_MODULE = [{ heading: '', imageFiles: ['15jun2026_870.png'], height: 1972, region: 'main' }];
const TH_CRUMB = [
  { href: 'https://www.bangkokbank.com/th-TH/About-Us', text: 'เกี่ยวกับธนาคารกรุงเทพ', region: 'header' },
  { href: 'https://www.bangkokbank.com/th-TH/About-Us/News-and-Media', text: 'อัปเดตข่าวสาร', region: 'header' },
];
const EN_CRUMB = [
  { href: 'https://prod-aem.bangkokbank.com/th/about-us', text: 'About Us', region: 'header' },
  { href: 'https://prod-aem.bangkokbank.com/th/about-us/news-and-media', text: 'News And Media', region: 'header' },
];

const goodOrig = () =>
  env(ORIG_URL, [HEADLINE, '15 มิถุนายน 2569', BODY], {
    finalUrl: 'https://www.bangkokbank.com/th-TH/About-Us/News-and-Media/News-Detail',
    links: [...SHARE, ...TH_CRUMB],
    modules: HERO_MODULE,
  });

// ---- detection ----

test('isNewsDetail matches migrated year/GUID path', () => {
  assert.equal(isNewsDetail(env(ORIG_URL, []), env(MIG_URL, [])), true);
});

test('isNewsDetail matches original News-Detail path', () => {
  const o = env(ORIG_URL, []);
  const m = env('https://prod-aem.bangkokbank.com/th/about-us/news-and-media/landing', []);
  assert.equal(isNewsDetail(o, m), true);
});

test('isNewsDetail is false for a landing page', () => {
  const o = env('https://www.bangkokbank.com/th-TH/About-Us/News-and-Media/Flood-Relief', []);
  const m = env('https://prod-aem.bangkokbank.com/th/about-us/news-and-media/flood-relief', []);
  assert.equal(isNewsDetail(o, m), false);
});

// ---- extractArticle ----

test('extractArticle picks the short date block, not a body paragraph with a month name', () => {
  const body = `เมื่อวันที่ 8-14 มิถุนายน 2569 ธนาคารได้จัดกิจกรรม${'บริจาคโลหิต'.repeat(30)}`;
  const a = extractArticle(env(ORIG_URL, [HEADLINE, '12 มิถุนายน 2569', body]).snapshot);
  assert.equal(a.date, '12 มิถุนายน 2569');
  assert.equal(a.bodyText, body);
});

// ---- element checks ----

test('flags migrated date rendered as "Invalid Date"', () => {
  const mig = env(MIG_URL, [HEADLINE, 'Invalid Date', BODY], { links: EN_CRUMB, modules: HERO_MODULE });
  const issues = compareNewsDetail(goodOrig(), mig);
  const date = issues.find((i) => i.location === 'news:date');
  assert.ok(date, 'expected a news:date issue');
  assert.equal(date.category, 'news-element');
  assert.equal(date.severity, 'High');
  assert.match(date.description, /Invalid Date/);
  assert.equal(date.migrated, 'Invalid Date');
});

test('flags missing social share buttons on migrated', () => {
  const mig = env(MIG_URL, [HEADLINE, '15 มิถุนายน 2569', BODY], { links: EN_CRUMB, modules: HERO_MODULE });
  const share = compareNewsDetail(goodOrig(), mig).find((i) => i.location === 'news:share');
  assert.ok(share);
  assert.equal(share.severity, 'Medium');
  assert.match(share.original, /Facebook/);
  assert.equal(share.migrated, '(none)');
});

test('flags breadcrumb not localized to Thai', () => {
  const mig = env(MIG_URL, [HEADLINE, '15 มิถุนายน 2569', BODY], {
    links: [...SHARE, ...EN_CRUMB], modules: HERO_MODULE,
  });
  const bc = compareNewsDetail(goodOrig(), mig).find((i) => i.location === 'news:breadcrumb');
  assert.ok(bc);
  assert.equal(bc.severity, 'Low');
});

test('flags migrated headline that differs from original', () => {
  const mig = env(MIG_URL, ['พาดหัวข่าวที่ถูกเปลี่ยนไปจากต้นฉบับโดยสิ้นเชิง', '15 มิถุนายน 2569', BODY], {
    links: [...SHARE, ...EN_CRUMB], modules: HERO_MODULE,
  });
  const h = compareNewsDetail(goodOrig(), mig).find((i) => i.location === 'news:headline');
  assert.ok(h);
  assert.equal(h.severity, 'High');
});

test('flags missing body content on migrated', () => {
  const mig = env(MIG_URL, [HEADLINE, '15 มิถุนายน 2569', 'สั้นมาก'], {
    links: [...SHARE, ...EN_CRUMB], modules: HERO_MODULE,
  });
  const c = compareNewsDetail(goodOrig(), mig).find((i) => i.location === 'news:content');
  assert.ok(c);
  assert.equal(c.severity, 'High');
});

test('flags missing content image on migrated article', () => {
  const mig = env(MIG_URL, [HEADLINE, '15 มิถุนายน 2569', BODY], { links: [...SHARE, ...EN_CRUMB], modules: [] });
  const img = compareNewsDetail(goodOrig(), mig).find((i) => i.location === 'news:image');
  assert.ok(img);
  assert.equal(img.migrated, '(none)');
});

test('reports migrated links that 404 as broken-link', () => {
  const mangled = 'https://prod-aem.bangkokbank.com/th/about-us/news-and-media/2569/www.bangkoklife.com';
  const mig = env(MIG_URL, [HEADLINE, '15 มิถุนายน 2569', BODY], {
    links: [...SHARE, ...EN_CRUMB, { href: mangled, text: '', region: 'main' }],
    linkStatuses: { [mangled]: 404 },
    modules: HERO_MODULE,
  });
  const bl = compareNewsDetail(goodOrig(), mig).filter((i) => i.category === 'broken-link');
  assert.equal(bl.length, 1);
  assert.match(bl[0].migrated, /404/);
});

test('a fully-correct migrated article yields no news-element issues', () => {
  const mig = env(MIG_URL, [HEADLINE, '15 มิถุนายน 2569', BODY], {
    links: [...SHARE, ...TH_CRUMB.map((l) => ({ ...l, href: l.href.replace('/th-TH/', '/th/') }))],
    modules: HERO_MODULE,
  });
  const issues = compareNewsDetail(goodOrig(), mig).filter((i) => i.category === 'news-element');
  assert.deepEqual(issues, []);
});

// ---- routing through comparePair ----

test('comparePair routes News-Detail pages away from generic comparators', () => {
  const mig = env(MIG_URL, [HEADLINE, 'Invalid Date', BODY], { links: EN_CRUMB, modules: HERO_MODULE });
  const { status, issues } = comparePair(goodOrig(), mig);
  assert.equal(status, 'Failed');
  assert.ok(issues.some((i) => i.category === 'news-element'));
  // generic-only categories must NOT appear on a News-Detail page
  assert.ok(!issues.some((i) => ['link-target', 'text-language', 'missing-module', 'image-ratio'].includes(i.category)));
});
