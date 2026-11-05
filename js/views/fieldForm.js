// #/fields/new and #/fields/:id/edit – create or edit a field.

import { CROPS, SOILS, RICE_DEFAULTS } from '../models/constants.js';
import { getField, createField, updateField } from '../api/mockApi.js';
import { geocode } from '../api/openMeteo.js';
import { reverseGeocode, coordinateLabel } from '../api/nominatim.js';
import { validateField } from '../utils/validation.js';
import { todayISO, addDays } from '../utils/date.js';
import { cmToMm, mmToCm, pumpHoursToMm, mmToPumpHours } from '../utils/format.js';
import {
  html, setHTML, renderLoading, friendlyError, showFieldErrors, setBusy, numberValue, textValue,
} from '../utils/ui.js';
import { setFlash } from '../state.js';
import { isMockApiConfigured, TIMEZONE } from '../config.js';
import {
  setupNotice, pumpFlowRow, wireDrumHelper, waterUnitOptions, waterUnitHint,
} from './components.js';

/** One labelled form row with a hint and an error slot. */
function row(name, label, control, hint = '') {
  return html`
    <div class="form-row">
      <label for="f-${name}">${label}</label>
      ${control}
      ${hint ? html`<p class="hint">${hint}</p>` : ''}
      <p class="error" data-error-for="${name}"></p>
    </div>`;
}

const valueOf = v => (v === null || v === undefined ? '' : v);

const CAMBODIA_CENTER = [12.6, 104.9];
const round4 = n => Math.round(n * 10000) / 10000;
const cmOf = mm => (mm === null || mm === undefined ? '' : mmToCm(mm));

// How a farmer recognises each soil.
const SOIL_HINTS = {
  sand: 'very sandy, water drains away fast',
  sandyLoam: 'sandy, drains fast',
  loam: 'soft and crumbly, holds water well',
  clayLoam: 'a little sticky, holds water well',
  clay: 'sticky when wet, holds a lot of water',
};

