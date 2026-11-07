// The watering plan for one field.
//   1. Replay the past days (real weather + recorded watering) to find today's water.
//   2. Plan the next 7 days and give each day a status: IRRIGATE, SKIP, MONITOR or OK.

import {
  CROPS, STATUS, FIELD_STATUS, FORECAST_DAYS, SKIP_LOOKAHEAD_DAYS, MAX_PAST_DAYS, RICE_MONITOR_MARGIN_MM,
} from './constants.js';
import { getKc, seasonLength } from './kc.js';
import { uplandParams, uplandStep, uplandDeficitBeforeIrrigation, effectiveRainUpland } from './upland.js';
import { riceParams, riceStep, riceDepthBeforeIrrigation } from './rice.js';
import { daysBetween } from '../utils/date.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** The newest rice depth reading on or before `today`, or null. */
export function latestDepthReading(records, today) {
  const byDateThenTime = (a, b) =>
    a.date.localeCompare(b.date) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
  return records
    .filter(r => r.type === 'depthReading' && r.depthMm != null && r.date <= today)
    .sort(byDateThenTime)
    .at(-1) ?? null;
}

/** How many past days of weather the plan needs (Open-Meteo `past_days`). */
export function requiredPastDays(field, records, today) {
  if (CROPS[field.cropType]?.model === 'rice') {
    const reading = latestDepthReading(records, today);
    return reading ? clamp(daysBetween(reading.date, today), 0, MAX_PAST_DAYS) : 0;
  }
  return clamp(daysBetween(field.plantingDate, today), 0, MAX_PAST_DAYS);
}

/**
 * @param {object} args
 * @param {object} args.field    the field from Mockoon
 * @param {Array}  args.records  this field's records
 * @param {Array}  args.days     [{ date, rain, et0 }]: past days + at least 7 forecast days, sorted
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

  const allDays = addCropWaterUse(field, days, wateringByDate(records));
  const start = startingPoint({ field, records, today, isRice, firstDate: allDays[0]?.date });
  if (start.needsReading) {
    return { ...result, fieldStatus: FIELD_STATUS.NEEDS_READING, notes: [start.note] };
  }
  result.notes.push(start.note);

  const model = waterModel(isRice, params);
  const { history, endState } = replayPast(model, allDays, start, today);
  result.history = history;

  const future = allDays.filter(day => day.date >= today);
  if (future.length === 0 || future[0].date !== today) {
    throw new Error('The weather data does not include today.');
  }
  result.plan = planAhead(model, future, endState);

  result.todayEntry = result.plan[0];
  result.nextIrrigation = result.plan.find(d => d.status === STATUS.IRRIGATE) ?? null;
  result.weeklyRecommendedMm = result.plan.reduce((sum, d) => sum + d.amountMm, 0);
  return { ...result, fieldStatus: FIELD_STATUS.ACTIVE };
}

/**
 * What AquaPlan advised for `date`: the "Water today" amount, or 0 on any other day.
 * It is judged on the water before that day's watering, so recording a watering
 * doesn't change the advice for the same day. Saved on records as `recommendedMm`.
 */
export function recommendationForDate(analysis, date) {
  if (!analysis || analysis.fieldStatus !== FIELD_STATUS.ACTIVE) return null;
  const day = [...analysis.history, ...analysis.plan].find(d => d.date === date);
  return day ? Math.round(day.advisedMm * 10) / 10 : null;
}

// ---------- steps of buildPlan ----------

function wateringByDate(records) {
  const totals = {};
  for (const r of records) {
    if (r.type === 'irrigation' && Number(r.amountMm) > 0) {
      totals[r.date] = (totals[r.date] ?? 0) + Number(r.amountMm);
    }
  }
  return totals;
}

/** Adds crop age, Kc, crop water use (ETc) and recorded watering to each weather day. */
function addCropWaterUse(field, days, watering) {
  return days.map(day => {
    const dsp = daysBetween(field.plantingDate, day.date);
    const k = getKc(field.cropType, dsp);
    return {
      ...day,
      dsp,
      kc: k ? k.kc : null,
      stage: k ? k.stage : null,
      etc: k ? k.kc * day.et0 : 0,
      irrigation: watering[day.date] ?? 0,
    };
  });
}

/**
 * Where the water account starts.
 * Rice: the latest depth reading, taken as the depth on the morning of its day.
 * Upland: a full soil (deficit 0) at planting, or on the first day of weather we have.
 */
