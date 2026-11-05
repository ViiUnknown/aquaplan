// Small pieces of markup shared by several views.
// Farmer-facing text uses plain words and cm; the technical numbers live in "How this was calculated".

import { CROPS, SOILS, STATUS, FIELD_STATUS, SKIP_LOOKAHEAD_DAYS } from '../models/constants.js';
import { html } from '../utils/ui.js';
import {
  formatNumber, formatShortDate, formatWater, formatDate, formatCm, pumpTime, drumSecondsToM3PerHour,
} from '../utils/format.js';

// label = headline on the field page, short = badge in lists and the week strip.
export const STATUS_META = {
  [STATUS.IRRIGATE]: { label: 'Water today', short: 'Water', cls: 'irrigate' },
  [STATUS.SKIP]: { label: 'Wait for the rain', short: 'Rain coming', cls: 'skip' },
  [STATUS.MONITOR]: { label: 'Check your field', short: 'Check', cls: 'monitor' },
  [STATUS.OK]: { label: 'No water needed', short: 'OK', cls: 'ok' },
  [STATUS.ENDED]: { label: 'Season over', short: 'Ended', cls: 'muted' },
};

// Actual vs recommended, in plain words (compare.js returns over / under / on target).
export const VERDICT_TEXT = { over: 'Too much', under: 'Too little', 'on target': 'About right' };
export const VERDICT_CLASS = { over: 'irrigate', under: 'monitor', 'on target': 'ok' };

export const statusBadge = status => {
  const meta = STATUS_META[status] ?? { short: status, cls: 'muted' };
  return html`<span class="badge badge--${meta.cls}">${meta.short}</span>`;
};

export const cropLabel = key => CROPS[key]?.label ?? key;
export const soilLabel = key => SOILS[key]?.label ?? '–';

export function dayLabel(date, today) {
  return date === today ? 'Today' : formatShortDate(date);
}

// Growth stages in words a farmer uses.
const STAGE_WORDS = {
  initial: 'young plants',
  development: 'growing',
  'mid-season': 'flowering and filling',
  late: 'ripening',
};
export const stageWords = stage => STAGE_WORDS[stage] ?? stage ?? '–';

const RAIN_WORTH_MENTIONING_MM = 5;

/** First forecast day with real rain, e.g. { date, rain }. */
export function nextRain(analysis) {
  return analysis.plan.find(day => day.rain >= RAIN_WORTH_MENTIONING_MM) ?? null;
}

/** One plain sentence that says WHY today's advice is what it is. */
export function reasonText(analysis) {
  const today = analysis.todayEntry;
  const rice = analysis.isRice;
  const rain = nextRain(analysis);
  const rainSoon = analysis.plan.slice(1, 1 + SKIP_LOOKAHEAD_DAYS).reduce((sum, d) => sum + d.effRain, 0);

  switch (today.status) {
    case STATUS.IRRIGATE:
      return rice
        ? 'The paddy is running out of water and not enough rain is expected.'
        : 'The soil is too dry for the crop and not enough rain is expected.';
    case STATUS.SKIP:
      return `The field needs water, but about ${formatCm(rainSoon)} of rain is expected in the next ${SKIP_LOOKAHEAD_DAYS} days. That should be enough.`;
    case STATUS.MONITOR:
      return rice
        ? 'The water is getting low. Look at the paddy again tomorrow.'
        : 'The soil is getting dry. Look at the field again tomorrow.';
    case STATUS.OK:
      return rain && rain.date !== today.date
        ? `The field has enough water. Rain is expected on ${formatShortDate(rain.date)} (about ${formatCm(rain.rain)}).`
        : 'The field has enough water.';
    default:
      return '';
  }
}

