// Tests for the calculation models (REQUIREMENTS.md §13).
// Run in a terminal:  npm test        (or: node tests/models.test.js)
// Run in a browser:   open tests/index.html through the local server.

import { getKc, seasonLength } from '../js/models/kc.js';
import { uplandParams, uplandStep } from '../js/models/upland.js';
import { riceParams, riceStep } from '../js/models/rice.js';
import { buildPlan, recommendationForDate, requiredPastDays } from '../js/models/plan.js';
import { verdict, buildComparison } from '../js/models/compare.js';
import { STATUS, FIELD_STATUS } from '../js/models/constants.js';
import { validateField, validateRecord, validateContact } from '../js/utils/validation.js';
import { mmToM3, m3ToMm, pumpHoursToMm, drumSecondsToM3PerHour, formatHours, pumpTime } from '../js/utils/format.js';
import { addDays, daysBetween, isValidISODate } from '../js/utils/date.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assertEqual(actual, expected, label = '') {
  if (actual !== expected) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertClose(actual, expected, tolerance = 1e-6, label = '') {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`${label} expected ≈${expected}, got ${actual}`);
}

const TODAY = '2026-10-15';

/** Weather days from `TODAY - pastDays` to `TODAY + forecastDays - 1`. */
function makeDays(pastDays, forecastDays = 9, { rain = 0, et0 = 5, overrides = {} } = {}) {
  const days = [];
  for (let i = -pastDays; i < forecastDays; i++) {
    const date = addDays(TODAY, i);
    days.push({ date, rain, et0, ...(overrides[i] ?? {}) });
  }
  return days;
}

const maizeField = {
  id: '1', cropType: 'maize', soilType: 'loam', plantingDate: addDays(TODAY, -60),
  areaHa: 1, rootDepthM: null, p: null,
};
const riceField = {
  id: '2', cropType: 'rice', plantingDate: addDays(TODAY, -45), areaHa: 1.5,
  seepageMmDay: 4, refillMm: 0, targetMm: 50, bundMm: 100,
};

// ---------- REQUIREMENTS.md §13 ----------

test('T1 maize mid-season: 3 dry days at ETc 6 → deficit 18 mm', () => {
  const k = getKc('maize', 60);
  assertEqual(k.stage, 'mid-season');
  assertClose(k.kc, 1.2);
  const { taw } = uplandParams(maizeField);
  let D = 0;
  for (let i = 0; i < 3; i++) D = uplandStep(D, { etc: k.kc * 5, rain: 0 }, taw);
  assertClose(D, 18);
});

test('T2 maize on loam: TAW 160, RAW 88, monitor at 61.6', () => {
  const p = uplandParams(maizeField);
  assertClose(p.taw, 160);
  assertClose(p.raw, 88);
  assertClose(p.monitorAt, 61.6);
});

test('T3 rain refills the soil: D 10 + ETc 5 − 0.8×20 → 0', () => {
  assertClose(uplandStep(10, { etc: 5, rain: 20 }, 160), 0);
});

test('T4 rice: 50 mm, ETc 6, seepage 4 → 40, 30, 20, 10, 0', () => {
  const params = riceParams(riceField);
  let d = 50;
  const seen = [];
  for (let i = 0; i < 5; i++) { d = riceStep(d, { etc: 6, rain: 0 }, params); seen.push(d); }
  assertEqual(seen.join(','), '40,30,20,10,0');
});

test('T5 rice: heavy rain is capped by the bund (100 mm)', () => {
  assertClose(riceStep(80, { etc: 6, rain: 60 }, riceParams(riceField)), 100);
});

test('T6 maize development stage: DSP 37 → Kc 0.737', () => {
  const k = getKc('maize', 37);
  assertEqual(k.stage, 'development');
  assertClose(k.kc, 0.3 + (17 / 35) * 0.9);
  assertClose(k.kc, 0.737, 0.001);
});

test('T7 30 mm on 1.5 ha = 450 m³ (and back)', () => {
  assertClose(mmToM3(30, 1.5), 450);
  assertClose(m3ToMm(450, 1.5), 30);
});

test('T8 planting date tomorrow → Not planted yet', () => {
  const field = { ...maizeField, plantingDate: addDays(TODAY, 1) };
  const result = buildPlan({ field, records: [], days: makeDays(0), today: TODAY });
  assertEqual(result.fieldStatus, FIELD_STATUS.NOT_PLANTED);
});

// ---------- Plan behaviour ----------

test('Season finished after the last stage', () => {
  const field = { ...maizeField, plantingDate: addDays(TODAY, -(seasonLength('maize') + 1)) };
  assertEqual(buildPlan({ field, days: makeDays(0), today: TODAY }).fieldStatus, FIELD_STATUS.SEASON_FINISHED);
});

