// #/fields/:id/records – add, edit and delete irrigation records and depth readings.

import { CROPS } from '../models/constants.js';
import { createRecord, updateRecord, deleteRecord, updateField } from '../api/mockApi.js';
import { loadFieldAnalysis } from '../services/fieldService.js';
import { recommendationForDate } from '../models/plan.js';
import { verdict } from '../models/compare.js';
import { validateRecord } from '../utils/validation.js';
import {
  cmToMm, mmToCm, pumpHoursToMm, mmToPumpHours, formatNumber, formatDate, formatWater, formatCm, formatHours,
} from '../utils/format.js';
import {
  html, setHTML, renderLoading, friendlyError, flashBanner, showFieldErrors, setBusy, numberValue, textValue,
} from '../utils/ui.js';
import { setFlash, takeFlash } from '../state.js';
import { isMockApiConfigured } from '../config.js';
import {
  setupNotice, pumpFlowRow, wireDrumHelper, waterUnitOptions, waterUnitHint, VERDICT_TEXT, VERDICT_CLASS,
} from './components.js';

export async function renderRecords(ctx, id) {
  const { container } = ctx;
  if (!isMockApiConfigured()) {
    setHTML(container, setupNotice());
    return;
  }

  renderLoading(container, 'Loading records…');
  const { field, records, analysis, weatherError, today } = await loadFieldAnalysis(id);
  if (!ctx.isCurrent()) return;

  const isRice = CROPS[field.cropType]?.model === 'rice';
  // Rice: pump hours once the pump flow is known, else cm. Upland: always pump hours.
  const defaultUnit = isRice && !field.pumpM3PerHour ? 'cm' : 'hours';
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));

  setHTML(container, html`
    <section class="view">
      <a class="back-link" href="#/fields/${field.id}">← ${field.name}</a>
      ${flashBanner(takeFlash())}
      <h1>Watering records</h1>
      <p class="meta">${field.name} · ${formatNumber(field.areaHa)} ha</p>

      <div class="card">
        <h2 data-form-title>What did you do?</h2>
        <form class="form" data-form="record" novalidate>
          <input type="hidden" name="editId" value="">
          <div class="form-grid">
            ${isRice ? html`
              <div class="form-row">
                <label for="r-type">Record</label>
                <select id="r-type" name="type">
                  <option value="irrigation">I added water</option>
                  <option value="depthReading">I measured the water depth</option>
                </select>
                <p class="error" data-error-for="type"></p>
              </div>` : html`<input type="hidden" name="type" value="irrigation">`}
            <div class="form-row">
              <label for="r-date">Date</label>
              <input id="r-date" name="date" type="date" value="${today}" min="${field.plantingDate}" max="${today}" required>
              <p class="error" data-error-for="date"></p>
            </div>
            <div class="form-row" data-show-for="irrigation">
              <label for="r-amount">How much water did you add?</label>
              <div class="search-row">
                <input id="r-amount" name="amount" type="number" step="any" min="0">
                <select name="unit" aria-label="Unit">
                  ${waterUnitOptions(isRice, defaultUnit)}
                </select>
              </div>
              <p class="hint">${waterUnitHint(isRice)}</p>
              <p class="hint" data-preview aria-live="polite"></p>
              <p class="error" data-error-for="amount"></p>
            </div>
            <div data-pump-row hidden>${pumpFlowRow('r', field.pumpM3PerHour)}</div>
            <div class="form-row" data-show-for="depthReading" hidden>
              <label for="r-depthCm">Water depth (cm)</label>
              <input id="r-depthCm" name="depthCm" type="number" step="0.1" min="0" max="30">
              <p class="error" data-error-for="depthCm"></p>
            </div>
          </div>
          <div class="form-row">
            <label for="r-note">Note <span class="muted">(optional)</span></label>
            <input id="r-note" name="note" type="text" maxlength="200" placeholder="e.g. Pump 3 hours">
            <p class="error" data-error-for="note"></p>
          </div>
          ${weatherError ? html`<p class="hint">Weather is unavailable, so the recommended amount can't be saved with this record.</p>` : ''}
          <p class="error form-error" role="alert"></p>
          <div class="actions">
            <button class="btn btn--primary" type="submit">Save</button>
            <button class="btn" type="button" data-action="cancel-edit" hidden>Cancel edit</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>Past records</h2>
        ${sorted.length === 0
          ? html`<p class="muted">No records yet.</p>`
          : html`
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th scope="col">Date</th><th scope="col">What</th><th scope="col" class="num">Amount</th>
                    <th scope="col" class="num">AquaPlan said</th><th scope="col">Result</th><th scope="col">Note</th>
                    <th scope="col"><span class="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  ${sorted.map(r => {
                    const isIrrigation = r.type === 'irrigation';
                    const v = isIrrigation ? verdict(r.amountMm, r.recommendedMm) : null;
                    return html`
                      <tr>
                        <th scope="row">${formatDate(r.date)}</th>
                        <td>${isIrrigation ? 'Added water' : 'Measured depth'}</td>
                        <td class="num">${isIrrigation ? formatWater(r.amountMm, field.areaHa) : `${formatNumber(mmToCm(r.depthMm))} cm`}</td>
                        <td class="num">${isIrrigation && r.recommendedMm != null ? formatCm(r.recommendedMm) : '–'}</td>
                        <td>${v ? html`<span class="badge badge--${VERDICT_CLASS[v] ?? 'muted'}">${VERDICT_TEXT[v] ?? v}</span>` : ''}</td>
                        <td>${r.note ?? ''}</td>
                        <td class="row-actions">
                          <button class="btn btn--sm" type="button" data-action="edit" data-id="${r.id}">Edit</button>
                          <button class="btn btn--sm btn--danger" type="button" data-action="delete" data-id="${r.id}">Delete</button>
                        </td>
                      </tr>`;
                  })}
                </tbody>
              </table>
            </div>`}
      </div>
    </section>`);

  const form = container.querySelector('form[data-form="record"]');
  const title = container.querySelector('[data-form-title]');
  const cancelButton = form.querySelector('[data-action="cancel-edit"]');
  const typeInput = form.elements.namedItem('type');
  const unitInput = form.elements.namedItem('unit');
  const pumpRow = form.querySelector('[data-pump-row]');
  const preview = form.querySelector('[data-preview]');

  const toMm = (amount, unit, pumpFlow) => (unit === 'hours' ? pumpHoursToMm(amount, pumpFlow, field.areaHa) : cmToMm(amount));

  // Show what the typed amount means on this field, e.g. "= 60 m³, 0.4 cm on this field".
  function updatePreview() {
    const amount = numberValue(form, 'amount');
    const pumpFlow = numberValue(form, 'pumpM3PerHour');
    const unit = unitInput.value;
    const ready = amount > 0 && (unit !== 'hours' || pumpFlow > 0);
    preview.textContent = ready ? `= ${formatWater(toMm(amount, unit, pumpFlow), field.areaHa)} on this field.` : '';
  }

  function showTypeFields() {
    const type = typeInput.value;
    form.querySelectorAll('[data-show-for]').forEach(el => { el.hidden = el.dataset.showFor !== type; });
    pumpRow.hidden = type !== 'irrigation' || unitInput.value !== 'hours';
    updatePreview();
  }
  typeInput.addEventListener('change', showTypeFields);
  unitInput.addEventListener('change', showTypeFields);
  form.addEventListener('input', updatePreview);
  wireDrumHelper(form);
  showTypeFields();

  function resetForm() {
    form.reset();
    form.elements.namedItem('editId').value = '';
    form.elements.namedItem('date').value = today;
    title.textContent = 'What did you do?';
    cancelButton.hidden = true;
    showFieldErrors(form, {});
    showTypeFields();
  }
  cancelButton.addEventListener('click', resetForm);

  // ---- Edit / delete buttons in the table ----
  container.querySelector('tbody')?.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const record = records.find(r => r.id === button.dataset.id);
    if (!record) return;

    if (button.dataset.action === 'edit') {
      form.elements.namedItem('editId').value = record.id;
      typeInput.value = record.type;
      form.elements.namedItem('date').value = record.date;
      // Show a saved amount (mm) in the field's unit: cm for rice, pump hours for upland.
      const pumpFlow = numberValue(form, 'pumpM3PerHour');
      let amount = '';
      if (record.amountMm != null) {
        if (isRice) amount = mmToCm(record.amountMm);
        else if (pumpFlow > 0) amount = Math.round(mmToPumpHours(record.amountMm, pumpFlow, field.areaHa) * 100) / 100;
      }
      form.elements.namedItem('amount').value = amount;
      unitInput.value = isRice ? 'cm' : 'hours';
      form.elements.namedItem('depthCm').value = record.depthMm == null ? '' : mmToCm(record.depthMm);
      form.elements.namedItem('note').value = record.note ?? '';
      title.textContent = `Edit record from ${formatDate(record.date)}`;
      cancelButton.hidden = false;
      showTypeFields();
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (button.dataset.action === 'delete') {
      if (!window.confirm(`Delete the record from ${formatDate(record.date)}?`)) return;
      setBusy(button, true, '…');
      try {
        await deleteRecord(record.id);
        setFlash('Record deleted.');
        await renderRecords(ctx, id);
      } catch (error) {
        setBusy(button, false);
        window.alert(`Could not delete: ${friendlyError(error)}`);
      }
    }
  });

  // ---- Save (create or update) ----
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const input = {
      type: typeInput.value,
      date: textValue(form, 'date'),
      amount: numberValue(form, 'amount'),
      unit: unitInput.value,
      pumpM3PerHour: numberValue(form, 'pumpM3PerHour'),
      depthCm: numberValue(form, 'depthCm'),
      note: textValue(form, 'note'),
    };
    const errors = validateRecord(input, field, today);
    showFieldErrors(form, errors);
    if (Object.keys(errors).length > 0) return;

    const editId = form.elements.namedItem('editId').value;
    const existing = records.find(r => r.id === editId);
    const isIrrigation = input.type === 'irrigation';
    const byPump = isIrrigation && input.unit === 'hours';

    // Snapshot of what the model recommended for that date. Keep the old snapshot if the date didn't change.
    let recommendedMm = null;
    if (isIrrigation) {
      recommendedMm = existing && existing.date === input.date && existing.recommendedMm != null
        ? existing.recommendedMm
        : recommendationForDate(analysis, input.date);
    }

    const record = {
      ...(existing ?? {}),
      fieldId: field.id,
      date: input.date,
      type: input.type,
      amountMm: isIrrigation ? toMm(input.amount, input.unit, input.pumpM3PerHour) : null,
      depthMm: isIrrigation ? null : cmToMm(input.depthCm),
      recommendedMm,
      // Keep the hours readable in the table, since the amount is saved in mm.
      note: byPump && !input.note ? `Pump ${formatHours(input.amount)}` : input.note,
    };

    const button = form.querySelector('button[type="submit"]');
    const formError = form.querySelector('.form-error');
    formError.textContent = '';
    setBusy(button, true);
    try {
      if (existing) await updateRecord(existing.id, record);
      else await createRecord(record);
      // Remember the pump flow on the field, so the farmer types it only once.
      if (byPump && input.pumpM3PerHour !== field.pumpM3PerHour) {
        await updateField(field.id, { ...field, pumpM3PerHour: input.pumpM3PerHour });
      }
      setFlash(existing ? 'Record updated.' : 'Record saved.');
      await renderRecords(ctx, id);
    } catch (error) {
      setBusy(button, false);
      formError.textContent = `Could not save: ${friendlyError(error)}`;
    }
  });
}