/** One-line summary of a field's situation (dashboard cards). */
export function fieldStatusSummary(field, analysis) {
  switch (analysis.fieldStatus) {
    case FIELD_STATUS.NOT_PLANTED:
      return html`<span class="badge badge--muted">Not planted yet</span>
        <span>Planting in ${-analysis.dspToday} day(s)</span>`;
    case FIELD_STATUS.SEASON_FINISHED:
      return html`<span class="badge badge--muted">Season finished</span>`;
    case FIELD_STATUS.NEEDS_READING:
      return html`<span class="badge badge--monitor">Measure water</span>
        <span>Tell us how deep the water is today</span>`;
    default: {
      const today = analysis.todayEntry;
      const next = analysis.nextIrrigation;
      let text;
      if (today.status === STATUS.IRRIGATE) {
        const hours = pumpTime(today.amountMm, field);
        text = `Add ${formatWater(today.amountMm, field.areaHa)} of water today${hours ? ` (pump ${hours})` : ''}`;
      }
      else if (today.status === STATUS.SKIP) text = 'Needs water, but rain is coming';
      else if (today.status === STATUS.MONITOR) text = 'Water is getting low';
      else if (next) text = `Next watering ${formatShortDate(next.date)}`;
      else text = 'No watering needed this week';
      return html`${statusBadge(today.status)} <span>${text}</span>`;
    }
  }
}

/** A simple full/empty bar with words, instead of raw mm. */
function waterMeter(analysis) {
  const p = analysis.params;
  const start = analysis.todayEntry.start;

  if (analysis.isRice) {
    const fill = Math.min(1, Math.max(0, start / p.targetMm));
    return html`
      <div class="meter-block">
        <p class="meter-block__label">Water in the paddy now: <strong>${formatCm(start)}</strong></p>
        <div class="meter" role="img" aria-label="Paddy is ${Math.round(fill * 100)}% full">
          <div class="meter__fill" style="width:${Math.round(fill * 100)}%"></div>
        </div>
        <p class="hint">Keep it near ${formatCm(p.targetMm)}. Add water when it drops to ${formatCm(p.refillMm)}.</p>
      </div>`;
  }

  const fill = Math.min(1, Math.max(0, 1 - start / p.raw));
  const word = start >= p.raw ? 'Dry' : start >= p.monitorAt ? 'Getting dry' : 'Good';
  return html`
    <div class="meter-block">
      <p class="meter-block__label">Soil moisture: <strong>${word}</strong></p>
      <div class="meter" role="img" aria-label="Soil moisture ${word}">
        <div class="meter__fill" style="width:${Math.round(fill * 100)}%"></div>
      </div>
      <p class="hint">Full bar = wet soil. Empty bar = time to water.</p>
    </div>`;
}

/** Big answer card at the top of the field page: what to do, why, and when next. */
export function statusHero(field, analysis) {
  const crop = CROPS[field.cropType];

  if (analysis.fieldStatus === FIELD_STATUS.NOT_PLANTED) {
    return html`<div class="card hero hero--muted">
      <p class="hero__title">Not planted yet</p>
      <p>Planting in ${-analysis.dspToday} day(s) (${formatDate(field.plantingDate)}). Advice starts once the crop is planted.</p>
    </div>`;
  }
  if (analysis.fieldStatus === FIELD_STATUS.SEASON_FINISHED) {
    return html`<div class="card hero hero--muted">
      <p class="hero__title">Season finished</p>
      <p>The ${crop.label.toLowerCase()} season (${analysis.seasonLength} days) has ended. Change the planting date in Edit to plan a new season.</p>
    </div>`;
  }
  if (analysis.fieldStatus === FIELD_STATUS.NEEDS_READING) {
    return html`<div class="card hero hero--monitor">
      <p class="hero__title">How much water is in the paddy?</p>
      <p>Put a ruler in the water and enter the depth below. Then AquaPlan can tell you when to add water.</p>
    </div>`;
  }

  const today = analysis.todayEntry;
  const next = analysis.nextIrrigation;
  const meta = STATUS_META[today.status];

  const headline = today.status === STATUS.IRRIGATE
    ? `Add ${formatWater(today.amountMm, field.areaHa)} of water today.`
    : null;
  const todayPump = today.status === STATUS.IRRIGATE ? pumpTime(today.amountMm, field) : null;
  const nextPump = next ? pumpTime(next.amountMm, field) : null;
  const nextText = next && next !== today
    ? `Next watering: ${formatShortDate(next.date)}, about ${formatWater(next.amountMm, field.areaHa)}${nextPump ? ` (pump ${nextPump})` : ''}.`
    : (next ? '' : 'No watering needed in the next 7 days.');

  return html`<div class="card hero hero--${meta.cls}">
    <p class="hero__title">${meta.label}</p>
    ${headline ? html`<p class="hero__message">${headline}</p>` : ''}
    ${todayPump ? html`<p class="hero__pump">⛽ Run your pump for about <strong>${todayPump}</strong>.</p>` : ''}
    <p class="hero__reason">${reasonText(analysis)}</p>
    ${nextText ? html`<p class="hero__next">${nextText}</p>` : ''}
    <div class="hero__facts">
      ${waterMeter(analysis)}
      <p class="muted">Crop: ${crop.label.toLowerCase()}, day ${analysis.dspToday} of ${analysis.seasonLength} (${stageWords(analysis.kcToday?.stage)})</p>
    </div>
  </div>`;
}

