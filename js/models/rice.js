// Rice model: depth of ponded water in the paddy (mm).
//   S[i] = seepage if d[i-1] > 0, else 0
//   d[i] = min(bund, max(0, d[i-1] + P[i] + I[i] − ETc[i] − S[i]))
// Rice uses 100% of rainfall; anything above the bund height runs off.

import { RICE_DEFAULTS } from './constants.js';

export function riceParams(field) {
  return {
    seepageMmDay: field.seepageMmDay ?? RICE_DEFAULTS.seepageMmDay,
    refillMm: field.refillMm ?? RICE_DEFAULTS.refillMm,
    targetMm: field.targetMm ?? RICE_DEFAULTS.targetMm,
    bundMm: field.bundMm ?? RICE_DEFAULTS.bundMm,
  };
}

/** Depth at the end of a day if no irrigation is applied that day. */
export function riceDepthBeforeIrrigation(depth, etc, rain, params) {
  return riceStep(depth, { etc, rain, irrigation: 0 }, params);
}

/** One day of the depth projection. `day` = { etc, rain, irrigation }. */
export function riceStep(depth, { etc, rain, irrigation = 0 }, params) {
  const seepage = depth > 0 ? params.seepageMmDay : 0;
  return Math.min(params.bundMm, Math.max(0, depth + rain + irrigation - etc - seepage));
}
