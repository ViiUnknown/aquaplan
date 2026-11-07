// Watering records: #/fields/:id/records – add, edit and delete waterings and depth readings

import { CROPS } from '../models/constants.js';
import { createRecord, updateRecord, deleteRecord, updateField } from '../api/mockoon.js';
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
import {
  pumpFlowRow, wireDrumHelper, waterUnitOptions, waterUnitHint, VERDICT_TEXT, VERDICT_CLASS,
} from './components.js';

const NEW_RECORD_TITLE = 'What did you do?';

export async function renderRecords(ctx, id) {
  const { container } = ctx;
  renderLoading(container, 'Loading records…');
  const { field, records, analysis, weatherError, today } = await loadFieldAnalysis(id);
  if (!ctx.isCurrent()) return;

  const isRice = CROPS[field.cropType]?.model === 'rice';
  const newestFirst = [...records].sort((a, b) => b.date.localeCompare(a.date));

  setHTML(container, html`
    <section class="view">
      <a class="back-link" href="#/fields/${field.id}">← ${field.name}</a>
      ${flashBanner(takeFlash())}
      <h1>Watering records</h1>
      <p class="meta">${field.name} · ${formatNumber(field.areaHa)} ha</p>

      <div class="card">
        <h2 data-form-title>${NEW_RECORD_TITLE}</h2>
        ${recordForm(field, isRice, today, weatherError)}
      </div>

      <div class="card">
        <h2>Past records</h2>
        ${newestFirst.length === 0 ? html`<p class="muted">No records yet.</p>` : recordsTable(newestFirst, field)}
      </div>
    </section>`);

  const reload = () => renderRecords(ctx, id);
  const form = container.querySelector('form[data-form="record"]');
  const editor = setupRecordForm(form, { field, isRice, today, title: container.querySelector('[data-form-title]') });

  container.querySelector('tbody')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    const record = button && records.find(r => r.id === button.dataset.id);
    if (!record) return;
    if (button.dataset.action === 'edit') editor.edit(record);
    if (button.dataset.action === 'delete') removeRecord(record, button, reload);
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    saveRecord(form, { field, records, analysis, today }, reload);
  });
}

// ---------- page parts ----------

function recordForm(field, isRice, today, weatherError) {
  // Rice: pump hours once the pump flow is known, else cm. Upland: always pump hours.
  const defaultUnit = isRice && !field.pumpM3PerHour ? 'cm' : 'hours';

  const typeChoice = isRice
    ? html`
      <div class="form-row">
        <label for="r-type">Record</label>
        <select id="r-type" name="type">
          <option value="irrigation">I added water</option>
          <option value="depthReading">I measured the water depth</option>
        </select>
        <p class="error" data-error-for="type"></p>
      </div>`
    : html`<input type="hidden" name="type" value="irrigation">`;

  return html`
    <form class="form" data-form="record" novalidate>
      <input type="hidden" name="editId" value="">
      <div class="form-grid">
        ${typeChoice}
        <div class="form-row">
          <label for="r-date">Date</label>
          <input id="r-date" name="date" type="date" required
                 value="${today}" min="${field.plantingDate}" max="${today}">
          <p class="error" data-error-for="date"></p>
        </div>
        <div class="form-row" data-show-for="irrigation">
          <label for="r-amount">How much water did you add?</label>
          <div class="search-row">
            <input id="r-amount" name="amount" type="number" step="any" min="0">
            <select name="unit" aria-label="Unit">${waterUnitOptions(isRice, defaultUnit)}</select>
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
      ${weatherError
        ? html`<p class="hint">Weather is unavailable, so the recommended amount can't be saved with this record.</p>`
        : ''}
      <p class="error form-error" role="alert"></p>
      <div class="actions">
        <button class="btn btn--primary" type="submit">Save</button>
        <button class="btn" type="button" data-action="cancel-edit" hidden>Cancel edit</button>
      </div>
    </form>`;
}

function recordsTable(records, field) {
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">What</th>
            <th scope="col" class="num">Amount</th>
            <th scope="col" class="num">AquaPlan said</th>
            <th scope="col">Result</th>
            <th scope="col">Note</th>
            <th scope="col"><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>${records.map(record => recordRow(record, field))}</tbody>
      </table>
    </div>`;
}

function recordRow(r, field) {
  const isWatering = r.type === 'irrigation';
  const result = isWatering ? verdict(r.amountMm, r.recommendedMm) : null;
  return html`
    <tr>
      <th scope="row">${formatDate(r.date)}</th>
      <td>${isWatering ? 'Added water' : 'Measured depth'}</td>
      <td class="num">${isWatering ? formatWater(r.amountMm, field.areaHa) : `${formatNumber(mmToCm(r.depthMm))} cm`}</td>
      <td class="num">${isWatering && r.recommendedMm != null ? formatCm(r.recommendedMm) : '–'}</td>
      <td>${result
        ? html`<span class="badge badge--${VERDICT_CLASS[result] ?? 'muted'}">${VERDICT_TEXT[result] ?? result}</span>`
        : ''}</td>
      <td>${r.note ?? ''}</td>
      <td class="row-actions">
        <button class="btn btn--sm" type="button" data-action="edit" data-id="${r.id}">Edit</button>
        <button class="btn btn--sm btn--danger" type="button" data-action="delete" data-id="${r.id}">Delete</button>
      </td>
    </tr>`;
}

