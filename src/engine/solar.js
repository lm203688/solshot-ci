/**
 * Solshot · solar position kernel.
 *
 * NOAA Solar Calculator algorithm (Meeus low-precision series):
 *   Julian day -> geometric mean longitude / anomaly -> equation of centre ->
 *   apparent longitude -> obliquity -> declination -> equation of time.
 * Then true solar time -> hour angle -> altitude / azimuth.
 *
 * All angles in degrees, times in UTC ms unless stated otherwise.
 * No third-party astronomy dependency; everything below is self-contained and unit tested.
 */

export const DAY = 86400000;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const SUNRISE_ALTITUDE = -0.833; // standard refraction + solar semidiameter
export const CIVIL = -6;
export const NAUTICAL = -12;
export const ASTRONOMICAL = -18;
export const GOLDEN_LOW = -4; // golden hour starts (sun fully below horizon, refracted)
export const GOLDEN_HIGH = 6; // golden hour ends
export const BLUE_LOW = -6;
export const BLUE_HIGH = -4;

function norm360(x) {
  const r = x % 360;
  return r < 0 ? r + 360 : r;
}

export function julianDay(utcMs) {
  return utcMs / DAY + 2440587.5;
}

/** Solar geometry at a given instant. */
export function solarGeometry(utcMs) {
  const jd = julianDay(utcMs);
  const t = (jd - 2451545) / 36525;

  const l0 = norm360(280.46646 + t * (36000.76983 + 0.0003032 * t));
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const mr = m * RAD;
  const c =
    Math.sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mr) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mr) * 0.000289;

  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);

  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos(omega * RAD);

  const declination = Math.asin(Math.sin(obliquity * RAD) * Math.sin(appLong * RAD)) * DEG;

  const y = Math.tan((obliquity / 2) * RAD) ** 2;
  const l0r = l0 * RAD;
  const eot =
    4 *
    DEG *
    (y * Math.sin(2 * l0r) -
      2 * e * Math.sin(mr) +
      4 * e * y * Math.sin(mr) * Math.cos(2 * l0r) -
      0.5 * y * y * Math.sin(4 * l0r) -
      1.25 * e * e * Math.sin(2 * mr));

  return { declination, equationOfTime: eot, appLongitude: appLong, obliquity };
}

/** Nominal time zone offset (hours) from longitude; DST is applied separately by the caller. */
export function nominalTzHours(lng) {
  return Math.round(lng / 15);
}

/** True solar time in minutes (0..1440) for a UTC instant at a longitude. */
export function trueSolarMinutes(utcMs, lng, geom) {
  const utcMinutes = (((utcMs % DAY) + DAY) % DAY) / 60000;
  return (utcMinutes + geom.equationOfTime + 4 * lng + 1440) % 1440;
}

/** Sun altitude and azimuth (geometric, no refraction) at an instant. */
export function solarPosition(utcMs, lat, lng) {
  const geom = solarGeometry(utcMs);
  const tsmin = trueSolarMinutes(utcMs, lng, geom);
  const hourAngle = tsmin / 4 - 180;

  const latR = lat * RAD;
  const decR = geom.declination * RAD;
  const haR = hourAngle * RAD;

  const sinAlt = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;

  const cosAz =
    (Math.sin(latR) * sinAlt - Math.sin(decR)) / Math.max(1e-9, Math.cos(latR) * Math.cos(altitude * RAD));
  const azBase = Math.acos(Math.max(-1, Math.min(1, cosAz))) * DEG;
  const azimuth = norm360(hourAngle > 0 ? (azBase + 180) % 360 : (540 - azBase) % 360);

  return { altitude, azimuth, hourAngle, declination: geom.declination };
}

