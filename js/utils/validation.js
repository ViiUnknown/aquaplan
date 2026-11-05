// Form validation (REQUIREMENTS.md §8).
// Each function returns an object { inputName: 'message' }. Empty object = valid.

import { CROPS, SOILS } from '../models/constants.js';
import { isValidISODate, addDays } from './date.js';

const isNum = value => typeof value === 'number' && Number.isFinite(value);
const isPumpFlow = value => isNum(value) && value >= 1 && value <= 1000;
const PUMP_ERROR = 'Pump flow must be between 1 and 1000 m³ per hour.';

export function validateField(f, today) {
  const errors = {};

  const name = (f.name ?? '').trim();
  if (name.length < 2 || name.length > 50) errors.name = 'Name must be 2–50 characters.';

  const crop = CROPS[f.cropType];
  if (!crop) errors.cropType = 'Choose a crop.';

  if (!isValidISODate(f.plantingDate)) errors.plantingDate = 'Enter a valid planting date.';
  else if (f.plantingDate > addDays(today, 30)) errors.plantingDate = 'Planting date can be at most 30 days in the future.';

  if (!isNum(f.areaHa) || f.areaHa <= 0 || f.areaHa > 1000) errors.areaHa = 'Area must be more than 0 and at most 1000 ha.';

  if (!isNum(f.lat) || !isNum(f.lon)) errors.location = 'Search for a place and choose it from the results.';

  const isRice = crop?.model === 'rice';

  if (crop && !isRice) {
    if (!SOILS[f.soilType]) errors.soilType = 'Choose a soil type.';
    if (f.rootDepthM != null && (!isNum(f.rootDepthM) || f.rootDepthM < 0.1 || f.rootDepthM > 2)) {
      errors.rootDepthM = 'Root depth must be between 0.1 and 2.0 m.';
    }
    if (f.p != null && (!isNum(f.p) || f.p < 0.1 || f.p > 0.9)) errors.p = 'p must be between 0.1 and 0.9.';
  } else if (f.soilType && !SOILS[f.soilType]) {
    errors.soilType = 'Choose a soil type from the list.';
  }

  if (isRice) {
    if (!isNum(f.seepageMmDay) || f.seepageMmDay < 2 || f.seepageMmDay > 6) {
      errors.seepageMmDay = 'Seepage must be between 2 and 6 mm/day.';
    }
    const { refillMm: refill, targetMm: target, bundMm: bund } = f;
    if (!isNum(refill)) errors.refillMm = 'Enter a number.';
    if (!isNum(target)) errors.targetMm = 'Enter a number.';
    if (!isNum(bund)) errors.bundMm = 'Enter a number.';
    if (isNum(refill) && isNum(target) && isNum(bund)) {
      if (refill < 0) errors.refillMm = 'Refill level cannot be negative.';
      else if (refill >= target) errors.refillMm = 'Must be lower than the "fill up to" depth.';
      if (target > bund) errors.targetMm = 'Cannot be higher than the field wall.';
      if (bund > 300) errors.bundMm = 'The field wall can be at most 30 cm high.';
    }
  }

  if (f.pumpM3PerHour != null && !isPumpFlow(f.pumpM3PerHour)) errors.pumpM3PerHour = PUMP_ERROR;

  if (f.usualAmountMm != null && (!isNum(f.usualAmountMm) || f.usualAmountMm < 0)) {
    errors.usualAmountMm = 'Usual amount must be 0 or more.';
  }
  if (f.usualIntervalDays != null) {
    if (!Number.isInteger(f.usualIntervalDays) || f.usualIntervalDays < 1 || f.usualIntervalDays > 60) {
      errors.usualIntervalDays = 'Enter a whole number of days between 1 and 60.';
    }
  } else if (f.usualAmountMm != null) {
    errors.usualIntervalDays = 'How often do you usually water? (days)';
  }

  return errors;
}

/**
 * `r` = { type, date, amount, unit, pumpM3PerHour, depthCm, note } as typed in the records form
 * (amount is in the unit the user picked; it is converted to mm before saving).
 */
export function validateRecord(r, field, today) {
  const errors = {};

  if (!isValidISODate(r.date)) errors.date = 'Enter a valid date.';
  else if (r.date > today) errors.date = 'The date cannot be in the future.';
  else if (r.date < field.plantingDate) errors.date = 'The date cannot be before the planting date.';

  if (r.type === 'irrigation') {
    if (!isNum(r.amount) || r.amount <= 0) errors.amount = 'Amount must be more than 0.';
    else if (r.unit === 'hours' && r.amount > 24) errors.amount = 'At most 24 hours. Add one record per day.';
    if (r.unit === 'hours' && !isPumpFlow(r.pumpM3PerHour)) errors.pumpM3PerHour = PUMP_ERROR;
  } else if (r.type === 'depthReading') {
    if (!isNum(r.depthCm) || r.depthCm < 0 || r.depthCm > 30) errors.depthCm = 'Depth must be between 0 and 30 cm.';
  } else {
    errors.type = 'Choose a record type.';
  }

  if ((r.note ?? '').length > 200) errors.note = 'Note must be 200 characters or fewer.';

  return errors;
}
