import { MOCKAPI_BASE, isMockApiConfigured } from '../config.js';
import { fetchJson } from './http.js';

async function request(path, { method = 'GET', body } = {}) {
  if (!isMockApiConfigured()) {
    const error = new Error('MockAPI is not configured. Set MOCKAPI_BASE in js/config.js.');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  return fetchJson(`${MOCKAPI_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Like request(), but a 404 on a list means "no items" (MockAPI quirk). */
async function requestList(path) {
  try {
    return await request(path);
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

// MockAPI returns whatever types were saved; make sure numbers are numbers and ids are strings.
const FIELD_NUMBERS = ['areaHa', 'rootDepthM', 'p', 'lat', 'lon', 'usualAmountMm', 'usualIntervalDays',
  'seepageMmDay', 'refillMm', 'targetMm', 'bundMm', 'pumpM3PerHour'];
const RECORD_NUMBERS = ['amountMm', 'depthMm', 'recommendedMm'];

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalize(item, numberKeys) {
  const out = { ...item, id: String(item.id) };
  for (const key of numberKeys) out[key] = toNumberOrNull(item[key]);
  return out;
}

const normalizeField = field => normalize(field, FIELD_NUMBERS);
const normalizeRecord = record => ({ ...normalize(record, RECORD_NUMBERS), fieldId: String(record.fieldId) });

// ---------- fields ----------

export async function getFields() {
  const list = await requestList('/fields');
  return list.map(normalizeField).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getField(id) {
  return normalizeField(await request(`/fields/${encodeURIComponent(id)}`));
}

export async function createField(field) {
  return normalizeField(await request('/fields', { method: 'POST', body: field }));
}

/** Send the WHOLE field object (PUT replaces it). */
export async function updateField(id, field) {
  return normalizeField(await request(`/fields/${encodeURIComponent(id)}`, { method: 'PUT', body: field }));
}

export async function deleteField(id) {
  return request(`/fields/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------- records ----------

export async function getAllRecords() {
  const list = await requestList('/records');
  return list.map(normalizeRecord);
}

export async function getRecords(fieldId) {
  const list = await requestList(`/records?fieldId=${encodeURIComponent(fieldId)}`);
  // MockAPI filters by "contains" (?fieldId=1 also matches 10, 11…), so keep exact matches only.
  return list
    .map(normalizeRecord)
    .filter(r => r.fieldId === String(fieldId))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function createRecord(record) {
  return normalizeRecord(await request('/records', { method: 'POST', body: record }));
}

export async function updateRecord(id, record) {
  return normalizeRecord(await request(`/records/${encodeURIComponent(id)}`, { method: 'PUT', body: record }));
}

export async function deleteRecord(id) {
  return request(`/records/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** MockAPI does not delete child records for us, so delete them first (one at a time). */
export async function deleteFieldWithRecords(fieldId) {
  const records = await getRecords(fieldId);
  for (const record of records) {
    await deleteRecord(record.id);
  }
  return deleteField(fieldId);
}

// ---------- messages (contact form) ----------

/** Save a contact-form message: { name, email, message, sentAt }. */
export async function createMessage(message) {
  return request('/messages', { method: 'POST', body: message });
}
