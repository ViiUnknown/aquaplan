import { CROPS, SOILS, RICE_DEFAULTS } from '../models/constants.js';
import { isValidISODate, addDays } from './date.js';

const isNum = value => typeof value === 'number' && Number.isFinite(value);
const isPumpFlow = value => isNum(value) && value >= 1 && value <= 1000;
const PUMP_ERROR = 'Pump flow must be between 1 and 1000 m³ per hour.';

const bundCm = field => (field.bundMm ?? RICE_DEFAULTS.bundMm) / 10;

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
  } else if (isRice && isNum(f.usualAmountMm) && isNum(f.bundMm) && f.usualAmountMm > f.bundMm) {
    errors.usualAmountMm = `More than your field wall can hold (${f.bundMm / 10} cm).`;
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
export function validateRecord(r, field, today) {
  const errors = {};

  if (!isValidISODate(r.date)) errors.date = 'Enter a valid date.';
  else if (r.date > today) errors.date = 'The date cannot be in the future.';
  else if (r.date < field.plantingDate) errors.date = 'The date cannot be before the planting date.';

  if (r.type === 'irrigation') {
    if (!isNum(r.amount) || r.amount <= 0) errors.amount = 'Amount must be more than 0.';
    else if (r.unit === 'hours' && r.amount > 24) errors.amount = 'At most 24 hours. Add one record per day.';
    else if (r.unit === 'cm' && r.amount > bundCm(field)) {
      errors.amount = `At most ${bundCm(field)} cm: more than that would flow over your field wall.`;
    }
    if (r.unit === 'hours' && !isPumpFlow(r.pumpM3PerHour)) errors.pumpM3PerHour = PUMP_ERROR;
  } else if (r.type === 'depthReading') {
    if (!isNum(r.depthCm) || r.depthCm < 0 || r.depthCm > 30) errors.depthCm = 'Depth must be between 0 and 30 cm.';
    else if (r.depthCm > bundCm(field)) errors.depthCm = `Can't be higher than your field wall (${bundCm(field)} cm).`;
  } else {
    errors.type = 'Choose a record type.';
  }

  if ((r.note ?? '').length > 200) errors.note = 'Note must be 200 characters or fewer.';

  return errors;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContact(m) {
  const errors = {};
  if (m.name.length < 2 || m.name.length > 60) errors.name = 'Name must be 2–60 characters.';
  if (!EMAIL_PATTERN.test(m.email)) errors.email = 'Enter a valid email, e.g. name@example.com.';
  if (m.message.length < 10) errors.message = 'Message must be at least 10 characters.';
  else if (m.message.length > 1000) errors.message = 'Message must be 1000 characters or fewer.';
  return errors;
}

export function validateRegister(r) {
  const errors = {};
  if (r.name.length < 2 || r.name.length > 60) errors.name = 'Name must be 2–60 characters.';
  if (!EMAIL_PATTERN.test(r.email)) errors.email = 'Enter a valid email, e.g. name@example.com.';
  if (r.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (!/[A-Za-z]/.test(r.password) || !/\d/.test(r.password)) errors.password = 'Use at least one letter and one number.';
  if (r.confirm !== r.password) errors.confirm = 'The passwords do not match.';
  return errors;
}

export function validateLogin(l) {
  const errors = {};
  if (!EMAIL_PATTERN.test(l.email)) errors.email = 'Enter your email.';
  if (!l.password) errors.password = 'Enter your password.';
  return errors;
}
