import { fetchJson } from './http.js';

const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const cache = new Map();

export async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
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
