// One field: #/fields/:id – today's advice, the week, the chart and the habit comparison

import { CROPS, FIELD_STATUS } from '../models/constants.js';
import { createRecord, deleteFieldWithRecords } from '../api/mockoon.js';
import { loadFieldAnalysis } from '../services/fieldService.js';
import { buildComparison } from '../models/compare.js';
import { validateRecord } from '../utils/validation.js';
import {
  cmToMm, mmToCm, formatNumber, formatDate, formatWater, formatCm, formatShortDate, pumpTime,
} from '../utils/format.js';
import {
  html, setHTML, renderLoading, errorBox, friendlyError, flashBanner, showFieldErrors, setBusy,
  numberValue, textValue,
} from '../utils/ui.js';
import { latestDepthReading } from '../models/plan.js';
import { setFlash, takeFlash } from '../state.js';
import { lineChart } from './chart.js';
import {
  cropLabel, soilLabel, statusHero, dayLabel, STATUS_META, VERDICT_TEXT, VERDICT_CLASS,
} from './components.js';

export async function renderFieldDetail(ctx, id) {
  const { container } = ctx;
  renderLoading(container, 'Loading field and weather…');
  const data = await loadFieldAnalysis(id);
  if (!ctx.isCurrent()) return;

  const { field, records, analysis, weatherError, today } = data;
  const isRice = CROPS[field.cropType]?.model === 'rice';
  const active = analysis?.fieldStatus === FIELD_STATUS.ACTIVE;

  setHTML(container, html`
    <section class="view">
      <a class="back-link" href="#/dashboard">← All fields</a>
      ${flashBanner(takeFlash())}

      <div class="page-head">
        <div>
          <h1>${field.name}</h1>
          <p class="meta">
            ${cropLabel(field.cropType)} · ${formatNumber(field.areaHa)} ha · planted ${formatDate(field.plantingDate)}
          </p>
          <p class="meta">Location: ${field.locationName}</p>
        </div>
        <div class="actions">
          <a class="btn" href="#/fields/${field.id}/records">Record watering</a>
          <a class="btn" href="#/fields/${field.id}/edit">Edit</a>
          <button class="btn btn--danger" type="button" data-action="delete">Delete</button>
        </div>
      </div>

      ${weatherError ? weatherErrorCard(weatherError) : statusHero(field, analysis)}

      ${isRice ? depthReadingCard(records, today) : ''}
      ${active ? weekCard(field, analysis, today) : ''}
      ${active ? chartCard(analysis) : ''}
      ${comparisonCard(field, records, analysis)}
      ${analysis ? detailsCard(field, analysis, today) : ''}
    </section>`);

  container.querySelector('[data-action="retry"]')?.addEventListener('click', () => renderFieldDetail(ctx, id));
  container.querySelector('[data-action="delete"]')
    .addEventListener('click', event => deleteField(field, event.currentTarget));

  const depthForm = container.querySelector('form[data-form="depth"]');
  depthForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (await saveDepthReading(depthForm, field, today)) renderFieldDetail(ctx, id);
  });
}

// ---------- actions ----------

async function deleteField(field, button) {
  if (!window.confirm(`Delete "${field.name}" and all its records? This cannot be undone.`)) return;
  setBusy(button, true, 'Deleting…');
  try {
    await deleteFieldWithRecords(field.id);
    setFlash(`"${field.name}" was deleted.`);
    window.location.hash = '#/dashboard';
  } catch (error) {
    setBusy(button, false);
    window.alert(`Could not delete: ${friendlyError(error)}`);
  }
}

/** Returns true when the reading was saved. */
async function saveDepthReading(form, field, today) {
  const input = {
    type: 'depthReading',
    date: textValue(form, 'date'),
    depthCm: numberValue(form, 'depthCm'),
  };
  const errors = validateRecord(input, field, today);
  showFieldErrors(form, errors);
  if (Object.keys(errors).length > 0) return false;

  const button = form.querySelector('button[type="submit"]');
  setBusy(button, true);
  try {
    await createRecord({
      fieldId: field.id,
      date: input.date,
      type: 'depthReading',
      amountMm: null,
      depthMm: cmToMm(input.depthCm),
      recommendedMm: null,
      note: '',
    });
    setFlash('Water depth saved.');
    return true;
  } catch (error) {
    setBusy(button, false);
    form.querySelector('.form-error').textContent = `Could not save: ${friendlyError(error)}`;
    return false;
  }
}

