// Unit conversions and display formatting.

/** 1 mm of water over 1 ha = 10 m³. */
export const mmToM3 = (mm, areaHa) => mm * areaHa * 10;
export const m3ToMm = (m3, areaHa) => m3 / (areaHa * 10);
export const cmToMm = cm => cm * 10;
export const mmToCm = mm => mm / 10;

/** Seconds a pump takes to fill a 200-litre drum → pump flow in m³ per hour. */
export const drumSecondsToM3PerHour = seconds => (0.2 * 3600) / seconds;

/** Farmers know "the pump ran 3 hours", not mm: hours × flow = m³, spread over the field. */
export const pumpHoursToMm = (hours, m3PerHour, areaHa) => m3ToMm(hours * m3PerHour, areaHa);
export const mmToPumpHours = (mm, m3PerHour, areaHa) => mmToM3(mm, areaHa) / m3PerHour;

/** 1234.567 → "1,234.6". Returns "–" for missing values. */
export function formatNumber(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '–';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
}

function utcDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "2026-10-16" → "Fri 16 Oct" */
export function formatShortDate(iso) {
  return utcDate(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
}

/** "2026-10-16" → "16 Oct 2026" */
export function formatDate(iso) {
  if (!iso) return '–';
  return utcDate(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}

/** 26.3 mm → "2.6 cm". Farmers measure paddy water with a ruler, so depths are shown in cm. */
export const formatCm = mm => `${formatNumber(mmToCm(mm))} cm`;

/** "1.2 cm (180 m³)" – m³ only when the area is known. */
export function formatWater(mm, areaHa) {
  const base = formatCm(mm);
  return areaHa > 0 ? `${base} (${formatNumber(mmToM3(mm, areaHa), 0)} m³)` : base;
}

/** 2.5 → "2 h 30 min", 0.2 → "15 min" (rounded to 5 minutes). */
export function formatHours(hours) {
  const minutes = Math.max(5, Math.round((hours * 60) / 5) * 5);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Pumping time for `mm` on this field, or null when the pump flow is unknown. */
export function pumpTime(mm, field) {
  if (!(field.pumpM3PerHour > 0) || !(field.areaHa > 0) || !(mm > 0)) return null;
  return formatHours(mmToPumpHours(mm, field.pumpM3PerHour, field.areaHa));
}
