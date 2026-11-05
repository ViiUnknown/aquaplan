// Date helpers. All dates are plain "YYYY-MM-DD" strings, which avoids
// time-zone bugs and sorts correctly as text.

const DAY_MS = 24 * 60 * 60 * 1000;

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `fromIso` to `toIso` (negative if `toIso` is earlier). */
export function daysBetween(fromIso, toIso) {
  return Math.round((toUTC(toIso) - toUTC(fromIso)) / DAY_MS);
}

/** The date `n` days after `iso` (use a negative `n` for earlier dates). */
export function addDays(iso, n) {
  return new Date(toUTC(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Today's date in the given time zone, as "YYYY-MM-DD". */
export function todayISO(timeZone = 'Asia/Phnom_Penh') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** True for a real calendar date in "YYYY-MM-DD" form (rejects 2026-02-30). */
export function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(toUTC(value)).toISOString().slice(0, 10) === value;
}
