// Upland model (maize, soybean, cassava): root-zone soil moisture deficit.
//   D[i] = clamp(D[i-1] + ETc[i] − 0.8·P[i] − I[i], 0, TAW)
// D = 0 means the soil is at field capacity (full).

import { CROPS, SOILS, UPLAND_RAIN_EFFICIENCY, MONITOR_FRACTION } from './constants.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** TAW / RAW and the thresholds for one field. Blank rootDepthM / p use the crop defaults. */
export function uplandParams(field) {
  const crop = CROPS[field.cropType];
  const soil = SOILS[field.soilType] ?? SOILS.loam;
  const rootDepthM = field.rootDepthM ?? crop.rootDepthM;
  const p = field.p ?? crop.p;
  const taw = soil.awcMmPerM * rootDepthM;
  const raw = p * taw;
  return { awcMmPerM: soil.awcMmPerM, rootDepthM, p, taw, raw, monitorAt: MONITOR_FRACTION * raw };
}

export function effectiveRainUpland(rainMm) {
  return UPLAND_RAIN_EFFICIENCY * rainMm;
}

/** Deficit at the end of a day if no irrigation is applied that day. */
export function uplandDeficitBeforeIrrigation(deficit, etc, rain, taw) {
  return clamp(deficit + etc - effectiveRainUpland(rain), 0, taw);
}

/** One day of the water balance. `day` = { etc, rain, irrigation }. */
export function uplandStep(deficit, { etc, rain, irrigation = 0 }, taw) {
  return clamp(deficit + etc - effectiveRainUpland(rain) - irrigation, 0, taw);
}