export async function renderFieldForm(ctx, id = null) {
  const { container } = ctx;
  if (!isMockApiConfigured()) {
    setHTML(container, setupNotice());
    return;
  }

  let field = null;
  if (id) {
    renderLoading(container, 'Loading field…');
    field = await getField(id);
    if (!ctx.isCurrent()) return;
  }

  const isEdit = Boolean(field);
  const today = todayISO(TIMEZONE);
  const v = field ?? { cropType: '', plantingDate: today, soilType: '', ...RICE_DEFAULTS };
  const backHref = isEdit ? `#/fields/${field.id}` : '#/dashboard';

  setHTML(container, html`
    <section class="view view--narrow">
      <a class="back-link" href="${backHref}">← Back</a>
      <h1>${isEdit ? `Edit ${field.name}` : 'Add a field'}</h1>

      <form class="card form" novalidate>
        <fieldset>
          <legend>Basics</legend>
          ${row('name', 'Field name', html`<input id="f-name" name="name" type="text" maxlength="50" required value="${valueOf(v.name)}" placeholder="e.g. North paddy">`)}
          ${row('cropType', 'Crop', html`
            <select id="f-cropType" name="cropType" required>
              <option value="">Choose a crop…</option>
              ${Object.entries(CROPS).map(([key, crop]) => html`<option value="${key}" ${v.cropType === key ? 'selected' : ''}>${crop.label}</option>`)}
            </select>`)}
          <div class="form-grid">
            ${row('plantingDate', 'Planting date', html`<input id="f-plantingDate" name="plantingDate" type="date" required max="${addDays(today, 30)}" value="${valueOf(v.plantingDate)}">`)}
            ${row('areaHa', 'Area (hectares)', html`<input id="f-areaHa" name="areaHa" type="number" step="any" min="0.01" max="1000" required value="${valueOf(v.areaHa)}" placeholder="e.g. 1.5">`)}
          </div>
          ${row('soilType', 'Soil type', html`
            <select id="f-soilType" name="soilType">
              <option value="">Choose a soil…</option>
              ${Object.entries(SOILS).map(([key, soil]) => html`<option value="${key}" ${v.soilType === key ? 'selected' : ''}>${soil.label}: ${SOIL_HINTS[key]}</option>`)}
            </select>`, 'Needed for maize, soybean and cassava. Not sure? Choose Loam.')}
        </fieldset>

        <fieldset>
          <legend>Where is the field?</legend>
          <p class="hint">Tap your field on the map. Drag the pin to move it. Zoom in for more detail.</p>
          <div class="map" data-map></div>
          <div class="map-bar">
            <p class="loc-selected" aria-live="polite"></p>
            <button class="btn btn--sm" type="button" data-action="locate">📍 Use my location</button>
          </div>
          <p class="error" data-error-for="location"></p>
          <div class="form-row">
            <label for="f-locationQuery">Can't find it? Search for a town to move the map</label>
            <div class="search-row">
              <input id="f-locationQuery" name="locationQuery" type="search" placeholder="e.g. Battambang" autocomplete="off">
              <button class="btn" type="button" data-action="search">Search</button>
            </div>
            <div class="loc-results" aria-live="polite"></div>
          </div>
        </fieldset>

        <fieldset data-section="upland" hidden>
          <details class="advanced">
          <summary>Advanced soil settings <span class="muted">(optional, the defaults work for most fields)</span></summary>
          <div class="form-grid">
            ${row('rootDepthM', 'Root depth (m)', html`<input id="f-rootDepthM" name="rootDepthM" type="number" step="any" min="0.1" max="2" value="${valueOf(v.rootDepthM)}">`, 'Leave blank to use the crop default.')}
            ${row('p', 'Depletion fraction p', html`<input id="f-p" name="p" type="number" step="any" min="0.1" max="0.9" value="${valueOf(v.p)}">`, 'Share of soil water the crop can use before stress.')}
          </div>
          </details>
        </fieldset>

        <fieldset data-section="rice" hidden>
          <details class="advanced">
          <summary>Advanced paddy settings <span class="muted">(optional, the defaults work for most paddies)</span></summary>
          <div class="form-grid">
            ${row('targetMm', 'Fill the paddy up to (cm)', html`<input id="f-targetMm" name="targetMm" type="number" step="any" min="0.1" value="${cmOf(v.targetMm ?? RICE_DEFAULTS.targetMm)}">`)}
            ${row('refillMm', 'Add water when it drops to (cm)', html`<input id="f-refillMm" name="refillMm" type="number" step="any" min="0" value="${cmOf(v.refillMm ?? RICE_DEFAULTS.refillMm)}">`, '0 = when the soil surface starts to show.')}
            ${row('bundMm', 'Height of the field wall (bund) (cm)', html`<input id="f-bundMm" name="bundMm" type="number" step="any" min="0.1" max="30" value="${cmOf(v.bundMm ?? RICE_DEFAULTS.bundMm)}">`, 'Rain above this level runs off.')}
            ${row('seepageMmDay', 'Water lost into the ground (mm/day)', html`<input id="f-seepageMmDay" name="seepageMmDay" type="number" step="any" min="2" max="6" value="${valueOf(v.seepageMmDay ?? RICE_DEFAULTS.seepageMmDay)}">`, '2 = clay that holds water, 6 = sandy soil.')}
          </div>
          </details>
        </fieldset>

        <fieldset>
          <legend>How do you water? <span class="muted">(optional)</span></legend>
          <p class="hint">With your pump's flow, AquaPlan tells you how long to run the pump. With your habit, it shows how much water you could save.</p>
          ${pumpFlowRow('f', v.pumpM3PerHour)}
          <div class="form-grid">
            <div class="form-row">
              <label for="f-usualAmountMm">Water added each time</label>
              <div class="search-row">
                <input id="f-usualAmountMm" name="usualAmountMm" type="number" step="any" min="0" placeholder="e.g. 3">
                <select name="usualUnit" aria-label="Unit"></select>
              </div>
              <p class="hint" data-usual-hint></p>
              <p class="error" data-error-for="usualAmountMm"></p>
            </div>
            ${row('usualIntervalDays', 'Usually every … days', html`<input id="f-usualIntervalDays" name="usualIntervalDays" type="number" step="1" min="1" max="60" value="${valueOf(v.usualIntervalDays)}">`)}
          </div>
        </fieldset>

        <p class="error form-error" role="alert"></p>
        <div class="actions">
          <button class="btn btn--primary" type="submit">${isEdit ? 'Save changes' : 'Create field'}</button>
          <a class="btn" href="${backHref}">Cancel</a>
        </div>
      </form>
    </section>`);

  const form = container.querySelector('form');
  const cropSelect = form.elements.namedItem('cropType');
  const resultsBox = form.querySelector('.loc-results');
  const selectedBox = form.querySelector('.loc-selected');
  let selectedLocation = field ? { label: field.locationName, lat: field.lat, lon: field.lon } : null;
  let lastResults = [];

  // ---- Show the right settings for the chosen crop ----
  function updateSections() {
    const crop = CROPS[cropSelect.value];
    const isRice = crop?.model === 'rice';
    form.querySelector('[data-section="rice"]').hidden = !isRice;
    form.querySelector('[data-section="upland"]').hidden = !crop || isRice;
    if (crop && !isRice) {
      form.elements.namedItem('rootDepthM').placeholder = `Default: ${crop.rootDepthM}`;
      form.elements.namedItem('p').placeholder = `Default: ${crop.p}`;
    }
  }
  cropSelect.addEventListener('change', updateSections);
  updateSections();
  wireDrumHelper(form);

  // ---- "Water added each time": rice in cm or pump hours, upland in pump hours only ----
  const usualInput = form.elements.namedItem('usualAmountMm');
  const usualUnit = form.elements.namedItem('usualUnit');
  const usualHint = form.querySelector('[data-usual-hint]');
  const pumpInput = form.elements.namedItem('pumpM3PerHour');
  // The saved amount in mm. Kept while it can't be shown (upland field with no pump flow yet).
  let usualMmKept = v.usualAmountMm ?? null;

  /** Show `usualMmKept` in the current unit, or leave the box empty if it can't be converted yet. */
  function showUsual() {
    if (usualMmKept == null) return;
    const pump = numberValue(form, 'pumpM3PerHour');
    const area = numberValue(form, 'areaHa');
    if (usualUnit.value === 'cm') usualInput.value = mmToCm(usualMmKept);
    else if (pump > 0 && area > 0) usualInput.value = Math.round(mmToPumpHours(usualMmKept, pump, area) * 100) / 100;
    else usualInput.value = '';
  }

  function updateUsualUnits() {
    const isRice = CROPS[cropSelect.value]?.model === 'rice';
    setHTML(usualUnit, waterUnitOptions(isRice, isRice ? 'cm' : 'hours'));   // rice starts in cm, upland in hours
    usualHint.textContent = waterUnitHint(isRice);
    showUsual();
  }

  // Typing changes the habit, so stop keeping the old saved value.
  usualInput.addEventListener('input', () => { usualMmKept = null; });
  usualUnit.addEventListener('change', showUsual);
  pumpInput.addEventListener('input', () => { if (usualInput.value === '') showUsual(); });
  cropSelect.addEventListener('change', updateUsualUnits);
  updateUsualUnits();

  // ---- Location: pick on the map (Leaflet + OpenStreetMap) ----
  const locationError = form.querySelector('[data-error-for="location"]');

  function showSelected() {
    if (!selectedLocation) {
      setHTML(selectedBox, html`<span class="muted">No location chosen yet. Tap the map.</span>`);
    } else if (selectedLocation.pending) {
      setHTML(selectedBox, html`📍 <span class="muted"><span class="spinner spinner--sm" aria-hidden="true"></span> Finding the place name…</span>`);
    } else {
      setHTML(selectedBox, html`📍 <strong>${selectedLocation.label}</strong> <span class="muted">(${coordinateLabel(selectedLocation.lat, selectedLocation.lon)})</span>`);
    }
  }
  showSelected();

  let map = null;
  let marker = null;
  let pickId = 0;   // ignore slow place-name answers for an older click

  function placeMarker(lat, lon) {
    if (!map) return;
    if (marker) {
      marker.setLatLng([lat, lon]);
      return;
    }
    marker = window.L.marker([lat, lon], { draggable: true, title: 'Your field' }).addTo(map);
    marker.on('dragend', () => {
      const point = marker.getLatLng();
      pickPoint(point.lat, point.lng);
    });
  }

  async function pickPoint(lat, lon) {
    lat = round4(lat);
    lon = round4(lon);
    placeMarker(lat, lon);
    const id = ++pickId;
    selectedLocation = { label: coordinateLabel(lat, lon), lat, lon, pending: true };
    locationError.textContent = '';
    showSelected();
    let label;
    try {
      label = await reverseGeocode(lat, lon);
    } catch {
      label = coordinateLabel(lat, lon);   // no name, but the coordinates are all the weather needs
    }
    if (id !== pickId) return;
    selectedLocation = { label, lat, lon };
    showSelected();
  }

  function initMap() {
    const box = form.querySelector('[data-map]');
    if (!window.L) {
      box.classList.add('map--off');
      setHTML(box, html`<p class="muted">The map could not load (no internet?). Use the search below instead.</p>`);
      return;
    }
    const start = selectedLocation ? [selectedLocation.lat, selectedLocation.lon] : CAMBODIA_CENTER;
    map = window.L.map(box).setView(start, selectedLocation ? 13 : 7);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    if (selectedLocation) placeMarker(selectedLocation.lat, selectedLocation.lon);
    map.on('click', event => pickPoint(event.latlng.lat, event.latlng.lng));
    // Leaflet keeps a window listener; free the map when the user leaves this page.
    window.addEventListener('hashchange', () => map.remove(), { once: true });
  }
  initMap();

  const locateButton = form.querySelector('[data-action="locate"]');
  if (!navigator.geolocation || !map) locateButton.hidden = true;
  locateButton.addEventListener('click', () => {
    setBusy(locateButton, true, 'Finding you…');
    navigator.geolocation.getCurrentPosition(
      position => {
        setBusy(locateButton, false);
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], 15);
        pickPoint(latitude, longitude);
      },
      () => {
        setBusy(locateButton, false);
        locationError.textContent = 'Could not get your location. Tap the map instead.';
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });

  // ---- Location: search moves the map ----

  async function search() {
    const query = textValue(form, 'locationQuery');
    if (query.length < 2) {
      setHTML(resultsBox, html`<p class="error">Type at least 2 letters.</p>`);
      return;
    }
    setHTML(resultsBox, html`<p class="muted"><span class="spinner spinner--sm" aria-hidden="true"></span> Searching…</p>`);
    try {
      lastResults = await geocode(query);
      if (lastResults.length === 0) {
        setHTML(resultsBox, html`<p class="muted">No places found. Try another spelling.</p>`);
        return;
      }
      setHTML(resultsBox, html`
        <ul class="loc-list">
          ${lastResults.map((place, i) => html`<li><button class="loc-option" type="button" data-index="${i}">${place.label}</button></li>`)}
        </ul>`);
    } catch (error) {
      setHTML(resultsBox, html`<p class="error">${friendlyError(error)}</p>`);
    }
  }

  form.querySelector('[data-action="search"]').addEventListener('click', search);
  form.elements.namedItem('locationQuery').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();   // search instead of submitting the form
      search();
    }
  });
  resultsBox.addEventListener('click', event => {
    const option = event.target.closest('.loc-option');
    if (!option) return;
    const place = lastResults[Number(option.dataset.index)];
    pickId++;   // a search result replaces any place name still loading
    selectedLocation = { label: place.label, lat: round4(place.lat), lon: round4(place.lon) };
    setHTML(resultsBox, '');
    if (map) {
      map.setView([place.lat, place.lon], 13);
      placeMarker(selectedLocation.lat, selectedLocation.lon);
    }
    showSelected();
    locationError.textContent = '';
  });

  // ---- Save ----
  function collect() {
    const isRice = CROPS[cropSelect.value]?.model === 'rice';
    const riceValue = (name, fallback) => (isRice ? (numberValue(form, name) ?? fallback) : null);
    const cmToMmOrNull = cm => (cm == null ? null : cmToMm(cm));
    // Depths are typed in cm but stored in mm.
    const riceCm = (name, fallbackMm) => (isRice ? (cmToMmOrNull(numberValue(form, name)) ?? fallbackMm) : null);
    // The usual amount can be typed as pump hours; it is stored in mm like everything else.
    const usual = numberValue(form, 'usualAmountMm');
    const pump = numberValue(form, 'pumpM3PerHour');
    const area = numberValue(form, 'areaHa');
    let usualMm;
    if (usual == null) usualMm = usualMmKept;   // nothing typed: keep the saved habit
    else if (form.elements.namedItem('usualUnit').value === 'cm') usualMm = cmToMm(usual);
    else usualMm = pump > 0 && area > 0 ? pumpHoursToMm(usual, pump, area) : null;
    return {
      name: textValue(form, 'name'),
      cropType: cropSelect.value,
      plantingDate: textValue(form, 'plantingDate'),
      areaHa: numberValue(form, 'areaHa'),
      soilType: textValue(form, 'soilType') || null,
      locationName: selectedLocation?.label ?? '',
      lat: selectedLocation?.lat ?? null,
      lon: selectedLocation?.lon ?? null,
      usualAmountMm: usualMm,
      pumpM3PerHour: pump,
      usualIntervalDays: numberValue(form, 'usualIntervalDays'),
      rootDepthM: isRice ? null : numberValue(form, 'rootDepthM'),
      p: isRice ? null : numberValue(form, 'p'),
      seepageMmDay: riceValue('seepageMmDay', RICE_DEFAULTS.seepageMmDay),
      refillMm: riceCm('refillMm', RICE_DEFAULTS.refillMm),
      targetMm: riceCm('targetMm', RICE_DEFAULTS.targetMm),
      bundMm: riceCm('bundMm', RICE_DEFAULTS.bundMm),
    };
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = collect();
    const errors = validateField(data, todayISO(TIMEZONE));
    if (form.elements.namedItem('usualUnit').value === 'hours' && numberValue(form, 'usualAmountMm') != null
      && data.pumpM3PerHour == null) {
      errors.pumpM3PerHour = 'Enter your pump flow to use hours of pumping.';
    }
    showFieldErrors(form, errors);
    // Open the "Advanced" box if one of its inputs has an error, so the message is visible.
    form.querySelectorAll('details.advanced').forEach(box => {
      if ([...box.querySelectorAll('[data-error-for]')].some(el => el.textContent)) box.open = true;
    });
    if (Object.keys(errors).length > 0) return;

    const button = form.querySelector('button[type="submit"]');
    const formError = form.querySelector('.form-error');
    formError.textContent = '';
    setBusy(button, true);
    try {
      const saved = isEdit
        ? await updateField(field.id, { ...field, ...data })
        : await createField(data);
      setFlash(isEdit ? 'Field updated.' : 'Field created.');
      window.location.hash = `#/fields/${saved.id}`;
    } catch (error) {
      setBusy(button, false);
      formError.textContent = `Could not save: ${friendlyError(error)}`;
    }
  });
}
