// Loads everything a field page needs: field + records (Mockoon), weather (Open-Meteo),
// then runs the irrigation model.

import { getField, getRecords } from '../api/mockoon.js';
import { getWeather } from '../api/openMeteo.js';
import { buildPlan, requiredPastDays } from '../models/plan.js';
import { FORECAST_DAYS, SKIP_LOOKAHEAD_DAYS } from '../models/constants.js';
import { todayISO } from '../utils/date.js';
import { TIMEZONE } from '../config.js';
import { assertCanAccessField } from '../auth.js';

/** Weather + model for a field whose data is already loaded. Throws if the weather fails. */
export async function analyzeField(field, records, today = todayISO(TIMEZONE)) {
  const pastDays = requiredPastDays(field, records, today);
  const weather = await getWeather(field.lat, field.lon, {
    pastDays,
    forecastDays: FORECAST_DAYS + SKIP_LOOKAHEAD_DAYS,   // extra days so the last plan day can look ahead for rain
  });
  const analysis = buildPlan({ field, records, days: weather.days, today });
  return { weather, analysis };
}

/**
 * Everything for one field page. Mockoon errors are thrown (the page can't work without
 * the field). Weather errors are returned as `weatherError` so the page can still show the field.
 */
export async function loadFieldAnalysis(id) {
  const [field, records] = await Promise.all([getField(id), getRecords(id)]);
  assertCanAccessField(field);
  const today = todayISO(TIMEZONE);
  try {
    const { weather, analysis } = await analyzeField(field, records, today);
    return { field, records, today, weather, analysis, weatherError: null };
  } catch (error) {
    console.error(error);
    return { field, records, today, weather: null, analysis: null, weatherError: error };
  }
}
