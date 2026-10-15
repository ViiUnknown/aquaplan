# AquaPlan – Beginner's Guide to the Technology

This guide explains every technology and idea used in AquaPlan in plain language, with small
examples. Read it top to bottom once, then come back to sections as you need them.
The formal rules are in [REQUIREMENTS.md](REQUIREMENTS.md).

---

## Part 1 – The big picture

### What are we building?
A website where a farmer:
1. Adds a field ("North paddy, rice, 1.5 ha, Battambang").
2. The app asks a **weather service** for rain and evaporation numbers for that place.
3. The app **calculates** whether the field needs water in the next 7 days.
4. The farmer writes down how much water they actually used, and the app compares.

### How the pieces talk to each other

```
 ┌─────────────────────────────┐
 │  Browser (our app)          │
 │  index.html + CSS + JS      │
 └──────┬──────────────┬───────┘
        │ fetch()      │ fetch()
        ▼              ▼
 ┌──────────────┐  ┌──────────────────┐
 │ Open-Meteo   │  │ MockAPI.io       │
 │ (weather +   │  │ (our "database": │
 │  place search│  │  fields, records)│
 └──────────────┘  └──────────────────┘
```

There is **no server code that we write**. All our code runs in the browser. Open-Meteo gives us
weather. MockAPI acts as a fake back-end that saves our data.

---

## Part 2 – The three web languages

| Language | Job | Analogy |
|---|---|---|
| **HTML** | Structure / content (headings, forms, buttons) | The walls of a house |
| **CSS** | Appearance (colours, layout, phone vs desktop) | Paint and furniture |
| **JavaScript (JS)** | Behaviour (clicking, fetching data, calculating) | Electricity and plumbing |

**"Vanilla JavaScript"** means plain JavaScript with no framework like React or Vue. We write
everything ourselves using what the browser already provides.

---

## Part 3 – Single-Page Application (SPA)

A normal website loads a **new HTML file** for each page. An SPA loads **one** `index.html`, and
JavaScript swaps the content inside it when you "change page". It feels faster, like an app.

### Hash routing
We use the part of the URL after `#` to know which "page" to show:

```
index.html#/dashboard        → show the dashboard
index.html#/fields/new       → show the "add field" form
index.html#/fields/3         → show field number 3
```

When the hash changes, the browser fires a `hashchange` event. We listen for it:

```js
// main.js
const app = document.getElementById('app');

function router() {
  const hash = location.hash || '#/dashboard';

  if (hash === '#/dashboard') {
    app.innerHTML = '<h1>Dashboard</h1>';
  } else if (hash === '#/fields/new') {
    app.innerHTML = '<h1>Add a field</h1>';
  } else if (hash.startsWith('#/fields/')) {
    const id = hash.split('/')[2];          // "#/fields/3" → "3"
    app.innerHTML = `<h1>Field ${id}</h1>`;
  } else {
    app.innerHTML = '<h1>Page not found</h1>';
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
```

A link to a page is just `<a href="#/fields/new">Add field</a>`.

---

## Part 4 – ES Modules (splitting code into files)

Instead of one giant JS file, we split code into small files and connect them with
`export` / `import`.

```js
// js/utils/format.js
export function mmToM3(mm, areaHa) {
  return mm * areaHa * 10;
}
```

```js
// js/main.js
import { mmToM3 } from './utils/format.js';
console.log(mmToM3(30, 1.5));   // 450
```

In HTML, load the entry file with `type="module"`:

```html
<script type="module" src="js/main.js"></script>
```

> ⚠️ **Modules do NOT work if you double-click `index.html`** (a `file://` address). You must run a
> small local server. See Part 12.

---

## Part 5 – The DOM (changing the page with JS)

The **DOM** is the browser's live version of your HTML, which JavaScript can read and change.

```js
const title = document.querySelector('#title');   // find an element
title.textContent = 'My Fields';                  // change its text

const btn = document.querySelector('#saveBtn');
btn.addEventListener('click', () => {             // react to a click
  alert('Saved!');
});

const li = document.createElement('li');          // create a new element
li.textContent = 'North paddy';
document.querySelector('#fieldList').append(li);
```

> ⚠️ **Security tip:** avoid `innerHTML` with text the user typed (e.g. a field name). Someone could
> type `<script>`. Use `textContent`, or escape the text first.

---

## Part 6 – JSON

**JSON** is the text format APIs use to send data. It looks just like a JavaScript object:

```json
{ "name": "North paddy", "cropType": "rice", "areaHa": 1.5 }
```

