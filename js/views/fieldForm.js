// Add or edit a field: #/fields/new and #/fields/:id/edit

import { CROPS, SOILS, RICE_DEFAULTS } from '../models/constants.js';
import { getField, createField, updateField } from '../api/mockoon.js';
import { currentUser, assertCanAccessField } from '../auth.js';
import { geocode } from '../api/openMeteo.js';
import { reverseGeocode, coordinateLabel } from '../api/nominatim.js';
import { validateField } from '../utils/validation.js';
import { todayISO, addDays } from '../utils/date.js';
import { cmToMm, mmToCm, pumpHoursToMm, mmToPumpHours } from '../utils/format.js';
import {
  html, setHTML, renderLoading, friendlyError, showFieldErrors, setBusy, numberValue, textValue,
} from '../utils/ui.js';
import { setFlash } from '../state.js';
import { TIMEZONE } from '../config.js';
import { pumpFlowRow, wireDrumHelper, waterUnitOptions, waterUnitHint } from './components.js';

const CAMBODIA_CENTER = [12.6, 104.9];

const SOIL_HINTS = {
  sand: 'very sandy, water drains away fast',
  sandyLoam: 'sandy, drains fast',
  loam: 'soft and crumbly, holds water well',
  clayLoam: 'a little sticky, holds water well',
  clay: 'sticky when wet, holds a lot of water',
};

const blank = value => value ?? '';
const cmOf = mm => (mm == null ? '' : mmToCm(mm));
const round4 = n => Math.round(n * 10000) / 10000;
const isRiceCrop = cropKey => CROPS[cropKey]?.model === 'rice';

export async function renderFieldForm(ctx, id = null) {
  const { container } = ctx;
  let field = null;
  if (id) {
    renderLoading(container, 'Loading field…');
    field = await getField(id);
    assertCanAccessField(field);
    if (!ctx.isCurrent()) return;
  }

  const today = todayISO(TIMEZONE);
  const values = field ?? { cropType: '', plantingDate: today, soilType: '', ...RICE_DEFAULTS };
  const backHref = field ? `#/fields/${field.id}` : '#/dashboard';

  setHTML(container, html`
    <section class="view view--narrow">
      <a class="back-link" href="${backHref}">← Back</a>
      <h1>${field ? `Edit ${field.name}` : 'Add a field'}</h1>

      <form class="card form" novalidate>
        ${basicsSection(values, today)}
        ${locationSection()}
        ${uplandSection(values)}
        ${riceSection(values)}
        ${wateringSection(values)}

        <p class="error form-error" role="alert"></p>
        <div class="actions">
          <button class="btn btn--primary" type="submit">${field ? 'Save changes' : 'Create field'}</button>
          <a class="btn" href="${backHref}">Cancel</a>
        </div>
      </form>
    </section>`);

  const form = container.querySelector('form');
  setupCropSections(form);
  wireDrumHelper(form);
  const usualAmount = setupUsualAmount(form, values.usualAmountMm);
  const location = setupLocationPicker(form, field);

  form.addEventListener('submit', event => {
    event.preventDefault();
    saveField(form, field, { usualMm: usualAmount.mm(), location: location.selected() });
  });
}

// ---------- form sections ----------

function row(name, label, control, hint = '') {
  return html`
    <div class="form-row">
      <label for="f-${name}">${label}</label>
      ${control}
      ${hint ? html`<p class="hint">${hint}</p>` : ''}
      <p class="error" data-error-for="${name}"></p>
    </div>`;
}

function basicsSection(v, today) {
  const cropOptions = Object.entries(CROPS).map(([key, crop]) => html`
    <option value="${key}" ${v.cropType === key ? 'selected' : ''}>${crop.label}</option>`);
  const soilOptions = Object.entries(SOILS).map(([key, soil]) => html`
    <option value="${key}" ${v.soilType === key ? 'selected' : ''}>${soil.label}: ${SOIL_HINTS[key]}</option>`);

  return html`
    <fieldset>
      <legend>Basics</legend>
      ${row('name', 'Field name', html`
        <input id="f-name" name="name" type="text" maxlength="50" required
               value="${blank(v.name)}" placeholder="e.g. North paddy">`)}
      ${row('cropType', 'Crop', html`
        <select id="f-cropType" name="cropType" required>
          <option value="">Choose a crop…</option>
          ${cropOptions}
        </select>`)}
      <div class="form-grid">
        ${row('plantingDate', 'Planting date', html`
          <input id="f-plantingDate" name="plantingDate" type="date" required
                 max="${addDays(today, 30)}" value="${blank(v.plantingDate)}">`)}
        ${row('areaHa', 'Area (hectares)', html`
          <input id="f-areaHa" name="areaHa" type="number" step="any" min="0.01" max="1000" required
                 value="${blank(v.areaHa)}" placeholder="e.g. 1.5">`)}
      </div>
      ${row('soilType', 'Soil type', html`
        <select id="f-soilType" name="soilType">
          <option value="">Choose a soil…</option>
          ${soilOptions}
        </select>`, 'Needed for maize, soybean and cassava. Not sure? Choose Loam.')}
    </fieldset>`;
}

