// OpenStreetMap Nominatim: turn a point picked on the map into a place name.
// Free, no API key. Usage policy: at most 1 request per second, so results are cached.
// https://nominatim.org/release-docs/latest/api/Reverse/

import { fetchJson } from './http.js';

const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const cache = new Map();

/** (lat, lon) → "Village, Province, Country". Falls back to the coordinates if no name is found. */
export async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;   // ~100 m: nearby clicks reuse the answer
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({ format: 'jsonv2', lat, lon, zoom: 14, 'accept-language': 'en' });
  const data = await fetchJson(`${REVERSE_URL}?${params}`);
  const a = data.address ?? {};
  const local = a.village ?? a.hamlet ?? a.suburb ?? a.town ?? a.city ?? a.municipality ?? a.county;
  const parts = [local, a.state ?? a.province, a.country].filter(Boolean);
  const label = parts.length ? [...new Set(parts)].join(', ') : coordinateLabel(lat, lon);

  cache.set(key, label);
  return label;
}

export const coordinateLabel = (lat, lon) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