// ---------- cards ----------

function weatherErrorCard(error) {
  return html`
    <div class="card">
      ${errorBox({ title: 'Weather unavailable', message: friendlyError(error), retry: true })}
    </div>`;
}

function depthReadingCard(records, today) {
  const latest = latestDepthReading(records, today);
  const lastMeasured = latest
    ? `Last measured: ${formatNumber(mmToCm(latest.depthMm))} cm on ${formatDate(latest.date)}.`
    : 'Not measured yet.';
  return html`
    <div class="card">
      <h2>How deep is the water today?</h2>
      <p class="muted">${lastMeasured} Put a ruler in the water in the morning, before adding water.</p>
      <form class="form form--inline" data-form="depth" novalidate>
        <div class="form-row">
          <label for="d-depthCm">Water depth (cm)</label>
          <input id="d-depthCm" name="depthCm" type="number" step="0.1" min="0" max="30" required
                 placeholder="e.g. 3">
          <p class="error" data-error-for="depthCm"></p>
        </div>
        <div class="form-row">
          <label for="d-date">Date</label>
          <input id="d-date" name="date" type="date" value="${today}" max="${today}" required>
          <p class="error" data-error-for="date"></p>
        </div>
        <button class="btn btn--primary" type="submit">Save</button>
        <p class="error form-error" role="alert"></p>
      </form>
    </div>`;
}

/** One box per day: rain, what to do, and how much water. */
function weekCard(field, analysis, today) {
  return html`
    <div class="card">
      <h2>This week</h2>
      <ol class="week">
        ${analysis.plan.map(day => weekDay(day, field, today))}
      </ol>
      <p class="hint">🌧 = rain expected. After a "Water" day, the plan assumes you added the water.</p>
    </div>`;
}

function weekDay(day, field, today) {
  const meta = STATUS_META[day.status];
  const isToday = day.date === today;
  const [weekday, ...rest] = formatShortDate(day.date).split(' ');
  const pump = pumpTime(day.amountMm, field);
  return html`
    <li class="week__day week__day--${meta.cls} ${isToday ? 'is-today' : ''}">
      <span class="week__name">${isToday ? 'Today' : weekday}</span>
      <span class="week__date">${rest.join(' ')}</span>
      <span class="week__rain">${day.rain >= 1 ? `🌧 ${formatCm(day.rain)}` : '☀ dry'}</span>
      <span class="week__status">${meta.short}</span>
      ${day.amountMm > 0 ? html`<span class="week__amount">Add ${formatCm(day.amountMm)}</span>` : ''}
      ${pump ? html`<span class="week__pump">⛽ ${pump}</span>` : ''}
    </li>`;
}

const RICE_CHART_HELP = 'Solid line = past weeks, dashed line = next 7 days. '
  + 'Add water before the line reaches the bottom line. A jump up means the water the plan tells you to add.';
const UPLAND_CHART_HELP = 'Higher means drier. Solid line = past weeks, dashed line = next 7 days. '
  + 'Water when the line reaches "Water needed". A drop means the water the plan tells you to add.';

