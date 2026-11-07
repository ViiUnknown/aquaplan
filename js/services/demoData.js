// Creates realistic sample fields and records on the Mockoon server (button on the empty dashboard).

import { createField, createRecord } from '../api/mockoon.js';
import { addDays, todayISO } from '../utils/date.js';
import { TIMEZONE } from '../config.js';
import { currentUser } from '../auth.js';

export async function seedDemoData() {
  const today = todayISO(TIMEZONE);
  const ago = n => addDays(today, -n);
  const ownerId = currentUser().id;   // the demo fields belong to the logged-in user

  const rice = await createField({
    ownerId, name: 'North paddy', cropType: 'rice', plantingDate: ago(45), areaHa: 1.5, soilType: 'clay',
    rootDepthM: null, p: null,
    locationName: 'Battambang, Cambodia', lat: 13.1027, lon: 103.1982,
    usualAmountMm: 50, usualIntervalDays: 4,
    seepageMmDay: 4, refillMm: 0, targetMm: 50, bundMm: 100,
    pumpM3PerHour: 60,
  });

  const maize = await createField({
    ownerId, name: 'East maize plot', cropType: 'maize', plantingDate: ago(40), areaHa: 0.8, soilType: 'loam',
    rootDepthM: 1.0, p: 0.55,
    locationName: 'Kampong Cham, Cambodia', lat: 11.9934, lon: 105.4635,
    usualAmountMm: 30, usualIntervalDays: 5,
    seepageMmDay: null, refillMm: null, targetMm: null, bundMm: null,
    pumpM3PerHour: 30,
  });

  await createField({
    ownerId, name: 'Soybean strip', cropType: 'soybean', plantingDate: ago(20), areaHa: 0.5, soilType: 'sandyLoam',
    rootDepthM: null, p: null,
    locationName: 'Siem Reap, Cambodia', lat: 13.3633, lon: 103.8564,
    usualAmountMm: 25, usualIntervalDays: 4,
    seepageMmDay: null, refillMm: null, targetMm: null, bundMm: null,
    pumpM3PerHour: null,
  });

  // One request at a time keeps the records in a predictable order.
  const records = [
    { fieldId: rice.id, date: ago(8), type: 'irrigation', amountMm: 50, depthMm: null, recommendedMm: 45, note: 'Canal water' },
    { fieldId: rice.id, date: ago(2), type: 'depthReading', amountMm: null, depthMm: 40, recommendedMm: null, note: 'Gauge stick' },
    { fieldId: maize.id, date: ago(15), type: 'irrigation', amountMm: 35, depthMm: null, recommendedMm: 30, note: '' },
    { fieldId: maize.id, date: ago(6), type: 'irrigation', amountMm: 30, depthMm: null, recommendedMm: 35, note: 'Pump 3 hours' },
  ];
  for (const record of records) {
    await createRecord(record);
  }
}
