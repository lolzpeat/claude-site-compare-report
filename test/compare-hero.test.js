import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareHero } from '../src/compare/hero.js';

const env = (modules) => ({
  snapshot: { finalUrl: 'https://x/p', title: 't', links: [], images: [], textBlocks: [], modules },
});
const mod = (heading, imageFiles, region = 'main') => ({
  tag: 'div', className: 'c', heading, imageFiles, height: 500, region,
});

test('no hero on original (first main module has no image) → no issues, never guess', () => {
  const issues = compareHero(
    env([mod('หัวข้อ', [])]),
    env([]),
  );
  assert.deepEqual(issues, []);
});

test('hero image missing on migrated → one hero Medium', () => {
  const issues = compareHero(
    env([mod('สินเชื่อบ้าน', ['hero-home-loan.jpg'])]),
    env([mod('สินเชื่อบ้าน', [])]),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'hero');
  assert.equal(issues[0].severity, 'Medium');
  assert.equal(issues[0].zone, 'hero');
  assert.equal(issues[0].original, 'hero-home-loan.jpg');
});

test('same hero image, case-insensitive filename → no issue', () => {
  const issues = compareHero(
    env([mod('สินเชื่อบ้าน', ['Hero-Home-Loan.JPG'])]),
    env([mod('สินเชื่อบ้าน', ['hero-home-loan.jpg'])]),
  );
  assert.deepEqual(issues, []);
});

test('different hero image file → hero Medium with both filenames', () => {
  const issues = compareHero(
    env([mod('สินเชื่อบ้าน', ['hero-home-loan.jpg'])]),
    env([mod('สินเชื่อบ้าน', ['default-banner.jpg'])]),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].original, 'hero-home-loan.jpg');
  assert.equal(issues[0].migrated, 'default-banner.jpg');
});

test('hero heading differs → hero Medium', () => {
  const issues = compareHero(
    env([mod('สินเชื่อบ้านบัวหลวง', ['h.jpg'])]),
    env([mod('Home Loan', ['h.jpg'])]),
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0].description, /heading/i);
});

test('first module considered is the first main-region module', () => {
  const issues = compareHero(
    env([mod('chrome', ['logo.png'], 'header'), mod('ฮีโร่', ['hero.jpg'])]),
    env([mod('ฮีโร่', ['hero.jpg'])]),
  );
  assert.deepEqual(issues, []);
});

test('migrated missing modules entirely → hero image missing issue', () => {
  const issues = compareHero(
    env([mod('ฮีโร่', ['hero.jpg'])]),
    env([]),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].migrated, '(none)');
});