function locationSection() {
  return html`
    <fieldset>
      <legend>Where is the field?</legend>
      <p class="hint">Tap your field on the map. Drag the pin to move it. Zoom in for more detail.</p>
      <div class="map" data-map></div>
      <div class="map-bar">
        <p class="loc-selected" aria-live="polite"></p>
        <button class="btn btn--sm" type="button" data-action="locate">Use my location</button>
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
    </fieldset>`;
}

function uplandSection(v) {
  return html`
    <fieldset data-section="upland" hidden>
      <details class="advanced">
        <summary>Advanced soil settings <span class="muted">(optional, the defaults work for most fields)</span></summary>
        <div class="form-grid">
          ${row('rootDepthM', 'Root depth (m)', html`
            <input id="f-rootDepthM" name="rootDepthM" type="number" step="any" min="0.1" max="2"
                   value="${blank(v.rootDepthM)}">`, 'Leave blank to use the crop default.')}
          ${row('p', 'Depletion fraction p', html`
            <input id="f-p" name="p" type="number" step="any" min="0.1" max="0.9"
                   value="${blank(v.p)}">`, 'Share of soil water the crop can use before stress.')}
        </div>
      </details>
    </fieldset>`;
}

function riceSection(v) {
  return html`
    <fieldset data-section="rice" hidden>
      <details class="advanced">
        <summary>Advanced paddy settings <span class="muted">(optional, the defaults work for most paddies)</span></summary>
        <div class="form-grid">
          ${row('targetMm', 'Fill the paddy up to (cm)', html`
            <input id="f-targetMm" name="targetMm" type="number" step="any" min="0.1"
                   value="${cmOf(v.targetMm ?? RICE_DEFAULTS.targetMm)}">`)}
          ${row('refillMm', 'Add water when it drops to (cm)', html`
            <input id="f-refillMm" name="refillMm" type="number" step="any" min="0"
                   value="${cmOf(v.refillMm ?? RICE_DEFAULTS.refillMm)}">`, '0 = when the soil surface starts to show.')}
          ${row('bundMm', 'Height of the field wall (bund) (cm)', html`
            <input id="f-bundMm" name="bundMm" type="number" step="any" min="0.1" max="30"
                   value="${cmOf(v.bundMm ?? RICE_DEFAULTS.bundMm)}">`, 'Rain above this level runs off.')}
          ${row('seepageMmDay', 'Water lost into the ground (mm/day)', html`
            <input id="f-seepageMmDay" name="seepageMmDay" type="number" step="any" min="2" max="6"
                   value="${blank(v.seepageMmDay ?? RICE_DEFAULTS.seepageMmDay)}">`, '2 = clay that holds water, 6 = sandy soil.')}
        </div>
      </details>
    </fieldset>`;
}

function wateringSection(v) {
  return html`
    <fieldset>
      <legend>How do you water? <span class="muted">(optional)</span></legend>
      <p class="hint">
        With your pump's flow, AquaPlan tells you how long to run the pump.
        With your habit, it shows how much water you could save.
      </p>
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
        ${row('usualIntervalDays', 'Usually every … days', html`
          <input id="f-usualIntervalDays" name="usualIntervalDays" type="number" step="1" min="1" max="60"
                 value="${blank(v.usualIntervalDays)}">`)}
      </div>
    </fieldset>`;
}

// ---------- behaviour ----------

/** Show the rice or the upland settings for the chosen crop. */
function setupCropSections(form) {
  const cropSelect = form.elements.namedItem('cropType');

  function update() {
    const crop = CROPS[cropSelect.value];
    const isRice = crop?.model === 'rice';
    form.querySelector('[data-section="rice"]').hidden = !isRice;
    form.querySelector('[data-section="upland"]').hidden = !crop || isRice;
    if (crop && !isRice) {
      form.elements.namedItem('rootDepthM').placeholder = `Default: ${crop.rootDepthM}`;
      form.elements.namedItem('p').placeholder = `Default: ${crop.p}`;
    }
  }

  cropSelect.addEventListener('change', update);
  update();
}

