// Agronomic defaults for the course prototype.
// Kc values and stage lengths are approximate FAO-56 values (Tables 11, 12, 22).
// They are practical defaults, not validated recommendations for real farms.

export const CROPS = {
  rice: {
    label: 'Paddy rice', model: 'rice',
    kcIni: 1.05, kcMid: 1.20, kcEnd: 0.90,
    stages: [30, 30, 60, 30],          // initial, development, mid-season, late (days)
    rootDepthM: null, p: null,
  },
  maize: {
    label: 'Maize', model: 'upland',
    kcIni: 0.30, kcMid: 1.20, kcEnd: 0.50,
    stages: [20, 35, 40, 30],
    rootDepthM: 1.0, p: 0.55,
  },
  soybean: {
    label: 'Soybean', model: 'upland',
    kcIni: 0.40, kcMid: 1.15, kcEnd: 0.50,
    stages: [15, 15, 40, 15],
    rootDepthM: 0.6, p: 0.50,
  },
  cassava: {
    label: 'Cassava (year 1)', model: 'upland',
    kcIni: 0.30, kcMid: 0.80, kcEnd: 0.30,
    stages: [20, 40, 90, 60],
    rootDepthM: 0.7, p: 0.35,
  },
};

// Available water capacity: mm of plant-available water per metre of soil.
export const SOILS = {
  sand:      { label: 'Sand',       awcMmPerM: 80 },
  sandyLoam: { label: 'Sandy loam', awcMmPerM: 120 },
  loam:      { label: 'Loam',       awcMmPerM: 160 },
  clayLoam:  { label: 'Clay loam',  awcMmPerM: 170 },
  clay:      { label: 'Clay',       awcMmPerM: 190 },
};

export const RICE_DEFAULTS = {
  seepageMmDay: 4,   // seepage + percolation, allowed 2–6
  refillMm: 0,       // refill when the projected depth reaches this level
  targetMm: 50,      // refill up to this depth
  bundMm: 100,       // maximum depth; extra rain runs off
};

export const UPLAND_RAIN_EFFICIENCY = 0.8;  // Peff = 0.8 × P (rice uses 100%, capped by the bund)
export const MONITOR_FRACTION = 0.7;        // upland: MONITOR when deficit ≥ 0.7 × RAW
export const RICE_MONITOR_MARGIN_MM = 10;   // rice: MONITOR when depth ≤ refill + 10 mm
export const SKIP_LOOKAHEAD_DAYS = 2;       // SKIP if rain in the next 2 days covers the need
export const MAX_PAST_DAYS = 92;            // Open-Meteo past_days limit
export const FORECAST_DAYS = 7;

export const STATUS = {
  IRRIGATE: 'IRRIGATE',
  SKIP: 'SKIP',
  MONITOR: 'MONITOR',
  OK: 'OK',
  ENDED: 'ENDED',    // forecast day after the end of the season
};

export const FIELD_STATUS = {
  ACTIVE: 'active',
  NOT_PLANTED: 'notPlanted',
  SEASON_FINISHED: 'seasonFinished',
  NEEDS_READING: 'needsReading',   // rice field without a usable depth reading
};
