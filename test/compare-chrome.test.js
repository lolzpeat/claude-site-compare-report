import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareChrome } from '../src/compare/chrome.js';

const ORIG = 'https://www.bangkokbank.com';
const MIG = 'https://prod-aem.bangkokbank.com';

const env = (links, linkStatuses = {}) => ({
  requestedUrl: 'https://x/p', linkStatuses,
  snapshot: { finalUrl: 'https://x/p', title: 't', links, images: [], textBlocks: [], modules: [] },
});

test('matched chrome link with same Thai label yields no issues', () => {
  const { issues } = compareChrome(
    env([{ href: `${ORIG}/th-TH/Personal`, text: 'บุคคล', region: 'nav' }]),
    env([{ href: `${MIG}/th/personal`, text: 'บุคคล', region: 'header' }]),
  );
  assert.deepEqual(issues, []);
});

test('orig nav matches mig header — both map to the header-nav zone', () => {
  const { issues, stats } = compareChrome(
    env([{ href: `${ORIG}/th-TH/Loans`, text: 'สินเชื่อ', region: 'nav' }]),
    env([{ href: `${MIG}/th/loans`, text: 'สินเชื่อ', region: 'header' }]),
  );
  assert.deepEqual(issues, []);
  assert.equal(stats[0].zone, 'header-nav');
  assert.equal(stats[0].matched, 1);
});

test('missing chrome link yields link-target Medium tagged with its zone', () => {
  const { issues } = compareChrome(
    env([{ href: `${ORIG}/th-TH/Help-Center`, text: 'ศูนย์ความช่วยเหลือ', region: 'footer' }]),
    env([]),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'link-target');
  assert.equal(issues[0].severity, 'Medium');
  assert.equal(issues[0].zone, 'footer');
  assert.match(issues[0].original, /help-center/);
});

test('English label on a matched URL yields text-language High with both labels', () => {
  const { issues } = compareChrome(
    env([{ href: `${ORIG}/th-TH/International-Banking`, text: 'กิจการธนาคารต่างประเทศ', region: 'header' }]),
    env([{ href: `${MIG}/th/international-banking`, text: 'International Banking', region: 'header' }]),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'text-language');
  assert.equal(issues[0].severity, 'High');
  assert.equal(issues[0].zone, 'header-nav');
  assert.equal(issues[0].original, 'กิจการธนาคารต่างประเทศ');
  assert.equal(issues[0].migrated, 'International Banking');
});

test('different Thai label on a matched URL yields menu-label Medium', () => {
  const { issues } = compareChrome(
    env([{ href: `${ORIG}/th-TH/IBanking`, text: 'บัวหลวง ไอแบงก์กิ้ง', region: 'nav' }]),
    env([{ href: `${MIG}/th/ibanking`, text: 'บริการธนาคารทางอินเทอร์เน็ต', region: 'header' }]),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'menu-label');
  assert.equal(issues[0].severity, 'Medium');
});

test('coverage summary fires once when under half of ≥5 mappable links match', () => {
  const links = ['A', 'B', 'C', 'D', 'E'].map((p) => ({
    href: `${ORIG}/th-TH/${p}`, text: p, region: 'footer',
  }));
  const { issues } = compareChrome(env(links), env([]));
  const summary = issues.filter((i) => i.keyHint === 'chrome-footer-coverage');
  assert.equal(summary.length, 1);
  assert.equal(summary[0].severity, 'High');
  assert.equal(summary[0].zone, 'footer');
});

test('no coverage summary with fewer than 5 mappable links', () => {
  const links = ['A', 'B'].map((p) => ({ href: `${ORIG}/th-TH/${p}`, text: p, region: 'footer' }));
  const { issues } = compareChrome(env(links), env([]));
  assert.equal(issues.filter((i) => i.keyHint).length, 0);
});

test('chrome-region 404 becomes a zone-tagged broken-link issue', () => {
  const migEnv = env(
    [{ href: `${MIG}/th/privacy`, text: 'นโยบายความเป็นส่วนตัว', region: 'footer' }],
    { [`${MIG}/th/privacy`]: 404 },
  );
  const { issues } = compareChrome(env([]), migEnv);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'broken-link');
  assert.equal(issues[0].zone, 'footer');
});

test('main-region links are ignored entirely', () => {
  const { issues, stats } = compareChrome(
    env([{ href: `${ORIG}/th-TH/Article`, text: 'บทความ', region: 'main' }]),
    env([], { 'https://m/main-404': 404 }),
  );
  assert.deepEqual(issues, []);
  assert.equal(stats[0].orig + stats[1].orig, 0);
});

test('stats reports per-zone orig/mig/matched/missing counts', () => {
  const { stats } = compareChrome(
    env([
      { href: `${ORIG}/th-TH/A`, text: 'เอ', region: 'nav' },
      { href: `${ORIG}/th-TH/B`, text: 'บี', region: 'header' },
      { href: `${ORIG}/th-TH/F`, text: 'เอฟ', region: 'footer' },
    ]),
    env([
      { href: `${MIG}/th/a`, text: 'เอ', region: 'header' },
      { href: `${MIG}/th/f`, text: 'เอฟ', region: 'footer' },
    ]),
  );
  assert.deepEqual(stats, [
    { zone: 'header-nav', orig: 2, mig: 1, matched: 1, missing: 1 },
    { zone: 'footer', orig: 1, mig: 1, matched: 1, missing: 0 },
  ]);
});