/**
 * "Water added each time": rice in cm or pump hours, upland in pump hours only.
 * Returns { mm() } with the amount to save, in mm.
 */
function setupUsualAmount(form, savedMm) {
  const cropSelect = form.elements.namedItem('cropType');
  const input = form.elements.namedItem('usualAmountMm');
  const unit = form.elements.namedItem('usualUnit');
  const hint = form.querySelector('[data-usual-hint]');

  // The saved habit is kept until the farmer types a new one. An upland field without a pump
  // flow can't show it in hours, but it must not be lost on save.
  let keptMm = savedMm ?? null;

  const pumpAndArea = () => [numberValue(form, 'pumpM3PerHour'), numberValue(form, 'areaHa')];

  function showKept() {
    if (keptMm == null) return;
    const [pump, area] = pumpAndArea();
    if (unit.value === 'cm') input.value = mmToCm(keptMm);
    else if (pump > 0 && area > 0) input.value = Math.round(mmToPumpHours(keptMm, pump, area) * 100) / 100;
    else input.value = '';
  }

  function updateUnits() {
    const isRice = isRiceCrop(cropSelect.value);
    setHTML(unit, waterUnitOptions(isRice, isRice ? 'cm' : 'hours'));
    hint.textContent = waterUnitHint(isRice);
    showKept();
  }

  input.addEventListener('input', () => { keptMm = null; });
  unit.addEventListener('change', showKept);
  form.elements.namedItem('pumpM3PerHour').addEventListener('input', () => {
    if (input.value === '') showKept();
  });
  cropSelect.addEventListener('change', updateUnits);
  updateUnits();

  return {
    mm() {
      const typed = numberValue(form, 'usualAmountMm');
      if (typed == null) return keptMm;
      if (unit.value === 'cm') return cmToMm(typed);
      const [pump, area] = pumpAndArea();
      return pump > 0 && area > 0 ? pumpHoursToMm(typed, pump, area) : null;
    },
  };
}

/**
 * Map (Leaflet + OpenStreetMap), "Use my location" and town search.
 * Returns { selected() } with { label, lat, lon } or null.
 */
function setupLocationPicker(form, field) {
  const selectedBox = form.querySelector('.loc-selected');
  const resultsBox = form.querySelector('.loc-results');
  const errorBox = form.querySelector('[data-error-for="location"]');
  const locateButton = form.querySelector('[data-action="locate"]');

  let selected = field ? { label: field.locationName, lat: field.lat, lon: field.lon } : null;
  let searchResults = [];
  let map = null;
  let marker = null;
  let pickId = 0;   // a slow place-name answer for an older tap is ignored

  function showSelected() {
    if (!selected) {
      setHTML(selectedBox, html`<span class="muted">No location chosen yet. Tap the map.</span>`);
    } else if (selected.pending) {
      setHTML(selectedBox, html`
        Location: <span class="muted"><span class="spinner spinner--sm" aria-hidden="true"></span> Finding the place name…</span>`);
    } else {
      setHTML(selectedBox, html`
        Location: <strong>${selected.label}</strong>
        <span class="muted">(${coordinateLabel(selected.lat, selected.lon)})</span>`);
    }
  }

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
    selected = { label: coordinateLabel(lat, lon), lat, lon, pending: true };
    errorBox.textContent = '';
    showSelected();

    let label;
    try {
      label = await reverseGeocode(lat, lon);
    } catch {
      label = coordinateLabel(lat, lon);   // the weather only needs the coordinates
    }
    if (id !== pickId) return;
    selected = { label, lat, lon };
    showSelected();
  }

  function createMap() {
    const box = form.querySelector('[data-map]');
    if (!window.L) {
      box.classList.add('map--off');
      setHTML(box, html`<p class="muted">The map could not load (no internet?). Use the search below instead.</p>`);
      return;
    }
    const start = selected ? [selected.lat, selected.lon] : CAMBODIA_CENTER;
    map = window.L.map(box).setView(start, selected ? 13 : 7);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    if (selected) placeMarker(selected.lat, selected.lon);
    map.on('click', event => pickPoint(event.latlng.lat, event.latlng.lng));
    // Leaflet keeps a window listener, so free the map when the page changes.
    window.addEventListener('hashchange', () => map.remove(), { once: true });
  }

  function useMyLocation() {
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
        errorBox.textContent = 'Could not get your location. Tap the map instead.';
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function search() {
    const query = textValue(form, 'locationQuery');
    if (query.length < 2) {
      setHTML(resultsBox, html`<p class="error">Type at least 2 letters.</p>`);
      return;
    }
    setHTML(resultsBox, html`<p class="muted"><span class="spinner spinner--sm" aria-hidden="true"></span> Searching…</p>`);
    try {
      searchResults = await geocode(query);
      if (searchResults.length === 0) {
        setHTML(resultsBox, html`<p class="muted">No places found. Try another spelling.</p>`);
        return;
      }
      setHTML(resultsBox, html`
        <ul class="loc-list">
          ${searchResults.map((place, i) => html`
            <li><button class="loc-option" type="button" data-index="${i}">${place.label}</button></li>`)}
        </ul>`);
    } catch (error) {
      setHTML(resultsBox, html`<p class="error">${friendlyError(error)}</p>`);
    }
  }

  function chooseResult(place) {
    pickId++;   // replaces any place name that is still loading
    selected = { label: place.label, lat: round4(place.lat), lon: round4(place.lon) };
    setHTML(resultsBox, '');
    if (map) {
      map.setView([place.lat, place.lon], 13);
      placeMarker(selected.lat, selected.lon);
    }
    showSelected();
    errorBox.textContent = '';
  }

  showSelected();
  createMap();

  if (!navigator.geolocation || !map) locateButton.hidden = true;
  locateButton.addEventListener('click', useMyLocation);

  form.querySelector('[data-action="search"]').addEventListener('click', search);
  form.elements.namedItem('locationQuery').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();   // search instead of submitting the form
      search();
    }
  });
  resultsBox.addEventListener('click', event => {
    const option = event.target.closest('.loc-option');
    if (option) chooseResult(searchResults[Number(option.dataset.index)]);
  });

  return { selected: () => selected };
}

