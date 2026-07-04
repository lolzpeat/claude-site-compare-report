import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCriteria } from '../src/report/criteria.js';
import { IMAGE_RATIO_TOLERANCE, THAI_RATIO_DELTA, SYSTEMIC_THRESHOLD, SYSTEMIC_MIN_PAGES, MAX_LINK_CHECKS } from '../src/config.js';
import { CATEGORY_LABEL, STATUS_LABEL, SEVERITY_LABEL } from '../src/report/labels.js';

test('renders the live config thresholds (no divorced literals)', () => {
  const html = renderCriteria();
  assert.ok(html.includes(`${Math.round(IMAGE_RATIO_TOLERANCE * 100)}%`), 'image ratio %');
  assert.ok(html.includes(`${Math.round(THAI_RATIO_DELTA * 100)} จุด`), 'thai delta points');
  assert.ok(html.includes(`${Math.round(SYSTEMIC_THRESHOLD * 100)}%`), 'systemic %');
  assert.ok(html.includes(String(SYSTEMIC_MIN_PAGES)), 'min pages');
  assert.ok(html.includes(String(MAX_LINK_CHECKS)), 'max link checks');
});

test('lists every category, status, and severity Thai label', () => {
  const html = renderCriteria();
  for (const label of Object.values(CATEGORY_LABEL)) assert.ok(html.includes(label), `missing category label ${label}`);
  for (const label of Object.values(STATUS_LABEL)) assert.ok(html.includes(label), `missing status label ${label}`);
  for (const label of Object.values(SEVERITY_LABEL)) assert.ok(html.includes(label), `missing severity label ${label}`);
});

test('is a Thai HTML document with the expected sections', () => {
  const html = renderCriteria();
  assert.match(html, /^<!doctype html><html lang="th">/);
  assert.match(html, /เกณฑ์การตรวจรายหมวด/);
  assert.match(html, /ค่าเกณฑ์/);
  assert.match(html, /สถานะการตรวจ/);
  assert.match(html, /ระดับความรุนแรง/);
  assert.match(html, /การรวมปัญหาระดับทั้งเว็บ/);
});

test('criteria page documents chrome zones, menu-label, hero and ZONE_COVERAGE_MIN', () => {
  const html = renderCriteria();
  assert.match(html, /menu-label/);
  assert.match(html, /hero/);
  assert.match(html, /ZONE_COVERAGE_MIN/);
  assert.match(html, /โซนส่วนกลาง/);
});