function startingPoint({ field, records, today, isRice, firstDate }) {
  if (isRice) {
    const reading = latestDepthReading(records, today);
    if (!reading) {
      return { needsReading: true, note: 'Enter the current water depth to see a plan.' };
    }
    if (!firstDate || reading.date < firstDate) {
      return { needsReading: true, note: `The latest depth reading (${reading.date}) is too old. Enter today's water depth.` };
    }
    return {
      state: reading.depthMm,
      date: reading.date,
      note: `Projection starts from your depth reading of ${reading.depthMm} mm on ${reading.date}.`,
    };
  }

  if (field.plantingDate < firstDate) {
    return {
      state: 0,
      date: firstDate,
      note: `Planting was more than ${MAX_PAST_DAYS} days ago, so the water balance starts on ${firstDate} `
        + 'with the soil at field capacity.',
    };
  }
  return {
    state: 0,
    date: field.plantingDate,
    note: `The water balance starts at planting (${field.plantingDate}) with the soil at field capacity.`,
  };
}

/**
 * The same questions asked of either water account.
 * Rice tracks the water depth (lower = worse); upland tracks the soil deficit (higher = worse).
 */
function waterModel(isRice, params) {
  const effectiveRain = day => (isRice ? day.rain : effectiveRainUpland(day.rain));
  // Water needed to refill: rice back to the target depth, upland back to a full soil.
  const refillNeed = s => (isRice ? Math.max(0, params.targetMm - s) : s);
  const needsWater = s => (isRice ? s <= params.refillMm : s >= params.raw);
  const rainInNextDays = (list, i) => list
    .slice(i + 1, i + 1 + SKIP_LOOKAHEAD_DAYS)
    .reduce((sum, d) => sum + effectiveRain(d), 0);

  return {
    effectiveRain,
    refillNeed,
    needsWater,
    rainInNextDays,
    step: (s, day) => (isRice ? riceStep(s, day, params) : uplandStep(s, day, params.taw)),
    beforeWatering: (s, day) => (isRice
      ? riceDepthBeforeIrrigation(s, day.etc, day.rain, params)
      : uplandDeficitBeforeIrrigation(s, day.etc, day.rain, params.taw)),
    isGettingLow: s => (isRice ? s <= params.refillMm + RICE_MONITOR_MARGIN_MM : s >= params.monitorAt),
    refilledState: () => (isRice ? Math.min(params.targetMm, params.bundMm) : 0),

    /** The "Water today" amount for a day, else 0. Judged on the water before that day's watering. */
    advice(before, list, i) {
      if (!needsWater(before)) return 0;
      const amount = refillNeed(before);
      return rainInNextDays(list, i) >= amount ? 0 : amount;
    },
  };
}

function replayPast(model, allDays, start, today) {
  const history = [];
  let state = start.state;
  for (const [i, day] of allDays.entries()) {
    if (day.date < start.date || day.date >= today) continue;
    const before = model.beforeWatering(state, day);
    const end = model.step(state, day);
    history.push({
      ...day,
      start: state,
      end,
      needMm: model.refillNeed(before),
      advisedMm: model.advice(before, allDays, i),
    });
    state = end;
  }
  return { history, endState: state };
}

function planAhead(model, future, startState) {
  const plan = [];
  let state = startState;

  for (let i = 0; i < Math.min(FORECAST_DAYS, future.length); i++) {
    const day = future[i];
    const start = state;
    const effRain = model.effectiveRain(day);

    if (day.kc === null) {
      plan.push({ ...day, start, end: start, needMm: 0, advisedMm: 0, effRain, status: STATUS.ENDED, amountMm: 0 });
      continue;
    }

    const before = model.beforeWatering(start, day);
    let end = model.step(start, day);   // includes watering already recorded for this day
    let status = STATUS.OK;
    let amountMm = 0;

    if (model.needsWater(end)) {
      const amount = model.refillNeed(end);
      if (model.rainInNextDays(future, i) >= amount) {
        status = STATUS.SKIP;
      } else {
        status = STATUS.IRRIGATE;
        amountMm = amount;
        // Assume the farmer follows the advice, so the next day starts refilled.
        end = model.refilledState();
      }
    } else if (model.isGettingLow(end)) {
      status = STATUS.MONITOR;
    }

    plan.push({
      ...day,
      start,
      end,
      needMm: model.refillNeed(before),
      advisedMm: model.advice(before, future, i),
      effRain,
      status,
      amountMm,
    });
    state = end;
  }
  return plan;
}