test('Upland: IRRIGATE once, then the plan assumes it was applied', () => {
  const result = buildPlan({ field: maizeField, records: [], days: makeDays(60), today: TODAY });
  assertEqual(result.fieldStatus, FIELD_STATUS.ACTIVE);
  assertEqual(result.plan.length, 7);
  assertEqual(result.plan[0].status, STATUS.IRRIGATE);
  assertClose(result.plan[0].amountMm, 160);          // dry for 60 days → deficit capped at TAW
  assertEqual(result.plan[1].status, STATUS.OK);
  assertEqual(result.plan.filter(d => d.status === STATUS.IRRIGATE).length, 1);
  assertClose(result.weeklyRecommendedMm, 160);
});

test('Upland: SKIP when enough rain is forecast in the next 2 days', () => {
  const days = makeDays(60, 9, { overrides: { 1: { rain: 250 } } });
  const result = buildPlan({ field: maizeField, days, today: TODAY });
  assertEqual(result.plan[0].status, STATUS.SKIP);
});

// Planted 80 days ago → the last 11 days are all mid-season (Kc 1.2, ETc 6 mm/day)
const midSeasonMaize = { ...maizeField, plantingDate: addDays(TODAY, -80) };

test('Upland: MONITOR between 70% of RAW and RAW', () => {
  // Irrigation 11 days ago refills the soil; then 10 past days + today × ETc 6 = 66 (≥ 61.6, < 88)
  const records = [{ type: 'irrigation', date: addDays(TODAY, -11), amountMm: 500 }];
  const result = buildPlan({ field: midSeasonMaize, records, days: makeDays(80), today: TODAY });
  assertEqual(result.plan[0].status, STATUS.MONITOR);
  assertClose(result.plan[0].end, 66);
});

test('Recorded irrigation is used and saved recommendations come from the model', () => {
  const records = [{ type: 'irrigation', date: addDays(TODAY, -11), amountMm: 500 }];
  const result = buildPlan({ field: midSeasonMaize, records, days: makeDays(80), today: TODAY });
  assertClose(recommendationForDate(result, addDays(TODAY, -11)), 160);   // soil was empty that day
  assertEqual(recommendationForDate(result, '2000-01-01'), null);
});

test('Rice: needs a depth reading first', () => {
  const result = buildPlan({ field: riceField, records: [], days: makeDays(0), today: TODAY });
  assertEqual(result.fieldStatus, FIELD_STATUS.NEEDS_READING);
});

test('Rice: projects from the reading and refills to the target', () => {
  // Rice at DSP 42 is in development stage; use ET0 so ETc ≈ 6
  const records = [{ type: 'depthReading', date: TODAY, depthMm: 30 }];
  const result = buildPlan({ field: riceField, records, days: makeDays(0, 9, { et0: 5 }), today: TODAY });
  assertEqual(result.fieldStatus, FIELD_STATUS.ACTIVE);
  const irrigateDay = result.plan.find(d => d.status === STATUS.IRRIGATE);
  if (!irrigateDay) throw new Error('expected an IRRIGATE day');
  assertClose(irrigateDay.end, 50);
  assertClose(irrigateDay.amountMm, 50);   // refill from 0 to target 50
  const monitorDay = result.plan.find(d => d.status === STATUS.MONITOR);
  if (!monitorDay) throw new Error('expected a MONITOR day before the refill');
});

test('Past days needed: upland = days since planting (max 92), rice = since reading', () => {
  assertEqual(requiredPastDays(maizeField, [], TODAY), 60);
  assertEqual(requiredPastDays({ ...maizeField, plantingDate: addDays(TODAY, -200) }, [], TODAY), 92);
  assertEqual(requiredPastDays(riceField, [{ type: 'depthReading', date: addDays(TODAY, -3), depthMm: 40 }], TODAY), 3);
  assertEqual(requiredPastDays(riceField, [], TODAY), 0);
});

// ---------- Comparison ----------

test('Verdict: ±10% is on target', () => {
  assertEqual(verdict(45, 50), 'on target');
  assertEqual(verdict(60, 50), 'over');
  assertEqual(verdict(30, 50), 'under');
  assertEqual(verdict(20, 0), 'over');
  assertEqual(verdict(20, null), 'n/a');
});

test('Usual weekly amount = amount × 7 ÷ interval', () => {
  const field = { ...maizeField, usualAmountMm: 40, usualIntervalDays: 5 };
  const c = buildComparison(field, [], null);
  assertClose(c.usualWeeklyMm, 56);
});

// ---------- Validation and dates ----------

test('Field validation catches bad input', () => {
  const errors = validateField({
    name: 'A', cropType: 'rice', plantingDate: '2026-02-30', areaHa: 0, soilType: null,
    lat: null, lon: null, usualAmountMm: 10, usualIntervalDays: null,
    seepageMmDay: 9, refillMm: 60, targetMm: 50, bundMm: 100,
  }, TODAY);
  for (const key of ['name', 'plantingDate', 'areaHa', 'location', 'seepageMmDay', 'refillMm', 'usualIntervalDays']) {
    if (!errors[key]) throw new Error(`expected an error for ${key}`);
  }
});

