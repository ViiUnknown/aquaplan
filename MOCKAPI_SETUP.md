# AquaPlan – MockAPI.io Setup Guide

A step-by-step guide to creating AquaPlan's back-end on **MockAPI.io**, testing it, and connecting it to
the app. No prior back-end experience is needed.

Related: [ARCHITECTURE.md](ARCHITECTURE.md) §6 (data model diagrams) · [REQUIREMENTS.md](REQUIREMENTS.md) §10

---

## 1. What is MockAPI.io?

MockAPI.io is a website that gives you a **ready-made REST API with storage** in a few clicks. You
describe your data ("a field has a name, crop, area…"), and it gives you a URL that supports:

```
GET     read
POST    create
PUT     update
DELETE  delete
```

It replaces the back-end server and database we would normally have to build. The data really is
saved, so it's still there after refreshing or on another computer.

> ⚠️ Anyone who knows your MockAPI URL can read and change the data. Use it for demo data only.

### Plan limits
The free plan limits how many projects and resources you can create, and the limits change over time.
**Check the current numbers on the MockAPI pricing page.** AquaPlan is designed to need only
**1 project with 2 resources** (`fields` and `records`) so it fits a free account.

---

## 2. Who should do this?

**One team member** creates the MockAPI project and shares the **base URL** with the team. Everyone
uses the same URL, so you all see the same data. Optionally, each member can create their own
project for experimenting so you don't overwrite each other's test data.

---

## 3. Step-by-step setup

### Step 1 – Create an account
1. Go to **https://mockapi.io**.
2. Click **Sign in / Get started** and sign in with GitHub or Google.

### Step 2 – Create the project
1. On the dashboard, click **+ New project** (or the **+** card).
2. **Project name:** `aquaplan`
3. **API prefix:** `/api/v1` (optional, but it makes URLs clearer and lets you version the API later).
4. Click **Create**.
5. Open the project. At the top you'll see the **API endpoint**:
   ```
   https://<project-id>.mockapi.io/api/v1
   ```
   📋 **Copy this.** It is your `MOCKAPI_BASE`.

### Step 3 – Create the `fields` resource
1. Click **New resource**.
2. **Resource name:** `fields` (lower-case and plural, because it becomes the URL `/fields`).
3. In **Schema**, MockAPI already adds `id` (Object ID) and `createdAt`. Keep both.
4. Add these properties with **+ Add field**. Each property needs a name and a type:

| Property | Type in MockAPI | Example value | Notes |
|---|---|---|---|
| `name` | String | `North paddy` | |
| `cropType` | String | `rice` | `rice` · `maize` · `soybean` · `cassava` |
| `plantingDate` | String | `2026-09-01` | Store as `YYYY-MM-DD` text, not a timestamp |
| `areaHa` | Number | `1.5` | hectares |
| `soilType` | String | `clay` | `sand` · `sandyLoam` · `loam` · `clayLoam` · `clay` |
| `rootDepthM` | Number | `1.0` | upland only (null for rice) |
| `p` | Number | `0.55` | upland only |
| `locationName` | String | `Battambang, Cambodia` | |
| `lat` | Number | `13.1027` | |
| `lon` | Number | `103.1982` | |
| `usualAmountMm` | Number | `40` | optional |
| `usualIntervalDays` | Number | `5` | optional |
| `seepageMmDay` | Number | `4` | rice only |
| `refillMm` | Number | `0` | rice only |
| `targetMm` | Number | `50` | rice only |
| `bundMm` | Number | `100` | rice only |

5. Set the number of auto-generated items to **0**. Random fake values (such as a random latitude or
   a made-up crop name) would break the calculations. We'll add realistic data with the seed script
   in §8 instead.
6. Click **Create**.

> 💡 Add **every** property you plan to send to the schema. Then the data shown in the MockAPI
> dashboard matches what the app saves, and teammates can see the expected shape.

### Step 4 – Create the `records` resource
1. Click **New resource** → name: `records`.
2. Keep `id` and `createdAt`. Add:

| Property | Type in MockAPI | Example value | Notes |
|---|---|---|---|
| `fieldId` | String | `1` | the `id` of the field it belongs to |
| `date` | String | `2026-10-10` | `YYYY-MM-DD` |
| `type` | String | `irrigation` | `irrigation` or `depthReading` |
| `amountMm` | Number | `45` | for `irrigation` (null otherwise) |
| `depthMm` | Number | `30` | for `depthReading` (null otherwise) |
| `recommendedMm` | Number | `50` | the app's recommendation when the record was saved |
| `note` | String | `Pumped from canal` | optional |

3. Set generated items to **0** → **Create**.

> Keep `records` as a **separate (flat) resource**. Don't drag it onto `fields` to make a parent-child
> link. See §10 for why.

You should now see two resources in your project:

```
aquaplan  (https://<project-id>.mockapi.io/api/v1)
├── fields   → /fields
└── records  → /records
```

---

## 4. Test that it works (no code yet)

### A. In the browser
Open this in a new tab (with your own project id):
```
https://<project-id>.mockapi.io/api/v1/fields
```
You should see `[]` (an empty list). ✅

