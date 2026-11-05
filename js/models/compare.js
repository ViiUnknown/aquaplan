// Usual vs actual vs recommended irrigation (REQUIREMENTS.md §9).

import { FIELD_STATUS } from './constants.js';

/** 'over' | 'under' | 'on target' | 'n/a'. Within ±10% counts as on target. */
export function verdict(actualMm, recommendedMm) {
  if (recommendedMm == null) return 'n/a';
  if (recommendedMm === 0) return actualMm > 0 ? 'over' : 'on target';
  const diff = (actualMm - recommendedMm) / recommendedMm;
  if (Math.abs(diff) <= 0.1) return 'on target';
  return diff > 0 ? 'over' : 'under';
}

export function buildComparison(field, records, analysis) {
  const usualWeeklyMm = field.usualAmountMm != null && field.usualIntervalDays
    ? (field.usualAmountMm * 7) / field.usualIntervalDays
    : null;

  const recommendedWeeklyMm = analysis?.fieldStatus === FIELD_STATUS.ACTIVE
    ? analysis.weeklyRecommendedMm
    : null;

  let weekly = null;
  if (usualWeeklyMm != null && recommendedWeeklyMm != null) {
    const diffMm = usualWeeklyMm - recommendedWeeklyMm;
    weekly = {
      diffMm,
      diffPct: recommendedWeeklyMm > 0 ? (diffMm / recommendedWeeklyMm) * 100 : null,
    };
  }

  const rows = records
    .filter(r => r.type === 'irrigation')
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(record => {
      const actualMm = Number(record.amountMm);
      const recommendedMm = record.recommendedMm == null ? null : Number(record.recommendedMm);
      return {
        record,
        actualMm,
        recommendedMm,
        diffMm: recommendedMm == null ? null : actualMm - recommendedMm,
        verdict: verdict(actualMm, recommendedMm),
      };
    });

  return { usualWeeklyMm, recommendedWeeklyMm, weekly, rows };
}
