/**
 * Solshot · solver and shadow tests.
 * Expected azimuth dates come from geometry, not from a table: e.g. at a mid-latitude site the
 * sun rises due-east (90°) around the equinox, and reaches due-south (180°) around noon every day.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'solshot-solve-'));

function stage(name) {
  const dest = path.join(tmp, name + '.mjs');
  let src = fs.readFileSync(path.join(root, 'src/engine', name + '.js'), 'utf8');
  // solve.js / shadow.js import './solar.js' — point them at the staged copy.
  src = src.replace("from './solar.js'", "from './solar.js'");
  fs.writeFileSync(dest, src);
  return 'file://' + dest;
}

// Stage solar.js first under its own name so the relative import resolves.
fs.copyFileSync(path.join(root, 'src/engine/solar.js'), path.join(tmp, 'solar.js'));
const solar = await import('file://' + path.join(tmp, 'solar.js'));
const solve = await import(stage('solve'));
const shadow = await import(stage('shadow'));

const fixture = JSON.parse(fs.readFileSync(path.resolve(root, '..', '数据', 'astral-fixture.json'), 'utf8'));
const bostonRow = fixture.rows.find((r) => r.city === 'Boston' && r.date === '2026-04-15');

test('due-east sun appears within a few days of the spring equinox', () => {
  const todayStart = bostonRow.dayStartUtc - 30 * 86400000;
  const hit = solve.findFirstDate({ todayStartMs: todayStart, lat: bostonRow.lat, lng: bostonRow.lng, targetAzimuth: 90, days: 60 });
  assert.ok(hit, 'no 90 degree azimuth found in a 60 day window');
  const dayOfYear = (hit.ms - startOfYear(bostonRow.lat, bostonRow.lng, hit.ms)) / 86400000;
  assert.ok(dayOfYear > 60 && dayOfYear < 110, 'sun at 90 deg azimuth should occur near the equinox, got day ' + dayOfYear.toFixed(0));
  assert.ok(Math.abs(hit.altitude) < 8, 'due-east sun should be low, got ' + hit.altitude.toFixed(1));
});

function startOfYear() {
  // approximate: use the Jan 1 local midnight implied by the fixture's Boston row minus 104 days
  return bostonRow.dayStartUtc - 104 * 86400000;
}

test('solver returns the azimuth it was asked for', () => {
  const dayStart = bostonRow.dayStartUtc;
  const instants = solve.azimuthTimes(dayStart, bostonRow.lat, bostonRow.lng, 118.3);
  assert.ok(instants.length >= 1, 'expected at least one instant at 118.3 deg');
  const az = solar.solarPosition(instants[0], bostonRow.lat, bostonRow.lng).azimuth;
  assert.ok(Math.abs(az - 118.3) < 0.05, 'solver landed at ' + az.toFixed(3));
});

test('altitude solver finds morning and evening crossings', () => {
  const instants = solve.altitudeTimes(bostonRow.dayStartUtc, bostonRow.lat, bostonRow.lng, 10);
  assert.equal(instants.length, 2, 'sun at 10 deg altitude crosses twice on a normal day');
  const alts = instants.map((t) => solar.solarPosition(t, bostonRow.lat, bostonRow.lng).altitude);
  for (const a of alts) assert.ok(Math.abs(a - 10) < 0.05, 'altitude solver landed at ' + a.toFixed(3));
});

test('altitude solver returns nothing for a height the day never reaches', () => {
  const instants = solve.altitudeTimes(bostonRow.dayStartUtc, 61.2181, -149.9003, 89);
  assert.equal(instants.length, 0);
});

test('shadow length equals height at 45 degrees and doubles near 26.6', () => {
  assert.ok(Math.abs(shadow.shadowLength(1, 45) - 1) < 1e-9);
  assert.ok(Math.abs(shadow.shadowLength(2, 45) - 2) < 1e-9);
  assert.ok(Math.abs(shadow.altitudeForRatio(2) - 26.565) < 0.01);
  assert.equal(shadow.shadowLength(1, 0), Infinity);
  assert.equal(shadow.shadowLength(1, -3), Infinity);
});

test('shadow heading is the sun azimuth plus 180 degrees, wrapped', () => {
  assert.equal(shadow.shadowHeading(0), 180);
  assert.equal(shadow.shadowHeading(90), 270);
  assert.equal(shadow.shadowHeading(270), 90);
  assert.equal(shadow.shadowHeading(-10), 170);
});

test('compass points snap to the 16-point rose', () => {
  assert.equal(shadow.compassPoint(0), 'N');
  assert.equal(shadow.compassPoint(359), 'N');
  assert.equal(shadow.compassPoint(90), 'E');
  assert.equal(shadow.compassPoint(225), 'SW');
  assert.equal(shadow.compassPoint(112.5), 'ESE');
});