### B. With the browser console (F12 → Console)
Paste this to create a test field:
```js
const BASE = 'https://<project-id>.mockapi.io/api/v1';

await fetch(`${BASE}/fields`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Test field', cropType: 'maize', areaHa: 1 }),
}).then(r => r.json());
```
It should return an object with an `id`. Refresh the `/fields` tab and you'll see it. ✅

### C. With a REST client (optional)
- **Thunder Client** (VS Code extension) or **Postman**: create requests for GET/POST/PUT/DELETE and save them as a collection the team can share.
- **curl** (Git Bash):
  ```bash
  curl https://<project-id>.mockapi.io/api/v1/fields
  curl -X POST -H "Content-Type: application/json" \
       -d '{"name":"Test","cropType":"maize","areaHa":1}' \
       https://<project-id>.mockapi.io/api/v1/fields
  curl -X DELETE https://<project-id>.mockapi.io/api/v1/fields/1
  ```

You can also view, edit and delete rows directly in the MockAPI dashboard by clicking a resource's **data** bar.

---

## 5. Connect it to the app – `js/config.js`

```js
// js/config.js
// Base URL of our MockAPI project (shared by the whole team).
export const MOCKAPI_BASE = 'https://<project-id>.mockapi.io/api/v1';
```

This is the **only** place the URL appears. If you ever switch projects, change it here.

---

## 6. The API wrapper – `js/api/mockApi.js`

Copy this as the starting version. Every other file calls these functions and never calls `fetch` on MockAPI directly.

