// #/dashboard – all fields with today's status.

import { getFields, getAllRecords } from '../api/mockApi.js';
import { analyzeField } from '../services/fieldService.js';
import { seedDemoData } from '../services/demoData.js';
import { isMockApiConfigured, TIMEZONE } from '../config.js';
import { STATUS, FIELD_STATUS } from '../models/constants.js';
import { todayISO } from '../utils/date.js';
import { formatNumber } from '../utils/format.js';
import { html, setHTML, renderLoading, friendlyError, flashBanner, setBusy } from '../utils/ui.js';
import { takeFlash } from '../state.js';
import { cropLabel, fieldStatusSummary, setupNotice } from './components.js';

export async function renderDashboard(ctx) {
  const { container } = ctx;
  if (!isMockApiConfigured()) {
    setHTML(container, setupNotice());
    return;
  }

  renderLoading(container, 'Loading your fields…');
  const [fields, allRecords] = await Promise.all([getFields(), getAllRecords()]);
  if (!ctx.isCurrent()) return;

  const flash = takeFlash();

  if (fields.length === 0) {
    renderEmpty(ctx, flash);
    return;
  }

  setHTML(container, html`
    <section class="view">
      ${flashBanner(flash)}
      <div class="page-head">
        <div>
          <h1>Your fields</h1>
          <p class="meta" data-summary>${fields.length} field(s) · checking the weather…</p>
        </div>
        <div class="actions">
          <a class="btn btn--primary" href="#/fields/new">+ Add field</a>
        </div>
      </div>
      <ul class="card-grid">
        ${fields.map(field => html`
          <li>
            <a class="card field-card" href="#/fields/${field.id}">
              <h2 class="field-card__name">${field.name}</h2>
              <p class="meta">${cropLabel(field.cropType)} · ${formatNumber(field.areaHa)} ha</p>
              <p class="meta">Location: ${field.locationName}</p>
              <div class="field-card__status" data-status-for="${field.id}">
                <span class="spinner spinner--sm" aria-hidden="true"></span> <span class="muted">Checking weather…</span>
              </div>
            </a>
          </li>`)}
      </ul>
    </section>`);

  // Fill in each card's status as its weather arrives.
  const today = todayISO(TIMEZONE);
  const results = await Promise.allSettled(fields.map(async field => {
    const records = allRecords.filter(r => r.fieldId === field.id);
    const { analysis } = await analyzeField(field, records, today);
    if (!ctx.isCurrent()) return null;
    const slot = container.querySelector(`[data-status-for="${CSS.escape(field.id)}"]`);
    if (slot) setHTML(slot, fieldStatusSummary(field, analysis));
    return analysis;
  }));
  if (!ctx.isCurrent()) return;

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(result.reason);
      const slot = container.querySelector(`[data-status-for="${CSS.escape(fields[i].id)}"]`);
      if (slot) setHTML(slot, html`<span class="badge badge--muted">Weather unavailable</span> <span class="muted">${friendlyError(result.reason)}</span>`);
    }
  });

  const analyses = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
  const needWater = analyses.filter(a => a.fieldStatus === FIELD_STATUS.ACTIVE && a.todayEntry.status === STATUS.IRRIGATE).length;
  const summary = container.querySelector('[data-summary]');
  if (summary) {
    summary.textContent = `${fields.length} field(s) · ${needWater === 0 ? 'none need' : needWater === 1 ? '1 needs' : `${needWater} need`} water today`;
  }
}

function renderEmpty(ctx, flash) {
  const { container } = ctx;
  setHTML(container, html`
    <section class="view">
      ${flashBanner(flash)}
      <div class="state">
        <p class="state__icon" aria-hidden="true">🌾</p>
        <h1>No fields yet</h1>
        <p>Add your first field. AquaPlan will tell you when to water it and how much.</p>
        <div class="actions actions--center">
          <a class="btn btn--primary" href="#/fields/new">+ Add your first field</a>
          <button class="btn" type="button" data-action="demo">Load demo data</button>
        </div>
        <p class="error" data-demo-error></p>
      </div>
    </section>`);

  const button = container.querySelector('[data-action="demo"]');
  button.addEventListener('click', async () => {
    setBusy(button, true, 'Creating demo fields…');
    try {
      await seedDemoData();
      if (ctx.isCurrent()) await renderDashboard(ctx);
    } catch (error) {
      setBusy(button, false);
      container.querySelector('[data-demo-error]').textContent = friendlyError(error);
    }
  });
}