/**
 * Times of the day when the sun's geometric altitude equals `targetAltitude`,
 * for the local calendar day starting at `dayStartMs` (local midnight expressed in UTC ms).
 *
 * Returns { rise, set } in UTC ms, either of which is null when the sun stays above/below.
 * Uses monotone bracketing + bisection on the altitude curve, which is exact to ~1 s and
 * degrades gracefully inside the polar circles (unlike the closed-form acos formula).
 */
export function crossingTimes(dayStartMs, lat, lng, targetAltitude) {
  const samples = 144; // 10-minute grid
  const step = DAY / samples;
  let prevT = dayStartMs;
  let prev = solarPosition(prevT, lat, lng).altitude - targetAltitude;
  let rise = null;
  let set = null;

  for (let i = 1; i <= samples; i += 1) {
    const t = dayStartMs + i * step;
    const cur = solarPosition(t, lat, lng).altitude - targetAltitude;
    if (prev <= 0 && cur > 0 && rise == null) rise = bisect(dayStartMs + (i - 1) * step, t, lat, lng, targetAltitude);
    if (prev > 0 && cur <= 0 && set == null) set = bisect(dayStartMs + (i - 1) * step, t, lat, lng, targetAltitude);
    prev = cur;
    prevT = t;
  }
  return { rise, set, alwaysAbove: rise == null && set == null && prev > 0, alwaysBelow: rise == null && set == null && prev <= 0 };
}

function bisect(tA, tB, lat, lng, target) {
  let a = tA;
  let b = tB;
  const fa = solarPosition(a, lat, lng).altitude - target;
  for (let i = 0; i < 24; i += 1) {
    const mid = (a + b) / 2;
    const fm = solarPosition(mid, lat, lng).altitude - target;
    if (fa * fm <= 0) {
      b = mid;
    } else {
      a = mid;
    }
  }
  return Math.round((a + b) / 2);
}

/** Solar noon: the instant of maximum altitude, refined by ternary search. */
export function solarNoon(dayStartMs, lat, lng) {
  let lo = dayStartMs + 6 * 3600000;
  let hi = dayStartMs + 18 * 3600000;
  for (let i = 0; i < 48; i += 1) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (solarPosition(m1, lat, lng).altitude > solarPosition(m2, lat, lng).altitude) hi = m2;
    else lo = m1;
  }
  const t = Math.round((lo + hi) / 2);
  return { ms: t, altitude: solarPosition(t, lat, lng).altitude, azimuth: solarPosition(t, lat, lng).azimuth };
}

/** Full day summary for one location. */
export function daySummary(dayStartMs, lat, lng) {
  const sunrise = crossingTimes(dayStartMs, lat, lng, SUNRISE_ALTITUDE);
  const sunRise = sunrise.rise;
  const sunSet = sunrise.set;
  const noon = solarNoon(dayStartMs, lat, lng);

  return {
    sunrise: sunRise,
    sunset: sunSet,
    solarNoon: noon,
    dayLengthMs: sunRise != null && sunSet != null ? sunSet - sunRise : sunRise == null && sunSet == null && sunrise.alwaysAbove ? DAY : 0,
    sunriseAzimuth: sunRise != null ? solarPosition(sunRise, lat, lng).azimuth : null,
    sunsetAzimuth: sunSet != null ? solarPosition(sunSet, lat, lng).azimuth : null,
    polar: sunrise.alwaysAbove ? 'alwaysAbove' : sunrise.alwaysBelow ? 'alwaysBelow' : null,
    civil: crossingTimes(dayStartMs, lat, lng, CIVIL),
    nautical: crossingTimes(dayStartMs, lat, lng, NAUTICAL),
    astronomical: crossingTimes(dayStartMs, lat, lng, ASTRONOMICAL),
    goldenEvening: crossingTimes(dayStartMs, lat, lng, GOLDEN_HIGH),
    goldenMorning: crossingTimes(dayStartMs, lat, lng, GOLDEN_LOW),
    blueEvening: crossingTimes(dayStartMs, lat, lng, BLUE_HIGH),
  };
}
