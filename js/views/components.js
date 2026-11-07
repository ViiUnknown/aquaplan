// Pieces of markup and wording shared by several screens.

import { CROPS, SOILS, STATUS, FIELD_STATUS, SKIP_LOOKAHEAD_DAYS } from '../models/constants.js';
import { html } from '../utils/ui.js';
import {
  formatShortDate, formatWater, formatDate, formatCm, pumpTime, drumSecondsToM3PerHour,
} from '../utils/format.js';

// label = headline on the field page, short = badge on cards and in the week strip
export const STATUS_META = {
  [STATUS.IRRIGATE]: { label: 'Water today', short: 'Water', cls: 'irrigate' },
  [STATUS.SKIP]: { label: 'Wait for the rain', short: 'Rain coming', cls: 'skip' },
  [STATUS.MONITOR]: { label: 'Check your field', short: 'Check', cls: 'monitor' },
  [STATUS.OK]: { label: 'No water needed', short: 'OK', cls: 'ok' },
  [STATUS.ENDED]: { label: 'Season over', short: 'Ended', cls: 'muted' },
};

export const VERDICT_TEXT = { over: 'Too much', under: 'Too little', 'on target': 'About right' };
export const VERDICT_CLASS = { over: 'irrigate', under: 'monitor', 'on target': 'ok' };

const STAGE_WORDS = {
  initial: 'young plants',
  development: 'growing',
  'mid-season': 'flowering and filling',
  late: 'ripening',
};

const RAIN_WORTH_MENTIONING_MM = 5;

export const cropLabel = key => CROPS[key]?.label ?? key;
export const soilLabel = key => SOILS[key]?.label ?? '–';
export const stageWords = stage => STAGE_WORDS[stage] ?? stage ?? '–';
export const dayLabel = (date, today) => (date === today ? 'Today' : formatShortDate(date));

export function statusBadge(status) {
  const meta = STATUS_META[status] ?? { short: status, cls: 'muted' };
  return html`<span class="badge badge--${meta.cls}">${meta.short}</span>`;
}

/** The first forecast day with real rain, as { date, rain }, or null. */
export function nextRain(analysis) {
  return analysis.plan.find(day => day.rain >= RAIN_WORTH_MENTIONING_MM) ?? null;
}

/** One plain sentence saying why today's advice is what it is. */
export function reasonText(analysis) {
  const today = analysis.todayEntry;
  const rice = analysis.isRice;

  switch (today.status) {
    case STATUS.IRRIGATE:
      return rice
        ? 'The paddy is running out of water and not enough rain is expected.'
        : 'The soil is too dry for the crop and not enough rain is expected.';

    case STATUS.SKIP: {
      const rainSoon = analysis.plan
        .slice(1, 1 + SKIP_LOOKAHEAD_DAYS)
        .reduce((sum, d) => sum + d.effRain, 0);
      return `The field needs water, but about ${formatCm(rainSoon)} of rain is expected `
        + `in the next ${SKIP_LOOKAHEAD_DAYS} days. That should be enough.`;
    }

    case STATUS.MONITOR:
      return rice
        ? 'The water is getting low. Look at the paddy again tomorrow.'
        : 'The soil is getting dry. Look at the field again tomorrow.';

    case STATUS.OK: {
      const rain = nextRain(analysis);
      return rain && rain.date !== today.date
        ? `The field has enough water. Rain is expected on ${formatShortDate(rain.date)} (about ${formatCm(rain.rain)}).`
        : 'The field has enough water.';
    }

    default:
      return '';
  }
}

/** One line about a field, for its dashboard card. */
export function fieldStatusSummary(field, analysis) {
  switch (analysis.fieldStatus) {
    case FIELD_STATUS.NOT_PLANTED:
      return html`
        <span class="badge badge--muted">Not planted yet</span>
        <span>Planting in ${-analysis.dspToday} day(s)</span>`;
    case FIELD_STATUS.SEASON_FINISHED:
      return html`<span class="badge badge--muted">Season finished</span>`;
    case FIELD_STATUS.NEEDS_READING:
      return html`
        <span class="badge badge--monitor">Measure water</span>
        <span>Tell us how deep the water is today</span>`;
    default: {
      const today = analysis.todayEntry;
      return html`${statusBadge(today.status)} <span>${summaryText(field, today, analysis.nextIrrigation)}</span>`;
    }
  }
}

function summaryText(field, today, next) {
  switch (today.status) {
    case STATUS.IRRIGATE: {
      const hours = pumpTime(today.amountMm, field);
      return `Add ${formatWater(today.amountMm, field.areaHa)} of water today${hours ? ` (pump ${hours})` : ''}`;
    }
    case STATUS.SKIP:
      return 'Needs water, but rain is coming';
    case STATUS.MONITOR:
      return 'Water is getting low';
    default:
      return next ? `Next watering ${formatShortDate(next.date)}` : 'No watering needed this week';
  }
}

// ---------- the advice card at the top of the field page ----------

export function statusHero(field, analysis) {
  const crop = CROPS[field.cropType];

  switch (analysis.fieldStatus) {
    case FIELD_STATUS.NOT_PLANTED:
      return simpleHero('muted', 'Not planted yet',
        `Planting in ${-analysis.dspToday} day(s) (${formatDate(field.plantingDate)}). `
        + 'Advice starts once the crop is planted.');
    case FIELD_STATUS.SEASON_FINISHED:
      return simpleHero('muted', 'Season finished',
        `The ${crop.label.toLowerCase()} season (${analysis.seasonLength} days) has ended. `
        + 'Change the planting date in Edit to plan a new season.');
    case FIELD_STATUS.NEEDS_READING:
      return simpleHero('monitor', 'How much water is in the paddy?',
        'Put a ruler in the water and enter the depth below. Then AquaPlan can tell you when to add water.');
    default:
      return adviceHero(field, crop, analysis);
  }
}