- `JSON.stringify(obj)` turns an object into a JSON string (before sending).
- `JSON.parse(text)` turns a JSON string into an object (after receiving). `response.json()` does this for you.

---

## Part 7 – APIs, `fetch`, and `async/await`

### What is an API?
An **API** is a web address that returns data instead of a web page. You send a **request**, and it
sends a **response** (usually JSON).

### Why "asynchronous"?
Asking a server takes time (100 ms to a few seconds). JavaScript doesn't freeze while it waits. It
gets back a **Promise**, an "I'll give you the answer later" ticket. `async/await` lets us write
waiting code that reads top to bottom:

```js
async function getWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
              `&daily=precipitation_sum,et0_fao_evapotranspiration&forecast_days=7` +
              `&timezone=Asia/Phnom_Penh`;

  const response = await fetch(url);     // wait for the server
  if (!response.ok) {                    // 404, 500, ...
    throw new Error(`Weather API error ${response.status}`);
  }
  return await response.json();          // wait for the body, convert to object
}
```

### Error handling with `try/catch`
Networks fail (Wi-Fi drops, the server is down). Always wrap API calls:

```js
async function showWeather(field) {
  showLoading();                                   // spinner on
  try {
    const data = await getWeather(field.lat, field.lon);
    renderWeather(data);
  } catch (err) {
    showError('Could not load weather. Check your internet and try again.');
    console.error(err);
  } finally {
    hideLoading();                                 // spinner off, success or failure
  }
}
```

This pattern (**loading → try → catch → finally**) covers NFR-3 and NFR-4 in the requirements.

---

## Part 8 – REST and CRUD (MockAPI.io)

**CRUD** = **C**reate, **R**ead, **U**pdate, **D**elete, the four things you do with saved data.
A **REST API** maps them to HTTP methods:

| Action | HTTP method | Example URL |
|---|---|---|
| Read all fields | `GET` | `/fields` |
| Read one field | `GET` | `/fields/3` |
| Create a field | `POST` | `/fields` |
| Update a field | `PUT` | `/fields/3` |
| Delete a field | `DELETE` | `/fields/3` |

### Setting up MockAPI.io (step by step)
1. Go to **mockapi.io** and sign up (free).
2. Click **New project** and name it `aquaplan`.
3. Copy your project's **base URL**, which looks like `https://abc123.mockapi.io/api/v1`.
   Put it in `js/config.js`.
4. Click **New resource** and name it `fields`. Add the properties from REQUIREMENTS.md §10.
5. Create a second resource named `records`.
6. Open `https://abc123.mockapi.io/api/v1/fields` in your browser. You should see `[]` or sample data.

> MockAPI data is **public**: anyone with the URL can read or change it. That's fine for a class
> demo, but never store real private data there.

### Example CRUD code

```js
// js/api/mockApi.js
import { MOCKAPI_BASE } from '../config.js';

async function request(path, options = {}) {
  const res = await fetch(`${MOCKAPI_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`MockAPI error ${res.status}`);
  return res.json();
}

export const getFields   = ()          => request('/fields');
export const getField    = (id)        => request(`/fields/${id}`);
export const createField = (field)     => request('/fields', { method: 'POST', body: JSON.stringify(field) });
export const updateField = (id, field) => request(`/fields/${id}`, { method: 'PUT', body: JSON.stringify(field) });
export const deleteField = (id)        => request(`/fields/${id}`, { method: 'DELETE' });

export const getRecords  = (fieldId)   => request(`/records?fieldId=${fieldId}`);
```

---

## Part 9 – Open-Meteo (weather and place search)

Open-Meteo is **free and needs no API key**.

### 1. Place search (geocoding): place name → coordinates
```
https://geocoding-api.open-meteo.com/v1/search?name=Battambang&count=5&format=json
```
Response (shortened):
```json
{
  "results": [
    { "name": "Battambang", "latitude": 13.1027, "longitude": 103.1982,
      "country": "Cambodia", "admin1": "Battambang" }
  ]
}
```
If nothing matches, `results` is **missing**, so check for it: `data.results ?? []`.

### 2. Forecast: coordinates → daily weather
```
https://api.open-meteo.com/v1/forecast?latitude=13.10&longitude=103.20
  &daily=precipitation_sum,et0_fao_evapotranspiration
  &past_days=30&forecast_days=7&timezone=Asia/Phnom_Penh
