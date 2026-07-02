import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareModules } from '../src/compare/modules.js';

const mod = (heading, imageFiles = [], height = 300) =>
  ({ tag: 'section', className: '', heading, imageFiles, height });
const env = (modules) => ({
  requestedUrl: 'https://x/', blocked: false, error: null, linkStatuses: {},
  snapshot: { finalUrl: 'https://x/', title: '', links: [], images: [], textBlocks: [], modules },
});

test('flags original module missing on migrated as High', () => {
  const orig = env([mod('โปรโมชั่น'), mod('เครื่องมือคำนวณ')]);
  const mig = env([mod('โปรโมชั่น')]);
  const issues = compareModules(orig, mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'missing-module');
  assert.equal(issues[0].severity, 'High');
  assert.match(issues[0].description, /เครื่องมือคำนวณ/);
});

test('matches modules by image filename when headings differ', () => {
  const orig = env([mod('', ['hero-banner.jpg'])]);
  const mig = env([mod('New Heading', ['hero-banner.jpg'])]);
  assert.deepEqual(compareModules(orig, mig), []);
});

test('ignores small modules and modules with no identity', () => {
  const orig = env([mod('เล็ก', [], 50), mod('', [], 500)]);
  const mig = env([]);
  assert.deepEqual(compareModules(orig, mig), []);
});