function chartCard(analysis) {
  const history = analysis.history.slice(-21);   // 3 weeks keeps the chart readable
  const dates = [...history.map(d => d.date), ...analysis.plan.map(d => d.date)];
  const toUnit = analysis.isRice ? mmToCm : v => v;
  const historyPoints = history.map((d, i) => ({ i, y: toUnit(d.end) }));
  const forecastPoints = analysis.plan.map((d, j) => ({ i: history.length + j, y: toUnit(d.end) }));
  // The dashed line starts at this morning's value (rice: the depth reading), so a
  // "Water today" refill shows as a jump instead of hiding a low reading.
  const today = analysis.plan[0];
  if (today) forecastPoints.unshift({ i: history.length, y: toUnit(today.start) });
  if (historyPoints.length) forecastPoints.unshift(historyPoints.at(-1));

  const p = analysis.params;
  const thresholds = analysis.isRice
    ? [
      { y: mmToCm(p.targetMm), label: `Fill to ${formatCm(p.targetMm)}`, cls: 'is-target' },
      { y: mmToCm(p.refillMm), label: `Add water at ${formatCm(p.refillMm)}`, cls: 'is-limit' },
    ]
    : [
      { y: p.raw, label: 'Water needed', cls: 'is-limit' },
      { y: p.monitorAt, label: 'Getting dry', cls: 'is-monitor' },
    ];

  return html`
    <div class="card">
      <h2>${analysis.isRice ? 'Water in the paddy (cm)' : 'How dry the soil is'}</h2>
      <p class="muted">${analysis.isRice ? RICE_CHART_HELP : UPLAND_CHART_HELP}</p>
      ${lineChart({
        dates,
        series: [
          { label: 'Past weeks (estimated)', cls: 'is-history', points: historyPoints },
          { label: 'Next 7 days', cls: 'is-forecast', dashed: true, points: forecastPoints },
        ],
        thresholds,
        todayIndex: history.length,
        ariaLabel: analysis.isRice ? 'Paddy water depth over time' : 'Soil dryness over time',
      })}
    </div>`;
}

const verdictBadge = verdict => html`
  <span class="badge badge--${VERDICT_CLASS[verdict] ?? 'muted'}">${VERDICT_TEXT[verdict] ?? verdict}</span>`;

function comparisonCard(field, records, analysis) {
  const c = buildComparison(field, records, analysis);

  let saving = '';
  if (c.weekly && c.weekly.diffMm !== 0) {
    const m3 = Math.abs(c.weekly.diffMm) * field.areaHa * 10;
    saving = c.weekly.diffMm > 0
      ? `This week you could use about ${formatNumber(m3, 0)} m³ less water than usual.`
      : `This week the field needs about ${formatNumber(m3, 0)} m³ more water than you usually give.`;
  }

  return html`
    <div class="card">
      <h2>Your usual watering vs AquaPlan</h2>
      ${c.usualWeeklyMm == null
        ? html`<p class="muted">Tell us how you usually water in <a href="#/fields/${field.id}/edit">Edit</a> to compare.</p>`
        : html`
          ${saving ? html`<p class="hero__message">${saving}</p>` : ''}
          <dl class="stats">
            <div><dt>You usually give (per week)</dt><dd>${formatWater(c.usualWeeklyMm, field.areaHa)}</dd></div>
            <div>
              <dt>AquaPlan suggests (next 7 days)</dt>
              <dd>${c.recommendedWeeklyMm == null ? '–' : formatWater(c.recommendedWeeklyMm, field.areaHa)}</dd>
            </div>
          </dl>`}

      <h3>Water you added</h3>
      ${c.rows.length === 0
        ? html`<p class="muted">Nothing recorded yet. <a href="#/fields/${field.id}/records">Record watering</a>.</p>`
        : html`
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" class="num">You added</th>
                  <th scope="col" class="num">AquaPlan said</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                ${c.rows.slice(0, 5).map(r => html`
                  <tr>
                    <th scope="row">${formatDate(r.record.date)}</th>
                    <td class="num">${formatCm(r.actualMm)}</td>
                    <td class="num">${r.recommendedMm == null ? '–' : formatCm(r.recommendedMm)}</td>
                    <td>${verdictBadge(r.verdict)}</td>
                  </tr>`)}
              </tbody>
            </table>
          </div>
          <p><a href="#/fields/${field.id}/records">All records →</a></p>`}
    </div>`;
}

