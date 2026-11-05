// Open-Meteo: place search (geocoding) and daily weather. Free, no API key.
// https://open-meteo.com/en/docs

import { TIMEZONE, WEATHER_CACHE_MINUTES } from '../config.js';
import { fetchJson } from './http.js';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Place name → [{ label, lat, lon }]. Empty array when nothing matches. */
export async function geocode(query) {
  const params = new URLSearchParams({ name: query, count: 6, language: 'en', format: 'json' });
  const data = await fetchJson(`${GEOCODING_URL}?${params}`);
  return (data.results ?? []).map(place => {
    const parts = [place.name, place.admin1, place.country].filter(Boolean);
    return {
      label: [...new Set(parts)].join(', '),
      lat: place.latitude,
      lon: place.longitude,
    };
  });
}

// ---------- weather cache (sessionStorage, 1 hour) ----------

function readCache(key) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(key));
    if (cached && Date.now() - cached.savedAt < WEATHER_CACHE_MINUTES * 60 * 1000) return cached.value;
  } catch {
    // storage unavailable (private mode, Node tests) – just fetch again
  }
  return null;
}

function writeCache(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // ignore: caching is only an optimisation
  }
}

/**
 * Daily rain and reference evapotranspiration (ET₀) for a location.
 * Returns { days: [{ date, rain, et0, tmax, tmin }] } from today − pastDays to today + forecastDays − 1.
 */
export async function getWeather(lat, lon, { pastDays = 0, forecastDays = 9 } = {}) {
  const params = new URLSearchParams({
    latitude: Number(lat).toFixed(4),
    longitude: Number(lon).toFixed(4),
    daily: 'precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min',
    past_days: pastDays,
    forecast_days: forecastDays,
    timezone: TIMEZONE,
  });
  const url = `${FORECAST_URL}?${params}`;

  const cached = readCache(`weather:${url}`);
  if (cached) return cached;

  const data = await fetchJson(url);
  const daily = data.daily;
  if (!daily?.time?.length) throw new Error('Open-Meteo returned no daily weather data.');

  // Open-Meteo returns parallel arrays; turn them into one object per day.
  // Missing values: rain → 0, ET₀ → previous day's value.
  let lastEt0 = 0;
  const days = daily.time.map((date, i) => {
    const et0 = daily.et0_fao_evapotranspiration[i] ?? lastEt0;
    lastEt0 = et0;
    return {
      date,
      rain: daily.precipitation_sum[i] ?? 0,
      et0,
      tmax: daily.temperature_2m_max[i],
      tmin: daily.temperature_2m_min[i],
    };
  });

  const result = { days };
  writeCache(`weather:${url}`, result);
  return result;
}
