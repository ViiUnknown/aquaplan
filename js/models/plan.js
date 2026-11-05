// Builds the irrigation plan for one field:
//   1. replay past days (observed weather + recorded irrigation) to get today's state
//   2. project the next 7 days and give each day a status:
//      IRRIGATE / SKIP (rain expected) / MONITOR / OK
// Pure function: no DOM, no fetch. See REQUIREMENTS.md §5–§7.

import {
  CROPS, STATUS, FIELD_STATUS, FORECAST_DAYS, SKIP_LOOKAHEAD_DAYS, MAX_PAST_DAYS,
  RICE_MONITOR_MARGIN_MM,
} from './constants.js';
import { getKc, seasonLength } from './kc.js';
import { uplandParams, uplandStep, uplandDeficitBeforeIrrigation, effectiveRainUpland } from './upland.js';
import { riceParams, riceStep, riceDepthBeforeIrrigation } from './rice.js';
import { daysBetween } from '../utils/date.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Most recent rice depth reading on or before `today` (or null). */
export function latestDepthReading(records, today) {
  return records
    .filter(r => r.type === 'depthReading' && r.depthMm != null && r.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
    .at(-1) ?? null;
}

/** How many past days of weather the model needs (Open-Meteo `past_days`). */
export function requiredPastDays(field, records, today) {
  if (CROPS[field.cropType]?.model === 'rice') {
    const reading = latestDepthReading(records, today);
    return reading ? clamp(daysBetween(reading.date, today), 0, MAX_PAST_DAYS) : 0;
  }
  return clamp(daysBetween(field.plantingDate, today), 0, MAX_PAST_DAYS);
}

function irrigationByDate(records) {
  const totals = {};
  for (const r of records) {
    if (r.type === 'irrigation' && Number(r.amountMm) > 0) {
      totals[r.date] = (totals[r.date] ?? 0) + Number(r.amountMm);
    }
  }
  return totals;
}

/** Add days-since-planting, Kc, ETc and recorded irrigation to each weather day. */
function enrichDays(field, days, irrigation) {
  return days.map(day => {
    const dsp = daysBetween(field.plantingDate, day.date);
    const k = getKc(field.cropType, dsp);
    return {
      ...day,
      dsp,
      kc: k ? k.kc : null,
      stage: k ? k.stage : null,
      etc: k ? k.kc * day.et0 : 0,
      irrigation: irrigation[day.date] ?? 0,
    };
  });
}

/**
 * @param {object} args
 * @param {object} args.field    field from MockAPI
 * @param {Array}  args.records  this field's records
 * @param {Array}  args.days     [{ date, rain, et0 }] past days + at least 7 forecast days, sorted
 * @param {string} args.today    "YYYY-MM-DD"
 */
export function buildPlan({ field, records = [], days, today }) {
  const crop = CROPS[field.cropType];
  if (!crop) throw new Error(`Unknown crop type "${field.cropType}"`);

  const isRice = crop.model === 'rice';
  const params = isRice ? riceParams(field) : uplandParams(field);
  const dspToday = daysBetween(field.plantingDate, today);
  const season = seasonLength(field.cropType);

  const result = {
    model: crop.model,
    isRice,
    params,
    today,
    dspToday,
    seasonLength: season,
    kcToday: getKc(field.cropType, dspToday),
    history: [],
    plan: [],
    notes: [],
    todayEntry: null,
    nextIrrigation: null,
    weeklyRecommendedMm: 0,
  };

  if (dspToday < 0) return { ...result, fieldStatus: FIELD_STATUS.NOT_PLANTED };
  if (dspToday > season) return { ...result, fieldStatus: FIELD_STATUS.SEASON_FINISHED };

  const all = enrichDays(field, days, irrigationByDate(records));
  const firstDate = all[0]?.date;

  // ---- Starting state ----
  let state;
  let startDate;
  if (isRice) {
    const reading = latestDepthReading(records, today);
    if (!reading) {
      return { ...result, fieldStatus: FIELD_STATUS.NEEDS_READING, notes: ['Enter the current water depth to see a plan.'] };
    }
    if (!firstDate || reading.date < firstDate) {
      return {
        ...result,
        fieldStatus: FIELD_STATUS.NEEDS_READING,
        notes: [`The latest depth reading (${reading.date}) is too old. Enter today's water depth.`],
      };
    }
    // The reading is treated as the depth at the START of its day (measured in the morning).
    state = reading.depthMm;
    startDate = reading.date;
    result.notes.push(`Projection starts from your depth reading of ${reading.depthMm} mm on ${reading.date}.`);
  } else {
    state = 0;
    if (field.plantingDate < firstDate) {
      startDate = firstDate;
      result.notes.push(`Planting was more than ${MAX_PAST_DAYS} days ago, so the water balance starts on ${firstDate} with the soil at field capacity.`);
    } else {
      startDate = field.plantingDate;
      result.notes.push(`The water balance starts at planting (${field.plantingDate}) with the soil at field capacity.`);
    }
  }

  const step = (s, day) => (isRice ? riceStep(s, day, params) : uplandStep(s, day, params.taw));
  const beforeIrrigation = (s, day) => (isRice
    ? riceDepthBeforeIrrigation(s, day.etc, day.rain, params)
    : uplandDeficitBeforeIrrigation(s, day.etc, day.rain, params.taw));
  // Water needed to refill: upland → back to field capacity; rice → back to target depth.
  const refillNeed = s => (isRice ? Math.max(0, params.targetMm - s) : s);
  const effectiveRain = day => (isRice ? day.rain : effectiveRainUpland(day.rain));

  // ---- 1. Replay past days ----
  for (const day of all) {
    if (day.date < startDate || day.date >= today) continue;
    const start = state;
    const needMm = refillNeed(beforeIrrigation(start, day));
    state = step(start, day);
    result.history.push({ ...day, start, end: state, needMm });
  }

  // ---- 2. Project the next 7 days ----
  const future = all.filter(day => day.date >= today);
  if (future.length === 0 || future[0].date !== today) {
    throw new Error('The weather data does not include today.');
  }

  for (let i = 0; i < Math.min(FORECAST_DAYS, future.length); i++) {
    const day = future[i];
    const start = state;

    if (day.kc === null) {
      result.plan.push({ ...day, start, end: start, needMm: 0, effRain: effectiveRain(day), status: STATUS.ENDED, amountMm: 0 });
      continue;
    }

    const needMm = refillNeed(beforeIrrigation(start, day));
    let end = step(start, day);   // includes irrigation already recorded for this day
    let status;
    let amountMm = 0;

    const needsWater = isRice ? end <= params.refillMm : end >= params.raw;
    if (needsWater) {
      const amount = refillNeed(end);
      const rainAhead = future
        .slice(i + 1, i + 1 + SKIP_LOOKAHEAD_DAYS)
        .reduce((sum, d) => sum + effectiveRain(d), 0);
      if (rainAhead >= amount) {
        status = STATUS.SKIP;
      } else {
        status = STATUS.IRRIGATE;
        amountMm = amount;
        // Assume the farmer follows the advice, so later days start from the refilled state.
        end = isRice ? Math.min(params.targetMm, params.bundMm) : 0;
      }
    } else if (isRice ? end <= params.refillMm + RICE_MONITOR_MARGIN_MM : end >= params.monitorAt) {
      status = STATUS.MONITOR;
    } else {
      status = STATUS.OK;
    }

    state = end;
    result.plan.push({ ...day, start, end, needMm, effRain: effectiveRain(day), status, amountMm });
  }

  result.todayEntry = result.plan[0];
  result.nextIrrigation = result.plan.find(d => d.status === STATUS.IRRIGATE) ?? null;
  result.weeklyRecommendedMm = result.plan.reduce((sum, d) => sum + d.amountMm, 0);
  return { ...result, fieldStatus: FIELD_STATUS.ACTIVE };
}

/**
 * Water the model says was needed to refill the field on `date`.
 * Saved on irrigation records as `recommendedMm` (a snapshot at save time).
 */
export function recommendationForDate(analysis, date) {
  if (!analysis || analysis.fieldStatus !== FIELD_STATUS.ACTIVE) return null;
  const day = [...analysis.history, ...analysis.plan].find(d => d.date === date);
  return day ? Math.round(day.needMm * 10) / 10 : null;
}
