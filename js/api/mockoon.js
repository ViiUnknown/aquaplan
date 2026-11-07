import { API_BASE } from '../config.js';
import { fetchJson } from './http.js';

async function request(path, { method = 'GET', body } = {}) {
  try {
    return await fetchJson(`${API_BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.code === 'NETWORK') error.code = 'API_OFFLINE';
    throw error;
  }
}

async function requestList(path) {
  try {
    return await request(path);
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

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

export async function updateField(id, field) {
  return normalizeField(await request(`/fields/${encodeURIComponent(id)}`, { method: 'PUT', body: field }));
}

export async function deleteField(id) {
  return request(`/fields/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getAllRecords() {
  const list = await requestList('/records');
  return list.map(normalizeRecord);
}

export async function getRecords(fieldId) {
  const list = await requestList(`/records?fieldId=${encodeURIComponent(fieldId)}`);
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

export async function deleteFieldWithRecords(fieldId) {
  const records = await getRecords(fieldId);
  for (const record of records) {
    await deleteRecord(record.id);
  }
  return deleteField(fieldId);
}

export async function createMessage(message) {
  return request('/messages', { method: 'POST', body: message });
}

export async function getMessages() {
  const list = await requestList('/messages');
  return list.map(m => ({ ...m, id: String(m.id) })).sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
}

export async function deleteMessage(id) {
  return request(`/messages/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

const normalizeUser = user => ({ ...user, id: String(user.id) });

export async function getUsers() {
  const list = await requestList('/users');
  return list
    .filter(u => u && typeof u.email === 'string' && typeof u.passwordHash === 'string')   // ignore anything that isn't an account
    .map(normalizeUser)
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
}

export async function createUser(user) {
  return normalizeUser(await request('/users', { method: 'POST', body: user }));
}

export async function updateUser(id, user) {
  return normalizeUser(await request(`/users/${encodeURIComponent(id)}`, { method: 'PUT', body: user }));
}

export async function deleteUser(id) {
  return request(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
