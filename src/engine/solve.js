/**
 * Solshot · reverse solver.
 *
 * "When is the sun at <azimuth|altitude> for this place?" answered by sampling the day on a
 * coarse grid and bisecting the sign change of the difference — the same technique the tide
 * engine uses for extrema, and cheap enough to scan a full year in the UI thread (~10 ms/day).
 */
import { solarPosition, DAY } from './solar.js';

const SAMPLE_MS = 5 * 60000;

function normDelta(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function bisectAzimuth(tA, tB, lat, lng, target) {
  let a = tA;
  let b = tB;
  let fa = normDelta(solarPosition(a, lat, lng).azimuth, target);
  for (let i = 0; i < 22; i += 1) {
    const mid = (a + b) / 2;
    const fm = normDelta(solarPosition(mid, lat, lng).azimuth, target);
    if (fa * fm <= 0) b = mid;
    else {
      a = mid;
      fa = fm;
    }
  }
  return Math.round((a + b) / 2);
}

function bisectAltitude(tA, tB, lat, lng, target) {
  let a = tA;
  let b = tB;
  const fa = solarPosition(a, lat, lng).altitude - target;
  for (let i = 0; i < 22; i += 1) {
    const mid = (a + b) / 2;
    const fm = solarPosition(mid, lat, lng).altitude - target;
    if (fa * fm <= 0) b = mid;
    else a = mid;
  }
  return Math.round((a + b) / 2);
}

/** All instants in one local day where the sun's azimuth equals `target` (morning first). */
export function azimuthTimes(dayStartMs, lat, lng, target) {
  const hits = [];
  let prevT = dayStartMs;
  let prev = normDelta(solarPosition(prevT, lat, lng).azimuth, target);
  for (let t = dayStartMs + SAMPLE_MS; t <= dayStartMs + DAY; t += SAMPLE_MS) {
    const cur = normDelta(solarPosition(t, lat, lng).azimuth, target);
    if (prev === 0) hits.push(prevT);
    else if ((prev < 0 && cur > 0) || (prev > 0 && cur < 0)) {
      // ignore the wrap at the north passage: only accept when the sun is above the horizon
      const mid = bisectAzimuth(prevT, t, lat, lng, target);
      if (solarPosition(mid, lat, lng).altitude > -0.9) hits.push(mid);
    }
    prev = cur;
    prevT = t;
  }
  return hits;
}

/** All instants in one local day where the sun's altitude equals `target`. */
export function altitudeTimes(dayStartMs, lat, lng, target) {
  const hits = [];
  let prevT = dayStartMs;
  let prev = solarPosition(prevT, lat, lng).altitude - target;
  for (let t = dayStartMs + SAMPLE_MS; t <= dayStartMs + DAY; t += SAMPLE_MS) {
    const cur = solarPosition(t, lat, lng).altitude - target;
    if ((prev < 0 && cur > 0) || (prev > 0 && cur < 0)) hits.push(bisectAltitude(prevT, t, lat, lng, target));
    prev = cur;
    prevT = t;
  }
  return hits;
}

/**
 * First date (within `days`) where the sun reaches the requested azimuth or altitude.
 * Returns { dayOffset, ms, azimuth, altitude, candidates } or null.
 */
export function findFirstDate({ todayStartMs, lat, lng, targetAzimuth = null, targetAltitude = null, days = 370 }) {
  for (let d = 0; d < days; d += 1) {
    const dayStart = todayStartMs + d * DAY;
    const instants =
      targetAzimuth != null ? azimuthTimes(dayStart, lat, lng, targetAzimuth) : altitudeTimes(dayStart, lat, lng, targetAltitude);
    if (instants.length) {
      return {
        dayOffset: d,
        ms: instants[0],
        azimuth: solarPosition(instants[0], lat, lng).azimuth,
        altitude: solarPosition(instants[0], lat, lng).altitude,
        candidates: instants.length,
      };
    }
  }
  return null;
}

/** Every date in the next `days` where the condition holds (used by the "annual repeats" list). */
export function findRepeats({ todayStartMs, lat, lng, targetAzimuth = null, targetAltitude = null, days = 370, max = 8 }) {
  const out = [];
  for (let d = 0; d < days && out.length < max; d += 1) {
    const dayStart = todayStartMs + d * DAY;
    const instants =
      targetAzimuth != null ? azimuthTimes(dayStart, lat, lng, targetAzimuth) : altitudeTimes(dayStart, lat, lng, targetAltitude);
    if (instants.length) out.push({ dayOffset: d, ms: instants[0] });
  }
  return out;
}
