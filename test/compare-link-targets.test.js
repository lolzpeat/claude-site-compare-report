import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareLinkTargets } from '../src/compare/link-targets.js';

const env = (links) => ({
  requestedUrl: 'https://x/', blocked: false, error: null, linkStatuses: {},
  snapshot: { finalUrl: 'https://x/', title: '', links: links.map((l) => ({ region: 'main', ...l })), images: [], textBlocks: [], modules: [] },
});

const O = 'https://www.bangkokbank.com';
const M = 'https://prod-aem.bangkokbank.com';

test('flags an original link whose transformed destination is not linked on migrated', () => {
  const orig = env([{ href: `${O}/th-TH/Investor-Relations`, text: 'นักลงทุนสัมพันธ์' }]);
  const mig = env([{ href: `${M}/en/mutual-fund`, text: 'Investor Relations' }]);
  const issues = compareLinkTargets(orig, mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'link-target');
  assert.equal(issues[0].severity, 'High');
  assert.match(issues[0].description, /นักลงทุนสัมพันธ์/);
  assert.match(issues[0].description, /investor-relations/);
  assert.match(issues[0].original, /investor-relations/);
  assert.equal(issues[0].migrated, 'not linked');
});

test('a link-target issue carries the original link’s region', () => {
  const orig = env([{ href: `${O}/th-TH/Investor-Relations`, text: 'นักลงทุนสัมพันธ์', region: 'nav' }]);
  const mig = env([{ href: `${M}/en/mutual-fund`, text: 'IR' }]);
  const issues = compareLinkTargets(orig, mig);
  assert.equal(issues[0].region, 'nav');
});

test('no issue when migrated links to the expected transformed destination', () => {
  const orig = env([{ href: `${O}/th-TH/Investor-Relations`, text: 'นักลงทุนสัมพันธ์' }]);
  const mig = env([{ href: `${M}/th/investor-relations`, text: 'Investor Relations' }]);
  assert.deepEqual(compareLinkTargets(orig, mig), []);
});

test('matching ignores trailing slash and case on the migrated side', () => {
  const orig = env([{ href: `${O}/th-TH/Personal/My-Home`, text: 'บ้าน' }]);
  const mig = env([{ href: `${M}/th/personal/my-home/`, text: 'Home' }]);
  assert.deepEqual(compareLinkTargets(orig, mig), []);
});

test('skips external links and non-th-TH links', () => {
  const orig = env([
    { href: 'https://www.facebook.com/bangkokbank', text: 'Facebook' },
    { href: `${O}/en/Personal/Cards`, text: 'EN Cards' },
  ]);
  const mig = env([]);
  assert.deepEqual(compareLinkTargets(orig, mig), []);
});

test('skips query-string links (news/dynamic pages restructure, no simple transform)', () => {
  const orig = env([{ href: `${O}/th-TH/About-Us/News-and-Media/News-Detail?id=ABC&tag=New`, text: 'ข่าว' }]);
  const mig = env([]);
  assert.deepEqual(compareLinkTargets(orig, mig), []);
});

test('dedupes by destination and caps at 20 with a High summary beyond the cap', () => {
  const orig = env(Array.from({ length: 25 }, (_, i) => ({ href: `${O}/th-TH/Page-${i}`, text: `ลิงก์ ${i}` })));
  const mig = env([]);
  const issues = compareLinkTargets(orig, mig);
  const perLink = issues.filter((i) => /no matching link/.test(i.description));
  const summary = issues.filter((i) => /25 original links/.test(i.description));
  assert.equal(perLink.length, 20);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].severity, 'High');
  assert.equal(summary[0].keyHint, 'link-targets-missing-summary');
});
