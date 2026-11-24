// Solshot · tiny local store (last location, units, calibration). No account, no network.
import { File, Paths } from 'expo-file-system';

const FILE = 'solshot-store.json';

export const PRESETS = [
  { label: 'Boston, MA', lat: 42.3601, lng: -71.0589, dst: true },
  { label: 'New York, NY', lat: 40.7128, lng: -74.0060, dst: true },
  { label: 'Denver, CO', lat: 39.7392, lng: -104.9903, dst: true },
  { label: 'Los Angeles, CA', lat: 34.0522, lng: -118.2437, dst: true },
  { label: 'Seattle, WA', lat: 47.6062, lng: -122.3321, dst: true },
  { label: 'Miami, FL', lat: 25.7617, lng: -80.1918, dst: true },
  { label: 'Anchorage, AK', lat: 61.2181, lng: -149.9003, dst: true },
  { label: 'Honolulu, HI', lat: 21.3069, lng: -157.8583, dst: false },
];

const DEFAULTS = {
  label: PRESETS[0].label,
  lat: PRESETS[0].lat,
  lng: PRESETS[0].lng,
  dst: true,
  use24: false,
  dms: false,
  units: 'imperial', // shadow lengths in ft
  objectHeightM: 1.8,
  azOffset: 0, // compass calibration, degrees
  altOffset: 0,
  recents: [],
};

let cache = null;

function handle() {
  try {
    return new File(Paths.document, FILE);
  } catch (e) {
    return null;
  }
}

export function loadStore() {
  if (cache) return cache;
  try {
    const f = handle();
    if (f && f.exists) {
      cache = { ...DEFAULTS, ...JSON.parse(f.text()) };
      return cache;
    }
  } catch (e) {
    // defaults
  }
  cache = { ...DEFAULTS };
  return cache;
}

export function saveStore(patch) {
  cache = { ...loadStore(), ...patch };
  try {
    const f = handle();
    if (f) f.write(JSON.stringify(cache));
  } catch (e) {
    // in-memory only
  }
  return cache;
}

export { DEFAULTS };