// ---------- save ----------

/** Read the form into a field object. Rice depths are typed in cm and stored in mm. */
function collectField(form, { usualMm, location }) {
  const isRice = isRiceCrop(form.elements.namedItem('cropType').value);
  const riceNumber = (name, fallback) => (isRice ? (numberValue(form, name) ?? fallback) : null);
  const riceCmAsMm = (name, fallbackMm) => {
    if (!isRice) return null;
    const cm = numberValue(form, name);
    return cm == null ? fallbackMm : cmToMm(cm);
  };

  return {
    name: textValue(form, 'name'),
    cropType: form.elements.namedItem('cropType').value,
    plantingDate: textValue(form, 'plantingDate'),
    areaHa: numberValue(form, 'areaHa'),
    soilType: textValue(form, 'soilType') || null,
    locationName: location?.label ?? '',
    lat: location?.lat ?? null,
    lon: location?.lon ?? null,
    usualAmountMm: usualMm,
    pumpM3PerHour: numberValue(form, 'pumpM3PerHour'),
    usualIntervalDays: numberValue(form, 'usualIntervalDays'),
    rootDepthM: isRice ? null : numberValue(form, 'rootDepthM'),
    p: isRice ? null : numberValue(form, 'p'),
    seepageMmDay: riceNumber('seepageMmDay', RICE_DEFAULTS.seepageMmDay),
    refillMm: riceCmAsMm('refillMm', RICE_DEFAULTS.refillMm),
    targetMm: riceCmAsMm('targetMm', RICE_DEFAULTS.targetMm),
    bundMm: riceCmAsMm('bundMm', RICE_DEFAULTS.bundMm),
  };
}

async function saveField(form, field, inputs) {
  const data = collectField(form, inputs);
  const errors = validateField(data, todayISO(TIMEZONE));

  const typedHours = form.elements.namedItem('usualUnit').value === 'hours'
    && numberValue(form, 'usualAmountMm') != null;
  if (typedHours && data.pumpM3PerHour == null) {
    errors.pumpM3PerHour = 'Enter your pump flow to use hours of pumping.';
  }

  showFieldErrors(form, errors);
  // Open an "Advanced" box when one of its inputs has an error, so the message can be seen.
  form.querySelectorAll('details.advanced').forEach(box => {
    if ([...box.querySelectorAll('[data-error-for]')].some(el => el.textContent)) box.open = true;
  });
  if (Object.keys(errors).length > 0) return;

  const button = form.querySelector('button[type="submit"]');
  const formError = form.querySelector('.form-error');
  formError.textContent = '';
  setBusy(button, true);
  try {
    const saved = field
      ? await updateField(field.id, { ...field, ...data })
      : await createField({ ...data, ownerId: currentUser().id });
    setFlash(field ? 'Field updated.' : 'Field created.');
    window.location.hash = `#/fields/${saved.id}`;
  } catch (error) {
    setBusy(button, false);
    formError.textContent = `Could not save: ${friendlyError(error)}`;
  }
}
