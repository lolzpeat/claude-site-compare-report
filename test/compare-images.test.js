import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchImages, compareImages } from '../src/compare/images.js';

const img = (src, nw, nh, rw, rh) =>
  ({ src, naturalWidth: nw, naturalHeight: nh, renderedWidth: rw, renderedHeight: rh });
const env = (images) => ({
  requestedUrl: 'https://x/', blocked: false, error: null, linkStatuses: {},
  snapshot: { finalUrl: 'https://x/', title: '', links: [], images, textBlocks: [], modules: [] },
});

test('matches images by filename first, then by order', () => {
  const o = [img('https://x/a/hero.jpg', 8, 4, 8, 4), img('https://x/b/two.png', 4, 4, 4, 4)];
  const m = [img('https://y/z/other.png', 4, 4, 4, 4), img('https://y/q/HERO.jpg?v=2', 8, 4, 8, 4)];
  const pairs = matchImages(o, m);
  assert.equal(pairs.length, 2);
  const heroPair = pairs.find(([a]) => a.src.includes('hero'));
  assert.ok(heroPair[1].src.includes('HERO'));
});

test('flags rendered aspect-ratio difference beyond 2%', () => {
  const orig = env([img('https://x/hero.jpg', 1600, 900, 800, 450)]);   // 16:9
  const mig = env([img('https://y/hero.jpg', 1600, 900, 800, 500)]);    // squashed
  const issues = compareImages(orig, mig);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, 'image-ratio');
  assert.match(issues[0].description, /aspect ratio/i);
});

test('flags natural-vs-rendered distortion on migrated', () => {
  // Same rendered box on both sides (no ratio diff), but the migrated source is
  // a 1:1 image squeezed into 3:2 — distortion that is NEW on migrated.
  const orig = env([img('https://x/sq.png', 300, 200, 300, 200)]);
  const mig = env([img('https://y/sq.png', 500, 500, 300, 200)]);
  const issues = compareImages(orig, mig);
  assert.equal(issues.length, 1);
  assert.match(issues[0].description, /distort/i);
});

test('no issues for identical healthy images', () => {
  const a = env([img('https://x/h.jpg', 1600, 900, 800, 450)]);
  const b = env([img('https://y/h.jpg', 1600, 900, 800, 450)]);
  assert.deepEqual(compareImages(a, b), []);
});

test('flags significantly fewer images on migrated', () => {
  const o = env([1, 2, 3, 4, 5].map((i) => img(`https://x/${i}.jpg`, 4, 4, 4, 4)));
  const m = env([img('https://y/1.jpg', 4, 4, 4, 4)]);
  const issues = compareImages(o, m);
  assert.ok(issues.some((i) => i.category === 'missing-module' && /images/.test(i.description)));
});