test('Field validation accepts a good upland field', () => {
  const errors = validateField({
    name: 'East plot', cropType: 'maize', plantingDate: addDays(TODAY, -10), areaHa: 0.8,
    soilType: 'loam', lat: 11.99, lon: 105.46, rootDepthM: null, p: null,
    usualAmountMm: null, usualIntervalDays: null,
  }, TODAY);
  assertEqual(Object.keys(errors).length, 0, JSON.stringify(errors));
});

test('Record validation: no future dates, no dates before planting', () => {
  const field = { plantingDate: addDays(TODAY, -10) };
  if (!validateRecord({ type: 'irrigation', date: addDays(TODAY, 1), amount: 10 }, field, TODAY).date) throw new Error('future date allowed');
  if (!validateRecord({ type: 'irrigation', date: addDays(TODAY, -20), amount: 10 }, field, TODAY).date) throw new Error('pre-planting date allowed');
  if (!validateRecord({ type: 'depthReading', date: TODAY, depthCm: 40 }, field, TODAY).depthCm) throw new Error('40 cm allowed');
  assertEqual(Object.keys(validateRecord({ type: 'irrigation', date: TODAY, amount: 25 }, field, TODAY)).length, 0);
});

test('Pump hours: 2 h at 30 m³/h on 1.5 ha = 60 m³ = 4 mm', () => {
  assertClose(pumpHoursToMm(2, 30, 1.5), 4);
  assertClose(drumSecondsToM3PerHour(24), 30);   // 200 L in 24 s = 30 m³/h
  assertEqual(formatHours(2.5), '2 h 30 min');
  assertEqual(formatHours(0.2), '10 min');
  assertEqual(formatHours(25), '25 h');
  // 50 mm on 1.5 ha = 750 m³; at 60 m³/h that is 12.5 hours
  assertEqual(pumpTime(50, { areaHa: 1.5, pumpM3PerHour: 60 }), '12 h 30 min');
  assertEqual(pumpTime(50, { areaHa: 1.5, pumpM3PerHour: null }), null);
});

test('Pump validation: hours need a pump flow, at most 24 h per record', () => {
  const field = { plantingDate: addDays(TODAY, -10) };
  const base = { type: 'irrigation', date: TODAY, unit: 'hours' };
  if (!validateRecord({ ...base, amount: 2, pumpM3PerHour: null }, field, TODAY).pumpM3PerHour) throw new Error('missing pump flow allowed');
  if (!validateRecord({ ...base, amount: 30, pumpM3PerHour: 30 }, field, TODAY).amount) throw new Error('30 hours allowed');
  assertEqual(Object.keys(validateRecord({ ...base, amount: 2, pumpM3PerHour: 30 }, field, TODAY)).length, 0);
  const goodField = {
    name: 'East plot', cropType: 'maize', plantingDate: addDays(TODAY, -10), areaHa: 0.8,
    soilType: 'loam', lat: 11.99, lon: 105.46, usualAmountMm: null, usualIntervalDays: null,
  };
  if (!validateField({ ...goodField, pumpM3PerHour: 0 }, TODAY).pumpM3PerHour) throw new Error('pump flow 0 allowed');
  assertEqual(Object.keys(validateField({ ...goodField, pumpM3PerHour: 30 }, TODAY)).length, 0);
});

test('Date helpers', () => {
  assertEqual(addDays('2026-12-31', 1), '2027-01-01');
  assertEqual(daysBetween('2026-10-01', '2026-10-15'), 14);
  assertEqual(isValidISODate('2026-02-30'), false);
  assertEqual(isValidISODate('2028-02-29'), true);
});

test('Contact form validation', () => {
  const ok = { name: 'Dara', email: 'dara@example.com', message: 'When should I water my rice?' };
  assertEqual(Object.keys(validateContact(ok)).length, 0, 'valid message');
  const bad = validateContact({ name: 'D', email: 'dara@', message: 'hi' });
  assertEqual(Object.keys(bad).sort().join(','), 'email,message,name', 'all three errors');
});

// ---------- Runner ----------

export function runTests() {
  return tests.map(({ name, fn }) => {
    try { fn(); return { name, passed: true }; }
    catch (err) { return { name, passed: false, error: err.message }; }
  });
}

const isNode = typeof process !== 'undefined' && process.versions?.node;
if (isNode) {
  const results = runTests();
  for (const r of results) console.log(`${r.passed ? '✔' : '✘'} ${r.name}${r.passed ? '' : `\n    → ${r.error}`}`);
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}
