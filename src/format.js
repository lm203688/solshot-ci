// Solshot · time, coordinate and unit formatting. No locale dependency, no network.
export const HOUR = 3600000;
export const DAY = 86400000;

function nthSunday(year, month, n) {
  const first = Date.UTC(year, month - 1, 1);
  const dow = new Date(first).getUTCDay();
  const offset = (7 - dow) % 7;
  return first + (offset + (n - 1) * 7) * DAY;
}

// US rule since 2007: DST from the 2nd Sunday of March to the 1st Sunday of November.
export function isUsDst(utcMs) {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const start = nthSunday(y, 3, 2) + 7 * HOUR;
  const end = nthSunday(y, 11, 1) + 7 * HOUR;
  return utcMs >= start && utcMs < end;
}

export function nominalTzHours(lng) {
  return Math.round(lng / 15);
}

export function localMs(utcMs, tzCorrHours, observedDst) {
  const dst = observedDst && isUsDst(utcMs) ? 1 : 0;
  return utcMs + (tzCorrHours + dst) * HOUR;
}

export function localDayStartMs(utcMs, tzCorrHours, observedDst) {
  const lm = localMs(utcMs, tzCorrHours, observedDst);
  const dayLocal = Math.floor(lm / DAY) * DAY;
  return dayLocal - (tzCorrHours + (observedDst && isUsDst(utcMs) ? 1 : 0)) * HOUR;
}

export function fmtTime(utcMs, tzCorrHours, observedDst, use24) {
  const d = new Date(localMs(utcMs, tzCorrHours, observedDst));
  let h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  if (use24) return String(h).padStart(2, '0') + ':' + m;
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return h + ':' + m + ' ' + suffix;
}

export function fmtDay(utcMs, tzCorrHours, observedDst) {
  const d = new Date(localMs(utcMs, tzCorrHours, observedDst));
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[d.getUTCDay()] + ', ' + mon[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

export function fmtDuration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return m + ' min';
  return h + ' h ' + String(m).padStart(2, '0') + ' m';
}

/** 0..360 -> "118.3°" or "118° 18′" */
export function fmtAngle(deg, dms = false) {
  if (deg == null || !Number.isFinite(deg)) return '—';
  const d = ((deg % 360) + 360) % 360;
  if (!dms) return d.toFixed(1) + '°';
  const whole = Math.floor(d);
  const minutes = Math.round((d - whole) * 60);
  return whole + '° ' + String(minutes === 60 ? 0 : minutes).padStart(2, '0') + '′';
}

/** Signed angle for altitudes: "62.4°" / "-3.1°" */
export function fmtElevation(deg) {
  if (deg == null || !Number.isFinite(deg)) return '—';
  return (deg >= 0 ? '' : '−') + Math.abs(deg).toFixed(1) + '°';
}

/** Latitude/longitude in the customary "42.3601° N" form. */
export function fmtCoord(value, axis) {
  if (value == null || !Number.isFinite(value)) return '—';
  const positive = axis === 'lat' ? 'N' : 'E';
  const negative = axis === 'lat' ? 'S' : 'W';
  const abs = Math.abs(value);
  return abs.toFixed(4) + '° ' + (value >= 0 ? positive : negative);
}

/** Distance for shadow length: metres or feet. */
export function fmtLength(metres, units) {
  if (!Number.isFinite(metres)) return 'no shadow';
  if (units === 'ft') return (metres * 3.28084).toFixed(metres * 3.28084 >= 10 ? 0 : 1) + ' ft';
  return metres.toFixed(metres >= 10 ? 0 : 1) + ' m';
}