/**
 * Units a farmer can give a watering amount in. Paddy water can be measured with a ruler (cm) or
 * by pump time; on upland soil the water soaks in, so only pump time makes sense.
 */
export function waterUnits(isRice) {
  return isRice
    ? [{ value: 'cm', label: 'cm deep' }, { value: 'hours', label: 'hours of pumping' }]
    : [{ value: 'hours', label: 'hours of pumping' }];
}

export function waterUnitOptions(isRice, selected) {
  return waterUnits(isRice).map(u => html`<option value="${u.value}" ${u.value === selected ? 'selected' : ''}>${u.label}</option>`);
}

export function waterUnitHint(isRice) {
  return isRice
    ? 'cm = how much the water level rises. Hours = how long your pump runs.'
    : 'How long your pump runs. The water soaks into the soil, so it can\'t be measured in cm.';
}

/** "Pump flow" input with a drum-timing helper. Used by the field form and the records form. */
export function pumpFlowRow(idPrefix, value) {
  return html`
    <div class="form-row">
      <label for="${idPrefix}-pumpM3PerHour">Your pump gives (m³ per hour)</label>
      <input id="${idPrefix}-pumpM3PerHour" name="pumpM3PerHour" type="number" step="any" min="1" max="1000" value="${value ?? ''}" placeholder="e.g. 30">
      <p class="hint">Not sure? Count how many seconds the pump takes to fill a 200-litre drum:
        <input class="input--inline" name="drumSeconds" type="number" step="any" min="1" placeholder="sec" aria-label="Seconds to fill a 200-litre drum"> seconds.
        AquaPlan works out the flow.</p>
      <p class="error" data-error-for="pumpM3PerHour"></p>
    </div>`;
}

/** Typing the drum time fills in the pump flow. */
export function wireDrumHelper(form) {
  const drum = form.elements.namedItem('drumSeconds');
  drum.addEventListener('input', () => {
    const seconds = Number(drum.value);
    if (seconds > 0) {
      form.elements.namedItem('pumpM3PerHour').value = Math.round(drumSecondsToM3PerHour(seconds) * 10) / 10;
      form.elements.namedItem('pumpM3PerHour').dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

export function setupNotice() {
  return html`<div class="state state--setup">
    <h1>Connect MockAPI to get started</h1>
    <p>AquaPlan saves fields and records in MockAPI.io. Open <code>js/config.js</code> and replace
       <code>YOUR-PROJECT-ID</code> with your MockAPI project URL.</p>
    <p>Step-by-step instructions: <strong>SETUP_AND_DEPLOY.md</strong>, section 3.</p>
  </div>`;
}
