/**
 * UI-level smoke test: exercises exactly the derived values App.js renders
 * (light windows, shadow table, reverse search) on today's date for Boston.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'solshot-ui-'));
for (const [src, dst] of [
  ['src/engine/solar.js', 'solar.mjs'],
  ['src/engine/solve.js', 'solve.mjs'],
  ['src/engine/shadow.js', 'shadow.mjs'],
]) {
  fs.copyFileSync(path.join(root, src), path.join(tmp, dst));
}
// solve.mjs ships 'import ... from "./solar.js"'; rewrite the extension for the temp copies.
const solvePath = path.join(tmp, 'solve.mjs');
fs.writeFileSync(solvePath, fs.readFileSync(solvePath, 'utf8').replace('./solar.js', './solar.mjs'));

const solar = await import('file://' + path.join(tmp, 'solar.mjs'));
const solve = await import('file://' + solvePath);
const shadow = await import('file://' + path.join(tmp, 'shadow.mjs'));

const DAY = 86400000;
const HOUR = 3600000;
const CITY = { lat: 42.3601, lng: -71.0589, tz: -5 };
// Same rule App.js uses: local midnight = floor((utc + tz) / day) * day - tz.
const nowMs = Date.UTC(2026, 10, 24, 17, 0); // 12:00 EST
const dayStart = Math.floor((nowMs + CITY.tz * HOUR) / DAY) * DAY - CITY.tz * HOUR;

function spans(dayStartMs, lat, lng) {
  const at = (deg) => solar.crossingTimes(dayStartMs, lat, lng, deg);
  const high = at(6);
  const low = at(-4);
  const civil = at(-6);
  return {
    goldenMorning: [low.rise, high.rise],
    goldenEvening: [high.set, low.set],
    blueMorning: [civil.rise, low.rise],
    blueEvening: [low.set, civil.set],
  };
}

test('light windows are ordered and inside the civil-twilight day', () => {
  const s = spans(dayStart, CITY.lat, CITY.lng);
  assert.ok(s.goldenMorning[0] > dayStart, 'golden AM starts after local midnight');
  assert.ok(s.goldenMorning[0] < s.goldenMorning[1], 'golden AM start precedes end');
  assert.ok(s.blueMorning[0] < s.blueMorning[1], 'blue AM start precedes end');
  assert.ok(s.blueMorning[0] < s.goldenMorning[0], 'blue hour begins before golden hour');
  assert.ok(s.goldenMorning[1] < s.goldenEvening[0], 'morning window precedes evening window');
  assert.ok(s.goldenEvening[1] < dayStart + DAY, 'evening golden hour ends inside the day');
});

test('shadow table: noon is shortest, heading is opposite the sun', () => {
  const rows = [9, 12, 15].map((h) => {
    const t = dayStart + h * HOUR;
    const p = solar.solarPosition(t, CITY.lat, CITY.lng);
    return { h, alt: p.altitude, az: p.azimuth, len: shadow.shadowLength(1.8, p.altitude), heading: shadow.shadowHeading(p.azimuth) };
  });
  const noon = rows[1];
  assert.ok(Number.isFinite(noon.len) && noon.len > 0);
  assert.ok(noon.len < rows[0].len, 'noon shadow shorter than 9 AM');
  assert.ok(noon.len < rows[2].len, 'noon shadow shorter than 3 PM');
  assert.ok(noon.az > 150 && noon.az < 210, 'noon sun is roughly south at Boston: ' + noon.az);
  assert.ok(Math.abs(noon.heading - ((noon.az + 180) % 360)) < 1e-6, 'heading is sun bearing + 180');
  assert.equal(shadow.shadowLength(1.8, -1), Infinity, 'no shadow once the sun is down');
});

test('reverse search finds a due-south sun within a couple of days', () => {
  const hit = solve.findFirstDate({ todayStartMs: dayStart, lat: CITY.lat, lng: CITY.lng, targetAzimuth: 180, days: 14 });
  assert.ok(hit, 'due-south crossing found');
  assert.ok(hit.dayOffset <= 2, 'due south happens near noon every day: day ' + hit.dayOffset);
  assert.ok(Math.abs(hit.azimuth - 180) < 0.5, 'refined azimuth close to target: ' + hit.azimuth);
  assert.ok(hit.altitude > 0, 'sun above horizon at the hit');
});

test('reverse search for an unreachable winter bearing reports a later date, not a crash', () => {
  const hit = solve.findFirstDate({ todayStartMs: dayStart, lat: CITY.lat, lng: CITY.lng, targetAzimuth: 80, days: 120 });
  assert.ok(hit, 'east bearing eventually reached as sunrise moves north');
  assert.ok(hit.dayOffset > 10, 'not reachable in late November: day ' + hit.dayOffset);
});