```
Response (shortened). Notice the data comes back as **parallel arrays**:
```json
{
  "daily": {
    "time":                       ["2026-10-15", "2026-10-16", "..."],
    "precipitation_sum":          [12.4, 0.0, "..."],
    "et0_fao_evapotranspiration": [3.9, 4.6, "..."]
  }
}
```
Index `0` in every array is the same day. Turn them into a friendlier list:
```js
const days = data.daily.time.map((date, i) => ({
  date,
  rain: data.daily.precipitation_sum[i],
  et0:  data.daily.et0_fao_evapotranspiration[i],
}));
```
- `past_days` (max 92) gives **observed** weather for recent days. We need it to rebuild the soil balance.
- `forecast_days=7` gives the next 7 days for the plan.

---

## Part 10 – The farming science, explained simply

You don't need to be a farmer. Think of the field's water like a **bank account**.

### Evapotranspiration (ET)
Water leaves the field two ways: **evaporation** from the soil and **transpiration** (plants
"breathing out" water through their leaves). Together: **evapotranspiration**, measured in mm/day.

- **ET₀ (reference ET):** what a standard grass field would lose. Open-Meteo gives us this.
- **Kc (crop coefficient):** how thirsty *our* crop is compared with grass. It changes as the plant grows:

```
Kc
1.2 |            ________
    |           /        \
    |          /          \
0.3 |_________/            \____
    +--------------------------- days since planting
      initial  develop  mid   late
```
- **ETc = Kc × ET₀** is the water our crop actually uses each day.
  Example: ET₀ = 5 mm, maize at mid-season Kc = 1.2 → ETc = 6 mm/day.

### "mm of water" – what does it mean?
1 mm of water = a layer 1 mm deep over the whole field.
On **1 hectare** (10,000 m²) that is **10 m³** (10,000 litres).
So `m³ = mm × hectares × 10`.

### Upland crops (maize, soybean, cassava): the soil "bucket"
Soil holds water like a sponge or bucket.
- **TAW** (Total Available Water) = the bucket size = how much water the root zone can hold for plants.
  `TAW = AWC × root depth` (clay holds more than sand).
- **Deficit (D)** = how empty the bucket is. 0 = full.
- **RAW** = how empty it can get before the plant starts to suffer. `RAW = p × TAW`.

Every day:
```
deficit goes UP   by ETc (plants use water)
deficit goes DOWN by rain × 0.8  (not all rain soaks in)
deficit goes DOWN by irrigation
```
- Deficit reaches 70% of RAW → **MONITOR**
- Deficit reaches RAW → **IRRIGATE** with an amount equal to the deficit (fill the bucket back up)

### Paddy rice: the "swimming pool"
Rice grows standing in water. We track the **depth of water on top** (mm).

Every day:
```
depth goes UP   by rain + irrigation   (but not above the bund (wall) height – extra runs off)
depth goes DOWN by ETc + seepage       (seepage = water leaking into the ground, ~4 mm/day)
```
- Depth near the refill threshold (within 10 mm) → **MONITOR**
- Depth hits the threshold (0 mm) → **REFILL** up to the target (50 mm)

### SKIP – the clever bit
If water is needed **but** enough rain is forecast in the next 2 days, tell the farmer to
**SKIP** and let the rain do the work. That saves water and pumping money.

---

## Part 11 – Form validation

Check user input **before** sending it to MockAPI.

```js
// js/utils/validation.js
export function validateField(f) {
  const errors = {};
  if (!f.name || f.name.trim().length < 2) errors.name = 'Name must be at least 2 characters.';
  if (!(f.areaHa > 0))                     errors.areaHa = 'Area must be greater than 0.';
  if (f.lat == null || f.lon == null)      errors.location = 'Choose a location from the search results.';
  return errors;   // empty object = valid
}
```
```js
const errors = validateField(formData);
if (Object.keys(errors).length > 0) {
  showErrors(errors);   // put a message under each bad input
  return;               // stop – don't save
}
await createField(formData);
```
HTML can also help: `<input type="number" min="0.01" required>`. Still do the JS check as well.

---

## Part 12 – Running the project on your computer

Because we use ES modules, we need a local web server.

**Option A – VS Code (easiest)**
1. Install **Visual Studio Code**.
2. Install the extension **"Live Server"** (by Ritwick Dey).
3. Open the `FinalProject` folder, right-click `index.html`, and choose **Open with Live Server**.
4. The browser opens at `http://127.0.0.1:5500`, and it reloads every time you save.

**Option B – Node.js**
```
npx serve .
```
Then open the address it prints.

