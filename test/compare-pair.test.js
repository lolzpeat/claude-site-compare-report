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
