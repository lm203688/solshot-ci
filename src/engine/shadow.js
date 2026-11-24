/**
 * Solshot · shadow helpers.
 *
 * Sun altitude -> shadow length/heading, and the inverse (how long a shadow will be).
 * Flat-ground closed form; terrain and buildings are out of scope and the UI says so.
 */
export function shadowLength(heightM, altitudeDeg) {
  if (altitudeDeg <= 0) return Infinity; // sun at or below the horizon: no defined shadow
  return heightM / Math.tan((altitudeDeg * Math.PI) / 180);
}

/** Compass heading the shadow points to: exactly opposite the sun. */
export function shadowHeading(sunAzimuthDeg) {
  const h = (sunAzimuthDeg + 180) % 360;
  return h < 0 ? h + 360 : h;
}

/** Sun altitude needed for a shadow of `ratio` times the object height (ratio = length / height). */
export function altitudeForRatio(ratio) {
  if (ratio <= 0) return 90;
  return (Math.atan(1 / ratio) * 180) / Math.PI;
}

/** Ratio length/height at a given altitude. */
export function ratioAt(altitudeDeg) {
  if (altitudeDeg <= 0) return Infinity;
  return 1 / Math.tan((altitudeDeg * Math.PI) / 180);
}

/** Human label for the 16-point compass rose. */
export function compassPoint(deg) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return names[idx];
}
