import { CROPS } from './constants.js';

/** Total season length in days for a crop. */
export function seasonLength(cropKey) {
  return CROPS[cropKey].stages.reduce((sum, days) => sum + days, 0);
}

/**
 * FAO-56 crop coefficient for a given number of days since planting (dsp).
 * Kc is flat in the initial and mid-season stages and changes linearly in
 * the development and late stages.
 * Returns { kc, stage }, or null when dsp is before planting or after the season.
 */
export function getKc(cropKey, dsp) {
  const crop = CROPS[cropKey];
  if (!crop) throw new Error(`Unknown crop: ${cropKey}`);

  const [ini, dev, mid, late] = crop.stages;
  const L1 = ini;
  const L2 = L1 + dev;
  const L3 = L2 + mid;
  const L4 = L3 + late;

  if (dsp < 0 || dsp > L4) return null;
  if (dsp < L1) return { kc: crop.kcIni, stage: 'initial' };
  if (dsp < L2) return { kc: crop.kcIni + ((dsp - L1) / dev) * (crop.kcMid - crop.kcIni), stage: 'development' };
  if (dsp < L3) return { kc: crop.kcMid, stage: 'mid-season' };
  return { kc: crop.kcMid + ((dsp - L3) / late) * (crop.kcEnd - crop.kcMid), stage: 'late' };
}
