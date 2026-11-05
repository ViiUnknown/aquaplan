// #/fields/:id – today's status, 7-day plan, chart and comparison.

import { CROPS, FIELD_STATUS } from '../models/constants.js';
import { createRecord, deleteFieldWithRecords } from '../api/mockApi.js';
import { loadFieldAnalysis } from '../services/fieldService.js';
import { buildComparison } from '../models/compare.js';
import { validateRecord } from '../utils/validation.js';
import { cmToMm, mmToCm, formatNumber, formatDate, formatWater, formatCm, formatShortDate, pumpTime } from '../utils/format.js';
import {
  html, setHTML, renderLoading, errorBox, friendlyError, flashBanner, showFieldErrors, setBusy,
  numberValue, textValue,
} from '../utils/ui.js';
import { latestDepthReading } from '../models/plan.js';
import { setFlash, takeFlash } from '../state.js';
import { isMockApiConfigured } from '../config.js';
import { lineChart } from './chart.js';
import {
  cropLabel, soilLabel, statusHero, dayLabel, setupNotice, STATUS_META, VERDICT_TEXT, VERDICT_CLASS,
} from './components.js';

export async function renderFieldDetail(ctx, id) {
  const { container } = ctx;
  if (!isMockApiConfigured()) {
    setHTML(container, setupNotice());
    return;
  }

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
          <p class="meta">${cropLabel(field.cropType)} · ${formatNumber(field.areaHa)} ha · planted ${formatDate(field.plantingDate)}</p>
          <p class="meta">Location: ${field.locationName}</p>
        </div>
        <div class="actions">
          <a class="btn" href="#/fields/${field.id}/records">Record watering</a>
          <a class="btn" href="#/fields/${field.id}/edit">Edit</a>
          <button class="btn btn--danger" type="button" data-action="delete">Delete</button>
        </div>
      </div>

      ${weatherError
        ? html`<div class="card">${errorBox({ title: 'Weather unavailable', message: friendlyError(weatherError), retry: true })}</div>`
        : statusHero(field, analysis)}

      ${isRice ? depthReadingCard(records, today) : ''}
      ${active ? weekCard(field, analysis, today) : ''}
      ${active ? chartCard(analysis) : ''}
      ${comparisonCard(field, records, analysis)}
      ${analysis ? detailsCard(field, analysis, today) : ''}
    </section>`);

  // ---- Events ----
  container.querySelector('[data-action="retry"]')?.addEventListener('click', () => renderFieldDetail(ctx, id));

  container.querySelector('[data-action="delete"]').addEventListener('click', async event => {
    if (!window.confirm(`Delete "${field.name}" and all its records? This cannot be undone.`)) return;
    const button = event.currentTarget;
    setBusy(button, true, 'Deleting…');
    try {
      await deleteFieldWithRecords(field.id);
      setFlash(`"${field.name}" was deleted.`);
      window.location.hash = '#/dashboard';
    } catch (error) {
      setBusy(button, false);
      window.alert(`Could not delete: ${friendlyError(error)}`);
    }
  });

  const depthForm = container.querySelector('form[data-form="depth"]');
  depthForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = {
      type: 'depthReading',
      date: textValue(depthForm, 'date'),
      depthCm: numberValue(depthForm, 'depthCm'),
    };
    const errors = validateRecord(input, field, today);
    showFieldErrors(depthForm, errors);
    if (Object.keys(errors).length > 0) return;

    const button = depthForm.querySelector('button[type="submit"]');
    setBusy(button, true);
    try {
      await createRecord({
        fieldId: field.id, date: input.date, type: 'depthReading',
        amountMm: null, depthMm: cmToMm(input.depthCm), recommendedMm: null, note: '',
      });
      setFlash('Water depth saved.');
      await renderFieldDetail(ctx, id);
    } catch (error) {
      setBusy(button, false);
      depthForm.querySelector('.form-error').textContent = `Could not save: ${friendlyError(error)}`;
    }
  });
}


// ---------- Sections ----------

function depthReadingCard(records, today) {
  const latest = latestDepthReading(records, today);
  return html`
    <div class="card">
      <h2>How deep is the water today?</h2>
      <p class="muted">${latest
        ? `Last measured: ${formatNumber(mmToCm(latest.depthMm))} cm on ${formatDate(latest.date)}.`
        : 'Not measured yet.'} Put a ruler in the water in the morning, before adding water.</p>
      <form class="form form--inline" data-form="depth" novalidate>
        <div class="form-row">
          <label for="d-depthCm">Water depth (cm)</label>
          <input id="d-depthCm" name="depthCm" type="number" step="0.1" min="0" max="30" required placeholder="e.g. 3">
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
        ${analysis.plan.map(day => {
          const meta = STATUS_META[day.status];
          const [weekday, ...rest] = formatShortDate(day.date).split(' ');
          return html`
            <li class="week__day week__day--${meta.cls} ${day.date === today ? 'is-today' : ''}">
              <span class="week__name">${day.date === today ? 'Today' : weekday}</span>
              <span class="week__date">${rest.join(' ')}</span>
              <span class="week__rain">${day.rain >= 1 ? `🌧 ${formatCm(day.rain)}` : '☀ dry'}</span>
              <span class="week__status">${meta.short}</span>
              ${day.amountMm > 0 ? html`<span class="week__amount">Add ${formatCm(day.amountMm)}</span>` : ''}
              ${pumpTime(day.amountMm, field) ? html`<span class="week__pump">⛽ ${pumpTime(day.amountMm, field)}</span>` : ''}
            </li>`;
        })}
      </ol>
      <p class="hint">🌧 = rain expected. After a "Water" day, the plan assumes you added the water.</p>
    </div>`;
}

function chartCard(analysis) {
  const history = analysis.history.slice(-21);   // last 3 weeks keeps the chart readable
  const dates = [...history.map(d => d.date), ...analysis.plan.map(d => d.date)];
  // Rice is shown in cm (what the farmer measures); upland stays in mm of dryness.
  const toUnit = analysis.isRice ? mmToCm : v => v;
  const historyPoints = history.map((d, i) => ({ i, y: toUnit(d.end) }));
  const forecastPoints = analysis.plan.map((d, j) => ({ i: history.length + j, y: toUnit(d.end) }));
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
      <p class="muted">${analysis.isRice
        ? 'Solid line = past weeks, dashed line = next 7 days. Add water before the line reaches the bottom line.'
        : 'Higher means drier. Solid line = past weeks, dashed line = next 7 days. Water when the line reaches "Water needed".'}</p>
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


function comparisonCard(field, records, analysis) {
  const c = buildComparison(field, records, analysis);
  const verdictBadge = v => html`<span class="badge badge--${VERDICT_CLASS[v] ?? 'muted'}">${VERDICT_TEXT[v] ?? v}</span>`;

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
            <div><dt>AquaPlan suggests (next 7 days)</dt><dd>${c.recommendedWeeklyMm == null ? '–' : formatWater(c.recommendedWeeklyMm, field.areaHa)}</dd></div>
          </dl>`}

      <h3>Water you added</h3>
      ${c.rows.length === 0
        ? html`<p class="muted">Nothing recorded yet. <a href="#/fields/${field.id}/records">Record watering</a>.</p>`
        : html`
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th scope="col">Date</th><th scope="col" class="num">You added</th><th scope="col" class="num">AquaPlan said</th><th scope="col">Result</th></tr></thead>
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

/** The technical view: full numbers for teachers, students and agronomists. */
function detailsCard(field, analysis, today) {
  const p = analysis.params;
  const active = analysis.fieldStatus === FIELD_STATUS.ACTIVE;
  const t = analysis.todayEntry;
  const stateLabel = analysis.isRice ? 'Depth at day end' : 'Deficit at day end';

  return html`
    <details class="card details">
      <summary>How this was calculated (details)</summary>
      ${active ? html`
        <dl class="stats">
          <div><dt>${analysis.isRice ? 'Water depth (start of today)' : 'Soil water deficit (start of today)'}</dt>
            <dd>${formatNumber(t.start)} mm <small>(${analysis.isRice
              ? `refill at ${formatNumber(p.refillMm)} mm, target ${formatNumber(p.targetMm)} mm`
              : `irrigate at ${formatNumber(p.raw)} mm`})</small></dd></div>
          <div><dt>Growth stage</dt><dd>${analysis.kcToday?.stage ?? '–'} <small>(day ${analysis.dspToday} of ${analysis.seasonLength})</small></dd></div>
          <div><dt>Crop water use today</dt><dd>${formatNumber(t.etc)} mm <small>(Kc ${formatNumber(t.kc, 2)} × ET₀ ${formatNumber(t.et0)})</small></dd></div>
        </dl>
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
        </div>` : ''}
      ${analysis.isRice
        ? html`<dl class="stats">
            <div><dt>Seepage</dt><dd>${formatNumber(p.seepageMmDay)} mm/day</dd></div>
            <div><dt>Refill / target / bund</dt><dd>${p.refillMm} / ${p.targetMm} / ${p.bundMm} mm</dd></div>
          </dl>
          <p>Each day: depth + rain + irrigation − crop water use − seepage, capped at the bund height. Rice counts 100% of rain.</p>`
        : html`<dl class="stats">
            <div><dt>Soil</dt><dd>${soilLabel(field.soilType)} (${p.awcMmPerM} mm/m)</dd></div>
            <div><dt>Root depth × p</dt><dd>${formatNumber(p.rootDepthM, 2)} m × ${formatNumber(p.p, 2)}</dd></div>
            <div><dt>TAW / RAW</dt><dd>${formatNumber(p.taw)} / ${formatNumber(p.raw)} mm</dd></div>
          </dl>
          <p>Each day: deficit + crop water use − 80% of rain − irrigation, kept between 0 and TAW.</p>`}
      <p>Crop water use = Kc × ET₀ (FAO-56). Kc depends on the growth stage. Weather: Open-Meteo. 1 cm of water on 1 ha = 100 m³.</p>
      <p>Status codes: IRRIGATE = water today. SKIP = water is needed, but the rain forecast for the next 2 days covers it.
         MONITOR = close to the limit. OK = enough water.</p>
      ${analysis.notes.length ? html`<ul>${analysis.notes.map(note => html`<li>${note}</li>`)}</ul>` : ''}
      <p class="muted">Course prototype using simplified FAO-56 defaults. Not professional agronomic advice.</p>
    </details>`;
}