/** The technical view: the full numbers, for teachers, students and agronomists. */
function detailsCard(field, analysis, today) {
  const active = analysis.fieldStatus === FIELD_STATUS.ACTIVE;
  return html`
    <details class="card details">
      <summary>How this was calculated (details)</summary>
      ${active ? todayStats(analysis) : ''}
      ${active ? planTable(analysis, today) : ''}
      ${analysis.isRice ? riceSettings(analysis.params) : uplandSettings(field, analysis.params)}
      <p>
        Crop water use = Kc × ET₀ (FAO-56). Kc depends on the growth stage. Weather: Open-Meteo.
        1 cm of water on 1 ha = 100 m³.
      </p>
      <p>
        Status codes: IRRIGATE = water today. SKIP = water is needed, but the rain forecast for the
        next 2 days covers it. MONITOR = close to the limit. OK = enough water.
      </p>
      ${analysis.notes.length ? html`<ul>${analysis.notes.map(note => html`<li>${note}</li>`)}</ul>` : ''}
      <p class="muted">Course prototype using simplified FAO-56 defaults. Not professional agronomic advice.</p>
    </details>`;
}

function todayStats(analysis) {
  const p = analysis.params;
  const t = analysis.todayEntry;
  const startLabel = analysis.isRice ? 'Water depth (start of today)' : 'Soil water deficit (start of today)';
  const limits = analysis.isRice
    ? `refill at ${formatNumber(p.refillMm)} mm, target ${formatNumber(p.targetMm)} mm`
    : `irrigate at ${formatNumber(p.raw)} mm`;
  return html`
    <dl class="stats">
      <div>
        <dt>${startLabel}</dt>
        <dd>${formatNumber(t.start)} mm <small>(${limits})</small></dd>
      </div>
      <div>
        <dt>Growth stage</dt>
        <dd>${analysis.kcToday?.stage ?? '–'} <small>(day ${analysis.dspToday} of ${analysis.seasonLength})</small></dd>
      </div>
      <div>
        <dt>Crop water use today</dt>
        <dd>${formatNumber(t.etc)} mm <small>(Kc ${formatNumber(t.kc, 2)} × ET₀ ${formatNumber(t.et0)})</small></dd>
      </div>
    </dl>`;
}

function planTable(analysis, today) {
  const stateLabel = analysis.isRice ? 'Depth at day end' : 'Deficit at day end';
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col" class="num">Rain (mm)</th>
            <th scope="col" class="num">ET₀ (mm)</th>
            <th scope="col" class="num">Kc</th>
            <th scope="col" class="num">Crop use (mm)</th>
            <th scope="col" class="num">${stateLabel} (mm)</th>
            <th scope="col">Status</th>
            <th scope="col" class="num">Apply (mm)</th>
          </tr>
        </thead>
        <tbody>
          ${analysis.plan.map(day => html`
            <tr class="${day.date === today ? 'is-today' : ''}">
              <th scope="row">${dayLabel(day.date, today)}</th>
              <td class="num">${formatNumber(day.rain)}</td>
              <td class="num">${formatNumber(day.et0)}</td>
              <td class="num">${day.kc === null ? '–' : formatNumber(day.kc, 2)}</td>
              <td class="num">${formatNumber(day.etc)}</td>
              <td class="num">${formatNumber(day.end)}</td>
              <td>${day.status}</td>
              <td class="num">${day.amountMm > 0 ? formatNumber(day.amountMm) : '–'}</td>
            </tr>`)}
        </tbody>
      </table>
    </div>`;
}

function riceSettings(p) {
  return html`
    <dl class="stats">
      <div><dt>Seepage</dt><dd>${formatNumber(p.seepageMmDay)} mm/day</dd></div>
      <div><dt>Refill / target / bund</dt><dd>${p.refillMm} / ${p.targetMm} / ${p.bundMm} mm</dd></div>
    </dl>
    <p>
      Each day: depth + rain + irrigation − crop water use − seepage, capped at the bund height.
      Rice counts 100% of rain.
    </p>`;
}

function uplandSettings(field, p) {
  return html`
    <dl class="stats">
      <div><dt>Soil</dt><dd>${soilLabel(field.soilType)} (${p.awcMmPerM} mm/m)</dd></div>
      <div><dt>Root depth × p</dt><dd>${formatNumber(p.rootDepthM, 2)} m × ${formatNumber(p.p, 2)}</dd></div>
      <div><dt>TAW / RAW</dt><dd>${formatNumber(p.taw)} / ${formatNumber(p.raw)} mm</dd></div>
    </dl>
    <p>Each day: deficit + crop water use − 80% of rain − irrigation, kept between 0 and TAW.</p>`;
}