function simpleHero(cls, title, text) {
  return html`
    <div class="card hero hero--${cls}">
      <p class="hero__title">${title}</p>
      <p>${text}</p>
    </div>`;
}

function adviceHero(field, crop, analysis) {
  const today = analysis.todayEntry;
  const next = analysis.nextIrrigation;
  const meta = STATUS_META[today.status];
  const waterToday = today.status === STATUS.IRRIGATE;
  const pumpToday = waterToday ? pumpTime(today.amountMm, field) : null;

  return html`
    <div class="card hero hero--${meta.cls}">
      <p class="hero__title">${meta.label}</p>
      ${waterToday
        ? html`<p class="hero__message">Add ${formatWater(today.amountMm, field.areaHa)} of water today.</p>`
        : ''}
      ${pumpToday ? html`<p class="hero__pump">⛽ Run your pump for about <strong>${pumpToday}</strong>.</p>` : ''}
      <p class="hero__reason">${reasonText(analysis)}</p>
      ${nextWateringLine(field, today, next)}
      <div class="hero__facts">
        ${waterMeter(analysis)}
        <p class="muted">
          Crop: ${crop.label.toLowerCase()}, day ${analysis.dspToday} of ${analysis.seasonLength}
          (${stageWords(analysis.kcToday?.stage)})
        </p>
      </div>
    </div>`;
}

function nextWateringLine(field, today, next) {
  if (!next) return html`<p class="hero__next">No watering needed in the next 7 days.</p>`;
  if (next === today) return '';
  const pump = pumpTime(next.amountMm, field);
  return html`
    <p class="hero__next">
      Next watering: ${formatShortDate(next.date)}, about ${formatWater(next.amountMm, field.areaHa)}${pump ? ` (pump ${pump})` : ''}.
    </p>`;
}

/** A full/empty bar with words instead of raw mm. */
function waterMeter(analysis) {
  const p = analysis.params;
  const start = analysis.todayEntry.start;
  const percent = share => Math.round(Math.min(1, Math.max(0, share)) * 100);

  if (analysis.isRice) {
    const full = percent(start / p.targetMm);
    return html`
      <div class="meter-block">
        <p class="meter-block__label">Water in the paddy now: <strong>${formatCm(start)}</strong></p>
        <div class="meter" role="img" aria-label="Paddy is ${full}% full">
          <div class="meter__fill" style="width:${full}%"></div>
        </div>
        <p class="hint">Keep it near ${formatCm(p.targetMm)}. Add water when it drops to ${formatCm(p.refillMm)}.</p>
      </div>`;
  }

  const moist = percent(1 - start / p.raw);
  const word = start >= p.raw ? 'Dry' : start >= p.monitorAt ? 'Getting dry' : 'Good';
  return html`
    <div class="meter-block">
      <p class="meter-block__label">Soil moisture: <strong>${word}</strong></p>
      <div class="meter" role="img" aria-label="Soil moisture ${word}">
        <div class="meter__fill" style="width:${moist}%"></div>
      </div>
      <p class="hint">Full bar = wet soil. Empty bar = time to water.</p>
    </div>`;
}

// ---------- water units and pump flow (field form + records form) ----------

// Paddy water can be measured with a ruler or by pump time. On upland soil the
// water soaks in, so only pump time makes sense.
export function waterUnits(isRice) {
  return isRice
    ? [{ value: 'cm', label: 'cm deep' }, { value: 'hours', label: 'hours of pumping' }]
    : [{ value: 'hours', label: 'hours of pumping' }];
}

export function waterUnitOptions(isRice, selected) {
  return waterUnits(isRice).map(unit => html`
    <option value="${unit.value}" ${unit.value === selected ? 'selected' : ''}>${unit.label}</option>`);
}

export function waterUnitHint(isRice) {
  return isRice
    ? 'cm = how much the water level rises. Hours = how long your pump runs.'
    : "How long your pump runs. The water soaks into the soil, so it can't be measured in cm.";
}

export function pumpFlowRow(idPrefix, value) {
  return html`
    <div class="form-row">
      <label for="${idPrefix}-pumpM3PerHour">Your pump gives (m³ per hour)</label>
      <input id="${idPrefix}-pumpM3PerHour" name="pumpM3PerHour" type="number" step="any" min="1" max="1000"
             value="${value ?? ''}" placeholder="e.g. 30">
      <p class="hint">
        Not sure? Count how many seconds the pump takes to fill a 200-litre drum:
        <input class="input--inline" name="drumSeconds" type="number" step="any" min="1" placeholder="sec"
               aria-label="Seconds to fill a 200-litre drum"> seconds.
        AquaPlan works out the flow.
      </p>
      <p class="error" data-error-for="pumpM3PerHour"></p>
    </div>`;
}

/** Typing the drum time fills in the pump flow. */
export function wireDrumHelper(form) {
  const drum = form.elements.namedItem('drumSeconds');
  const flow = form.elements.namedItem('pumpM3PerHour');
  drum.addEventListener('input', () => {
    const seconds = Number(drum.value);
    if (seconds > 0) {
      flow.value = Math.round(drumSecondsToM3PerHour(seconds) * 10) / 10;
      flow.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}