```js
// js/api/mockApi.js
import { MOCKAPI_BASE } from '../config.js';

/**
 * Send a request to MockAPI and return the parsed JSON.
 * Throws an Error (with .status) on any non-2xx response.
 */
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${MOCKAPI_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = new Error(`MockAPI ${method} ${path} failed with status ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Like request(), but a 404 on a list means "no items", not an error. */
async function requestList(path) {
  try {
    return await request(path);
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

// ---------- fields ----------
export const getFields   = ()          => requestList('/fields');
export const getField    = (id)        => request(`/fields/${id}`);
export const createField = (field)     => request('/fields', { method: 'POST', body: field });
export const updateField = (id, field) => request(`/fields/${id}`, { method: 'PUT', body: field });
export const deleteField = (id)        => request(`/fields/${id}`, { method: 'DELETE' });

// ---------- records ----------
export async function getRecords(fieldId) {
  const list = await requestList(`/records?fieldId=${encodeURIComponent(fieldId)}`);
  // MockAPI filters by "contains", so ?fieldId=1 also returns 10, 11, 21…
  // Keep only exact matches, then sort by date.
  return list
    .filter(r => String(r.fieldId) === String(fieldId))
    .sort((a, b) => a.date.localeCompare(b.date));
}
export const createRecord = (record)     => request('/records', { method: 'POST', body: record });
export const updateRecord = (id, record) => request(`/records/${id}`, { method: 'PUT', body: record });
export const deleteRecord = (id)         => request(`/records/${id}`, { method: 'DELETE' });

// ---------- field + its records ----------
/** MockAPI won't delete a field's records for us, so delete them first. */
export async function deleteFieldWithRecords(fieldId) {
  const records = await getRecords(fieldId);
  for (const r of records) {
    await deleteRecord(r.id);   // one at a time, which is gentler on MockAPI rate limits
  }
  return deleteField(fieldId);
}
```

Usage in a view:
```js
import { getFields } from '../api/mockApi.js';
import { showLoading, hideLoading, showError } from '../utils/ui.js';

export async function renderDashboard(container) {
  showLoading(container);
  try {
    const fields = await getFields();
    if (fields.length === 0) {
      container.textContent = 'No fields yet. Add your first field!';
      return;
    }
    // ...build the cards
  } catch (err) {
    showError(container, 'Could not load your fields. Please try again.');
    console.error(err);
  } finally {
    hideLoading(container);
  }
}
```

---

## 7. MockAPI quirks to know (they will catch you otherwise)

| # | Quirk | What to do |
|---|---|---|
| 1 | **IDs are strings** (`"7"`, not `7`) | Always compare with `String(a) === String(b)` |
| 2 | **Filtering is a partial ("contains") match:** `?fieldId=1` also returns records for field `10`, `11`, `21`… | Filter exactly again in JS (done in `getRecords`) |
| 3 | A filter with **no matches may return `404 Not found`** instead of `[]` | Treat 404 on a list as an empty array (`requestList`) |
| 4 | **No cascade delete** on flat resources | Delete records before their field (`deleteFieldWithRecords`) |
| 5 | **PUT:** send the **whole object**, not just the changed property, so nothing is accidentally lost | Spread the old object: `{ ...field, areaHa: 2 }` |
| 6 | Data comes back with the **types you sent**. Values from form inputs are strings | Convert with `Number(input.value)` before saving |
| 7 | **Rate limits:** sending dozens of requests at once can be throttled (HTTP 429) | Don't fire requests in big loops. Cache, and use `state.js` |
| 8 | Extra built-in query options: `?page=1&limit=10`, `?sortBy=date&order=desc`, `?search=text` | Optional. Useful for long record lists |
| 9 | **Dates:** store as `"YYYY-MM-DD"` strings | Avoids time-zone bugs and sorts correctly with `localeCompare` |

---

## 8. Seed script – realistic demo data

Fill MockAPI with sample fields and records so you can build the UI before the forms exist.
Open your app (or any page), press **F12 → Console**, change `BASE`, paste, and press Enter.

```js
const BASE = 'https://<project-id>.mockapi.io/api/v1';

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());

const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const rice = await post('/fields', {
  name: 'North paddy', cropType: 'rice', plantingDate: daysAgo(45), areaHa: 1.5,
  soilType: 'clay', rootDepthM: null, p: null,
  locationName: 'Battambang, Cambodia', lat: 13.1027, lon: 103.1982,
  usualAmountMm: 50, usualIntervalDays: 4,
  seepageMmDay: 4, refillMm: 0, targetMm: 50, bundMm: 100,
});

const maize = await post('/fields', {
  name: 'East maize plot', cropType: 'maize', plantingDate: daysAgo(40), areaHa: 0.8,
  soilType: 'loam', rootDepthM: 1.0, p: 0.55,
  locationName: 'Kampong Cham, Cambodia', lat: 11.9934, lon: 105.4635,
  usualAmountMm: 30, usualIntervalDays: 5,
  seepageMmDay: null, refillMm: null, targetMm: null, bundMm: null,
});

const soy = await post('/fields', {
  name: 'Soybean strip', cropType: 'soybean', plantingDate: daysAgo(20), areaHa: 0.5,
  soilType: 'sandyLoam', rootDepthM: 0.6, p: 0.5,
  locationName: 'Siem Reap, Cambodia', lat: 13.3633, lon: 103.8564,
  usualAmountMm: 25, usualIntervalDays: 4,
  seepageMmDay: null, refillMm: null, targetMm: null, bundMm: null,
});

await post('/records', { fieldId: rice.id,  date: daysAgo(3), type: 'depthReading', amountMm: null, depthMm: 40, recommendedMm: null, note: 'Measured at gauge stick' });
await post('/records', { fieldId: rice.id,  date: daysAgo(8), type: 'irrigation',   amountMm: 50, depthMm: null, recommendedMm: 45, note: 'Canal water' });
await post('/records', { fieldId: maize.id, date: daysAgo(6), type: 'irrigation',   amountMm: 30, depthMm: null, recommendedMm: 35, note: 'Pump 3 hours' });
await post('/records', { fieldId: maize.id, date: daysAgo(15), type: 'irrigation',  amountMm: 35, depthMm: null, recommendedMm: 30, note: '' });

console.log('Seeded ✅', { rice, maize, soy });
```

To start over, open each resource in the MockAPI dashboard and delete the data (or use the reset option).

---

## 9. Checklist

- [ ] Account created, project `aquaplan` with prefix `/api/v1`
- [ ] Resource `fields` with all 16 properties (plus `id` and `createdAt`)
- [ ] Resource `records` with all 7 properties (plus `id` and `createdAt`)
- [ ] `GET /fields` shows `[]` in the browser
- [ ] Test POST from the console works
- [ ] Base URL shared with the team and put in `js/config.js`
- [ ] Seed data loaded
- [ ] `js/api/mockApi.js` created and `getFields()` tested in the console

---

## 10. Why not a parent-child (nested) resource?

MockAPI lets you drag `records` onto `fields` to create nested URLs like `/fields/3/records`. That
gives exact filtering, but:
- every record URL then needs the parent id (`/fields/3/records/12`), which makes editing code longer;
- the behaviour (including what happens on delete) is less obvious for beginners;
- the flat design matches the ER diagram and is easy to explain in the report.

A flat `records` resource plus an exact match in JS (§6) is simpler. If your team prefers nested
URLs, it works too. Just update the paths in `mockApi.js` and the endpoint table in ARCHITECTURE.md.

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `TypeError: Failed to fetch` | No internet, typo in the base URL, or `http` instead of `https` | Open the URL in the browser. Check `config.js` |
| `404` on `/fields` | Wrong prefix (e.g. missing `/api/v1`) or resource name spelled differently | Compare with the endpoint shown in the MockAPI dashboard |
| `404` on `/fields/abc` | That id doesn't exist (deleted, or a different project) | Show "Field not found" |
| `400 Bad Request` | Body isn't valid JSON, or the `Content-Type` header is missing | Use `JSON.stringify` and set the header |
| `429 Too Many Requests` | Too many calls in a short time | Wait, cache, avoid loops of requests |
| Records of the wrong field appear | "Contains" filter (quirk #2) | Use the exact-match `getRecords` from §6 |
| Numbers saved as `"1.5"` (string) | Saved `input.value` directly | `Number(input.value)` before saving |
| `Cannot use import statement outside a module` | Script tag missing `type="module"` | `<script type="module" src="js/main.js">` |
| CORS error when opening `index.html` by double-click | `file://` page with ES modules | Use Live Server (EXPLANATION.md Part 12) |
