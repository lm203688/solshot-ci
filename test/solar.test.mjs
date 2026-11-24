/**
 * Solshot solar kernel tests. Reference values come from `astral` 3.2 (independent NOAA-based
 * implementation) in 数据/astral-fixture.json.
 *
 * The engine ships as an ESM .js file inside an Expo project (no "type": "module"), so the test
 * loads it through a temporary .mjs copy instead of importing the .js directly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'solshot-'));
const copy = path.join(tmp, 'solar.mjs');
fs.copyFileSync(path.join(root, 'src/engine/solar.js'), copy);
const solar = await import('file://' + copy);

const fixturePath = [
  path.join(root, 'test', 'fixtures', 'astral-fixture.json'),
  path.resolve(root, '..', '数据', 'astral-fixture.json'),
].find((p) => fs.existsSync(p));
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const MINUTE = 60000;
const minutesBetween = (a, b) => Math.abs(a - b) / MINUTE;

test('sunrise / sunset / solar noon match astral within 2 minutes', () => {
  let checked = 0;
  for (const row of fixture.rows) {
    if (row.polar) continue;
    const summary = solar.daySummary(row.dayStartUtc, row.lat, row.lng);
    assert.ok(summary.sunrise != null, row.city + ' ' + row.date + ' sunrise missing');
    const dRise = minutesBetween(summary.sunrise, row.sunrise);
    const dSet = minutesBetween(summary.sunset, row.sunset);
    const dNoon = minutesBetween(summary.solarNoon.ms, row.noon);
    assert.ok(dRise <= 2, `${row.city} ${row.date} sunrise off by ${dRise.toFixed(2)} min`);
    assert.ok(dSet <= 2, `${row.city} ${row.date} sunset off by ${dSet.toFixed(2)} min`);
    assert.ok(dNoon <= 2, `${row.city} ${row.date} noon off by ${dNoon.toFixed(2)} min`);
    checked += 1;
  }
  assert.ok(checked >= 20, 'expected at least 20 non-polar reference rows, got ' + checked);
});

test('sunrise azimuth and noon altitude match astral within 0.6 deg / 0.3 deg', () => {
  for (const row of fixture.rows) {
    if (row.polar) continue;
    const summary = solar.daySummary(row.dayStartUtc, row.lat, row.lng);
    const dAz = Math.abs(((summary.sunriseAzimuth - row.sunriseAzimuth + 540) % 360) - 180);
    const dAlt = Math.abs(summary.solarNoon.altitude - row.noonAltitude);
    assert.ok(dAz <= 0.6, `${row.city} ${row.date} sunrise azimuth off by ${dAz.toFixed(3)} deg`);
    assert.ok(dAlt <= 0.3, `${row.city} ${row.date} noon altitude off by ${dAlt.toFixed(3)} deg`);
  }
});

test('polar day and polar night are reported, never NaN', () => {
  const polarRows = fixture.rows.filter((r) => r.polar);
  assert.ok(polarRows.length >= 1, 'fixture should contain at least one polar case');
  for (const row of polarRows) {
    const summary = solar.daySummary(row.dayStartUtc, row.lat, row.lng);
    // Tromso 2026-01-15 is the first day the sun returns (~49 min), so a grazing crossing is
    // legitimate even though astral reports the day as polar.
    const grazing = summary.sunrise != null && summary.sunset != null && summary.dayLengthMs < 90 * MINUTE;
    assert.ok(
      summary.polar === 'alwaysAbove' || summary.polar === 'alwaysBelow' || grazing,
      row.city + ' ' + row.date + ' polar flag missing'
    );
    if (summary.polar) {
      assert.equal(summary.sunrise, null);
      assert.equal(summary.sunset, null);
    }
    assert.ok(Number.isFinite(summary.solarNoon.altitude));
    if (summary.polar === 'alwaysAbove') assert.equal(summary.dayLengthMs, solar.DAY);
  }
});

test('twilight ordering is monotone through the evening', () => {
  const row = fixture.rows.find((r) => r.city === 'Boston' && r.date === '2026-07-15');
  const s = solar.daySummary(row.dayStartUtc, row.lat, row.lng);
  assert.ok(s.civil.set != null && s.nautical.set != null && s.astronomical.set != null);
  assert.ok(s.civil.set < s.nautical.set, 'civil dusk must precede nautical dusk');
  assert.ok(s.nautical.set < s.astronomical.set, 'nautical dusk must precede astronomical dusk');
  assert.ok(s.sunset < s.civil.set);
});

test('altitude peaks near solar noon and is below horizon at midnight', () => {
  const row = fixture.rows.find((r) => r.city === 'Denver' && r.date === '2026-04-15');
  const noonAlt = solar.solarPosition(row.noon, row.lat, row.lng).altitude;
  const midAlt = solar.solarPosition(row.dayStartUtc, row.lat, row.lng).altitude;
  assert.ok(noonAlt > 40);
  assert.ok(midAlt < 0);
});

test('equation of time stays inside its real envelope (-16..+17 min)', () => {
  for (const row of fixture.rows) {
    for (const month of [0, 3, 6, 9]) {
      const t = row.dayStartUtc + month * 30 * 86400000;
      const eot = solar.solarGeometry(t).equationOfTime;
      assert.ok(eot > -16.5 && eot < 17.5, 'eot out of envelope: ' + eot);
    }
  }
});