### Your best friend: browser DevTools (press F12)
- **Console:** see errors and `console.log` output, and try out functions.
- **Network:** see every API request, its URL, status (200 / 404 / 500) and the JSON response.
- **Device toolbar (Ctrl+Shift+M):** preview the phone layout.

---

## Part 13 – Responsive design (works on phones)

```html
<!-- in <head> – required for phones -->
<meta name="viewport" content="width=device-width, initial-scale=1">
```
```css
.cards {
  display: grid;
  grid-template-columns: 1fr;            /* phone: 1 column */
  gap: 1rem;
}
@media (min-width: 768px) {
  .cards { grid-template-columns: repeat(2, 1fr); }   /* tablet: 2 columns */
}
@media (min-width: 1100px) {
  .cards { grid-template-columns: repeat(3, 1fr); }   /* desktop: 3 columns */
}
```
Design for the phone first, then add `@media` rules for bigger screens.

---

## Part 14 – Charts (rice water depth)

**Chart.js** (if the instructor allows it) draws charts from data:

```html
<canvas id="depthChart"></canvas>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```
```js
new Chart(document.getElementById('depthChart'), {
  type: 'line',
  data: {
    labels: ['Oct 15', 'Oct 16', 'Oct 17'],
    datasets: [{ label: 'Water depth (mm)', data: [50, 40, 30] }],
  },
});
```
If libraries aren't allowed, we draw a simple line chart with SVG `<polyline>` instead. It's still very doable.

---

## Part 15 – Saving small things in the browser

`sessionStorage` keeps data until the tab closes. We use it to **cache weather** so we don't call
the API on every page change:

```js
sessionStorage.setItem('weather-3', JSON.stringify({ savedAt: Date.now(), data }));

const cached = JSON.parse(sessionStorage.getItem('weather-3'));
if (cached && Date.now() - cached.savedAt < 60 * 60 * 1000) {
  // use cached.data (less than 1 hour old)
}
```

---

## Part 16 – How one page load works (putting it together)

User opens `#/fields/3`:

```
1. router() sees "#/fields/3" → calls renderFieldDetail("3")
2. showLoading()
3. await getField("3")                 → MockAPI  → field object
4. await getRecords("3")               → MockAPI  → irrigation records + depth readings
5. await getWeather(lat, lon)          → Open-Meteo → past + 7-day daily data
6. model = field.cropType === 'rice' ? runRiceProjection : runUplandBalance
7. plan = buildPlan(model output)      → [{date, status: 'IRRIGATE', amountMm: 32}, ...]
8. render the plan table, the chart and the comparison
9. hideLoading()   (if anything fails → showError(...) instead)
```

Tip: steps 3–5 can run **at the same time** with `Promise.all` to make the page faster:
```js
const [field, records] = await Promise.all([getField(id), getRecords(id)]);
```

---

## Glossary

| Term | Meaning |
|---|---|
| API | A URL that returns data (JSON) instead of a web page |
| async/await | Syntax for waiting on slow operations without freezing the page |
| AWC | Available Water Capacity – water a soil holds per metre of depth (mm/m) |
| Bund | The small earth wall around a rice paddy |
| CRUD | Create, Read, Update, Delete |
| Deficit (D) | How much water the root zone is missing (mm) |
| DOM | The browser's live, editable version of the HTML |
| DSP | Days since planting |
| ES module | A JS file that uses `import` / `export` |
| ET₀ / ETc | Reference / crop evapotranspiration (mm/day) |
| FAO-56 | The UN Food and Agriculture Organization guide our formulas come from |
| fetch | The browser function for making HTTP requests |
| Kc | Crop coefficient – how thirsty the crop is compared with grass |
| JSON | Text format for data, looks like a JS object |
| Promise | A "result coming later" object returned by `fetch` |
| RAW / TAW | Readily / Total Available Water in the root zone (mm) |
| REST | A style of API where URLs are things and HTTP methods are actions |
| Seepage | Water leaking downward / sideways out of a paddy |
| SPA | Single-Page Application – one HTML page, JS swaps the content |

---

## Suggested learning order (if you have about a week before coding)
1. HTML forms and CSS Grid/Flexbox (MDN Web Docs: developer.mozilla.org)
2. JS basics: variables, functions, arrays (`map`, `filter`, `reduce`), objects
3. DOM: `querySelector`, `addEventListener`, `createElement`
4. `fetch` + `async/await` + `try/catch`. Practise with the Open-Meteo URL above in the console
5. ES modules and Live Server
6. Read REQUIREMENTS.md §4–§7 (the models) with Part 10 of this guide open next to it