// ---------- form behaviour ----------

const amountToMm = (amount, unit, pumpFlow, areaHa) =>
  (unit === 'hours' ? pumpHoursToMm(amount, pumpFlow, areaHa) : cmToMm(amount));

/** Shows the right inputs for the record type, the live preview, and edit mode. Returns { edit(record) }. */
function setupRecordForm(form, { field, isRice, today, title }) {
  const typeInput = form.elements.namedItem('type');
  const unitInput = form.elements.namedItem('unit');
  const pumpRow = form.querySelector('[data-pump-row]');
  const preview = form.querySelector('[data-preview]');
  const cancelButton = form.querySelector('[data-action="cancel-edit"]');
  const setValue = (name, value) => { form.elements.namedItem(name).value = value; };

  // e.g. "= 60 m³ (0.4 cm) on this field."
  function updatePreview() {
    const amount = numberValue(form, 'amount');
    const pumpFlow = numberValue(form, 'pumpM3PerHour');
    const unit = unitInput.value;
    const ready = amount > 0 && (unit !== 'hours' || pumpFlow > 0);
    preview.textContent = ready
      ? `= ${formatWater(amountToMm(amount, unit, pumpFlow, field.areaHa), field.areaHa)} on this field.`
      : '';
  }

  function showInputsForType() {
    const type = typeInput.value;
    form.querySelectorAll('[data-show-for]').forEach(el => { el.hidden = el.dataset.showFor !== type; });
    pumpRow.hidden = type !== 'irrigation' || unitInput.value !== 'hours';
    updatePreview();
  }

  function reset() {
    form.reset();
    setValue('editId', '');
    setValue('date', today);
    title.textContent = NEW_RECORD_TITLE;
    cancelButton.hidden = true;
    showFieldErrors(form, {});
    showInputsForType();
  }

  // A saved amount (mm) is shown in the field's unit: cm for rice, pump hours for upland.
  function amountForEditing(record) {
    if (record.amountMm == null) return '';
    if (isRice) return mmToCm(record.amountMm);
    const pumpFlow = numberValue(form, 'pumpM3PerHour');
    return pumpFlow > 0 ? Math.round(mmToPumpHours(record.amountMm, pumpFlow, field.areaHa) * 100) / 100 : '';
  }

  function edit(record) {
    setValue('editId', record.id);
    typeInput.value = record.type;
    setValue('date', record.date);
    setValue('amount', amountForEditing(record));
    unitInput.value = isRice ? 'cm' : 'hours';
    setValue('depthCm', record.depthMm == null ? '' : mmToCm(record.depthMm));
    setValue('note', record.note ?? '');
    title.textContent = `Edit record from ${formatDate(record.date)}`;
    cancelButton.hidden = false;
    showInputsForType();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  typeInput.addEventListener('change', showInputsForType);
  unitInput.addEventListener('change', showInputsForType);
  form.addEventListener('input', updatePreview);
  cancelButton.addEventListener('click', reset);
  wireDrumHelper(form);
  showInputsForType();

  return { edit };
}

// ---------- save and delete ----------

async function removeRecord(record, button, reload) {
  if (!window.confirm(`Delete the record from ${formatDate(record.date)}?`)) return;
  setBusy(button, true, '…');
  try {
    await deleteRecord(record.id);
    setFlash('Record deleted.');
    await reload();
  } catch (error) {
    setBusy(button, false);
    window.alert(`Could not delete: ${friendlyError(error)}`);
  }
}

async function saveRecord(form, { field, records, analysis, today }, reload) {
  const input = {
    type: form.elements.namedItem('type').value,
    date: textValue(form, 'date'),
    amount: numberValue(form, 'amount'),
    unit: form.elements.namedItem('unit').value,
    pumpM3PerHour: numberValue(form, 'pumpM3PerHour'),
    depthCm: numberValue(form, 'depthCm'),
    note: textValue(form, 'note'),
  };
  const errors = validateRecord(input, field, today);
  showFieldErrors(form, errors);
  if (Object.keys(errors).length > 0) return;

  const existing = records.find(r => r.id === form.elements.namedItem('editId').value);
  const isWatering = input.type === 'irrigation';
  const byPump = isWatering && input.unit === 'hours';

  // Save what AquaPlan advised for that date. An edit that keeps the date keeps the old advice.
  let recommendedMm = null;
  if (isWatering) {
    const keepOld = existing && existing.date === input.date && existing.recommendedMm != null;
    recommendedMm = keepOld ? existing.recommendedMm : recommendationForDate(analysis, input.date);
  }

  const record = {
    ...(existing ?? {}),
    fieldId: field.id,
    date: input.date,
    type: input.type,
    amountMm: isWatering ? amountToMm(input.amount, input.unit, input.pumpM3PerHour, field.areaHa) : null,
    depthMm: isWatering ? null : cmToMm(input.depthCm),
    recommendedMm,
    // The amount is stored in mm, so keep the pump hours readable in the note.
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
    await reload();
  } catch (error) {
    setBusy(button, false);
    formError.textContent = `Could not save: ${friendlyError(error)}`;
  }
}
