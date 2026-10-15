# AquaPlan – Requirements Specification

**AquaPlan – A Farm Weather & Irrigation Planner**
INFO 251 001 – Web Development II, American University of Phnom Penh
Team: Ravy Lang, Kithya Tes, Menghong Ing, Sivhuy Hong, Hak Sokhai
Instructor: Monyrath BUNTOUN

> This is the working specification for the course prototype. The agronomic values are
> practical defaults based on FAO-56. They are **not** validated recommendations for real farms.

---

## 1. Overview

AquaPlan is a single-page web application (SPA) that tells farmers **when** to irrigate a field and
**how much** water to apply, so they don't have to rely on habit. The user registers a field (crop,
area, soil, planting date, location). The app downloads weather and reference evapotranspiration (ET₀)
for that location and produces a **7-day irrigation plan**.

There are two calculation models:

| Crop type | Model | What is tracked |
|---|---|---|
| Paddy rice | **Water-depth model** | Depth of ponded water in the paddy (mm) |
| Maize, Soybean, Cassava | **Soil-moisture-deficit model** | Water missing from the root zone (mm) |

### Technology constraints
- Vanilla HTML, CSS and JavaScript (ES modules). **No frontend framework.**
- Chart.js may be used for charts **if the instructor allows it**. Otherwise use SVG or Canvas.
- External APIs: **Open-Meteo** (weather and geocoding), **MockAPI.io** (data storage).
- No login. All users share one MockAPI dataset (demo use only).

### Still to confirm with the instructor
- [ ] Grading rubric and submission deadline
- [ ] Whether Chart.js (or any external library) is allowed
- [ ] Whether deployment is required (GitHub Pages / Netlify)
- [ ] Team member responsibilities

---

## 2. Functional Requirements

| ID | Requirement |
|---|---|
| FR-1 | Create, read, update and delete **fields**. |
| FR-2 | Validate field forms in the browser before saving (rules in §8). |
| FR-3 | Search for a location by place name (Open-Meteo Geocoding) and store the chosen result's name, latitude and longitude. |
| FR-4 | Fetch past and forecast daily rainfall and ET₀ for each field's coordinates (Open-Meteo Forecast). |
| FR-5 | Select the model automatically from the crop type (rice → water depth; maize/soybean/cassava → soil deficit). |
| FR-6 | Calculate crop evapotranspiration `ETc = Kc × ET₀`, with Kc adjusted by growth stage (§4). |
| FR-7 | **Rice:** record measured water depth (entered in cm, stored in mm), project the depth 7 days ahead, and recommend a refill (§6). |
| FR-8 | **Upland:** keep a daily soil-water balance and recommend irrigation when the deficit reaches RAW (§5). |
| FR-9 | Show a 7-day plan with one status per day: **IRRIGATE / SKIP (rain) / MONITOR / OK** (§7). |
| FR-10 | Show water amounts in **mm**, and also in **m³** when the area is known (`m³ = mm × areaHa × 10`). |
| FR-11 | Show a chart of the rice water depth (history plus projection, with refill and target lines). |
| FR-12 | Create, read, update and delete **irrigation records** and **depth readings**. |
| FR-13 | Compare the farmer's **usual** amount and **actual** recorded amounts against the **recommended** amount (§9). |
| FR-14 | Dashboard listing every field with its crop, today's status and the next recommended action. |
| FR-15 | Special statuses: **Not planted yet** (planting date in the future) and **Season finished** (past the total season length). |

## 3. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | SPA with hash-based routing (`#/dashboard`, `#/fields/new`, `#/fields/:id`, `#/fields/:id/edit`, `#/fields/:id/records`). |
| NFR-2 | Responsive layout from 360 px (phone) to desktop. |
| NFR-3 | A loading indicator for every network request. |
| NFR-4 | Clear error messages for network failure, API errors, missing data and empty lists. The app must never show a blank screen. |
| NFR-5 | All API calls use `async/await` with `try/catch`. |
| NFR-6 | Weather responses are cached per field in `sessionStorage` for 1 hour. |
| NFR-7 | Calculation code (`js/models/`) is made of pure functions with no DOM or network access, so it can be tested on its own. |
| NFR-8 | Only **inputs** are stored (fields, records, readings). Calculated state (deficit, projected depth) is recomputed every time and never saved. |

---

## 4. Crop Coefficients (Kc)

`ETc = Kc × ET₀` (mm/day)

Kc changes with **days since planting (DSP)** across four FAO-56 stages:

```
Stage boundaries: L1 = ini, L2 = L1 + dev, L3 = L2 + mid, L4 = L3 + late (total season)

DSP < L1            → Kc = Kc_ini
L1 ≤ DSP < L2       → Kc = Kc_ini + (DSP − L1) / dev  × (Kc_mid − Kc_ini)
L2 ≤ DSP < L3       → Kc = Kc_mid
L3 ≤ DSP ≤ L4       → Kc = Kc_mid + (DSP − L3) / late × (Kc_end − Kc_mid)
DSP > L4            → Season finished (no recommendation)
DSP < 0             → Not planted yet
```

### Default crop table (approximate FAO-56 values; verify against FAO-56 Tables 11, 12 and 22 and cite them)

| Crop | Kc_ini | Kc_mid | Kc_end | ini | dev | mid | late | Total days | Zr (m) | p |
|---|---|---|---|---|---|---|---|---|---|---|
| Rice (paddy) | 1.05 | 1.20 | 0.90 | 30 | 30 | 60 | 30 | 150 | – | – |
| Maize | 0.30 | 1.20 | 0.50 | 20 | 35 | 40 | 30 | 125 | 1.0 | 0.55 |
| Soybean | 0.40 | 1.15 | 0.50 | 15 | 15 | 40 | 15 | 85 | 0.6 | 0.50 |
| Cassava (year 1) | 0.30 | 0.80 | 0.30 | 20 | 40 | 90 | 60 | 210 | 0.7 | 0.35 |

Zr = root depth. p = share of TAW the crop can use before it is stressed.
More crops can be added later by adding a row to `js/models/constants.js`.

---

## 5. Upland Model – Soil Moisture Deficit

### Soil parameters

| Soil type | AWC (mm water per m soil) |
|---|---|
| Sand | 80 |
| Sandy loam | 120 |
| Loam | 160 |
| Clay loam | 170 |
| Clay | 190 |

```
TAW = AWC × Zr          (Total Available Water, mm)
RAW = p × TAW           (Readily Available Water, mm)
```
`Zr` and `p` default to the crop table but can be changed per field. Zr stays fixed for the whole season.

### Daily balance
```
Peff[i] = 0.8 × P[i]                                   (effective rainfall)
D[i]    = clamp( D[i-1] + ETc[i] − Peff[i] − I[i], 0, TAW )
```
- `D` = root-zone deficit (mm). 0 means the soil is at field capacity (full).
- `P` = rainfall, `I` = irrigation (mm). Anything that would push D below 0 drains away.

### Starting state
1. Start at the **planting date** with `D = 0`.
2. If the planting date is more than 92 days ago, start at **today − 92 days** with `D = 0` (Open-Meteo `past_days` limit) and show this assumption in the UI.
3. Replay the past days using **observed** weather, adding each recorded irrigation on its date.
4. Continue for 7 forecast days (§7).

### Recommendation
- **Irrigate** when `D ≥ RAW`. Recommended net amount = `D` (refills the soil to field capacity).
- **Monitor** when `D ≥ 0.7 × RAW`.
- Optional: field efficiency `e` (e.g. 0.7) → gross amount = net ÷ e.

---

## 6. Rice Model – Water Depth

### Field parameters (configurable, with defaults)

| Parameter | Default | Allowed range |
|---|---|---|
| Seepage + percolation `S` | 4 mm/day | 2–6 mm/day |
| Refill threshold | 0 mm | 0 ≤ value < target |
| Target depth | 50 mm | refill < value ≤ bund |
| Bund height (max depth) | 100 mm | ≥ target |

### Daily projection
```
S[i] = seepage   if d[i-1] > 0, else 0
d[i] = min( bund, max( 0, d[i-1] + P[i] + I[i] − ETc[i] − S[i] ) )
```
- Rice uses **100% of rainfall**, capped by the bund height. Water above the bund runs off.
- Depth is clamped at 0, which the app shows as "dry / below surface".

### Starting state
- The **latest depth reading** is the checkpoint. Project forward from it using observed weather (past days) and then forecast weather, adding any irrigation recorded after the reading.
- If there is no reading, ask the user to enter the current depth before showing a plan.

### Recommendation
- **Refill** when the projected `d ≤ refill threshold`. Recommended amount = `target − d`.
- **Monitor** when `d ≤ refill threshold + 10 mm`.

### Out of scope
- Water for land preparation / puddling (≈150–250 mm).
- Alternate wetting and drying (AWD). Possible future enhancement.

---

## 7. 7-Day Plan and Status Rules

For each forecast day `i` (day 0 = today):

```
need   = (upland) D[i] ≥ RAW        | (rice) d[i] ≤ refillThreshold
amount = (upland) D[i]              | (rice) target − d[i]
rain2  = effective rain forecast on days i+1 and i+2
         (upland: 0.8 × P, rice: P)

if need and rain2 ≥ amount         → SKIP      ("Rain expected, skip irrigation")
else if need                       → IRRIGATE  (show amount in mm and m³)
else if (upland) D[i] ≥ 0.7 × RAW
     or (rice)   d[i] ≤ refill + 10 → MONITOR
else                               → OK
```

**Important:** when a day is IRRIGATE, the simulation **assumes the amount is applied** that day and
continues from the refilled state. Otherwise every day after the first trigger would also say IRRIGATE.

Field-level statuses that replace the plan: **Not planted yet**, **Season finished**,
**Needs depth reading** (rice with no reading), **Weather unavailable** (API error).

---

## 8. Validation Rules

| Field | Rule |
|---|---|
| Name | Required, 2–50 characters |
| Crop | Required, one of `rice`, `maize`, `soybean`, `cassava` |
| Area (ha) | Required, number > 0 and ≤ 1000 |
| Planting date | Required, valid date, ≤ today + 30 days |
| Location | Must be chosen from the geocoding results (lat/lon present) |
| Soil type | Required for upland crops |
| Root depth Zr | 0.1–2.0 m |
| p | 0.1–0.9 |
| Seepage | 2–6 mm/day (rice) |
| Refill / target / bund | `0 ≤ refill < target ≤ bund ≤ 300` (rice) |
| Usual amount | Optional, ≥ 0 mm |
| Usual interval | Optional, integer 1–60 days (required if usual amount is set) |
| Record date | Required, not in the future, not before the planting date |
| Irrigation amount | Required, > 0. Entered in mm **or** m³, stored as mm |
| Depth reading | Required, 0–30 cm (stored as mm) |

Show errors next to each input, and keep the submit button from saving until every field is valid.

---

## 9. Usual vs Actual vs Recommended

- **Usual:** the farmer's habit, stored on the field as `usualAmountMm` per irrigation and `usualIntervalDays`.
  `usualWeeklyMm = usualAmountMm × 7 ÷ usualIntervalDays`
- **Recommended:** the total of IRRIGATE amounts in the 7-day plan. On each irrigation record, the
  recommendation at the time it was created is saved as `recommendedMm`.
- **Actual:** `amountMm` from irrigation records.

Views:
1. **Weekly:** usual weekly mm vs recommended weekly mm (difference in mm, m³ and %).
2. **Per record:** actual vs `recommendedMm` (over / under / on target, ±10% counts as on target).

---

## 10. Data Model (MockAPI.io, 2 resources)

### `fields`
```json
{
  "id": "1",
  "name": "North paddy",
  "cropType": "rice",
  "plantingDate": "2026-09-01",
  "areaHa": 1.5,
  "soilType": "clay",
  "rootDepthM": null,
  "p": null,
  "locationName": "Battambang, Cambodia",
  "lat": 13.1027,
  "lon": 103.1982,
  "usualAmountMm": 40,
  "usualIntervalDays": 5,
  "seepageMmDay": 4,
  "refillMm": 0,
  "targetMm": 50,
  "bundMm": 100,
  "createdAt": "2026-09-01T08:00:00Z"
}
```
Rice-only properties are `null` for upland crops, and the upland-only properties (`rootDepthM`, `p`) are `null` for rice.

### `records`
```json
{
  "id": "1",
  "fieldId": "1",
  "date": "2026-10-10",
  "type": "irrigation",
  "amountMm": 45,
  "depthMm": null,
  "recommendedMm": 50,
  "note": "Pumped from canal"
}
```
`type` is `"irrigation"` (uses `amountMm`) or `"depthReading"` (uses `depthMm`).
Fetch the records for one field with `GET /records?fieldId=1`. MockAPI matches filters partially
("contains"), so keep only exact `fieldId` matches in JS, and treat a 404 on a list as an empty list.
See [MOCKAPI_SETUP.md](MOCKAPI_SETUP.md) §7.

Architecture and diagrams: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 11. External API Calls

**Geocoding**
```
GET https://geocoding-api.open-meteo.com/v1/search?name={query}&count=5&language=en&format=json
```

**Forecast + recent history**
```
GET https://api.open-meteo.com/v1/forecast
    ?latitude={lat}&longitude={lon}
    &daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min
    &past_days={0..92}&forecast_days=7
    &timezone=Asia/Phnom_Penh
```

**MockAPI** (base URL from your MockAPI project, e.g. `https://<id>.mockapi.io/api/v1`)
```
GET    /fields            POST   /fields
GET    /fields/:id        PUT    /fields/:id      DELETE /fields/:id
GET    /records?fieldId=  POST   /records
PUT    /records/:id       DELETE /records/:id
```
Deleting a field must also delete its records (loop over them and send DELETE for each).

---

## 12. Project Structure

```
FinalProject/
├── index.html
├── css/styles.css
└── js/
    ├── main.js              # start-up + hash router
    ├── config.js            # MockAPI base URL, constants
    ├── state.js             # in-memory cache of fields/records
    ├── api/
    │   ├── openMeteo.js     # geocode(), getWeather()
    │   └── mockApi.js       # CRUD for fields and records
    ├── models/
    │   ├── constants.js     # crop table, soil AWC, defaults
    │   ├── kc.js            # getKc(crop, dsp)
    │   ├── upland.js        # runUplandBalance()
    │   ├── rice.js          # runRiceProjection()
    │   └── plan.js          # buildPlan() → statuses
    ├── views/
    │   ├── dashboard.js
    │   ├── fieldForm.js
    │   ├── fieldDetail.js
    │   └── records.js
    └── utils/
        ├── validation.js
        ├── format.js        # mm ↔ m³, dates
        └── ui.js            # showLoading(), showError()
```

---

## 13. Test Cases for the Models (calculated by hand)

| # | Input | Expected |
|---|---|---|
| T1 | Maize, DSP 60 (mid stage), ET₀ 5 mm/day, no rain, 3 days, D₀ = 0 | Kc 1.20 → ETc 6 → D = 18 mm |
| T2 | Maize, loam: TAW = 160 × 1.0 = 160, RAW = 0.55 × 160 = 88 | D = 62 → MONITOR (≥ 61.6). D = 88 → IRRIGATE 88 mm |
| T3 | Upland, D = 10, rain 20 mm | Peff = 16 → D = clamp(10 + ETc − 16) = 0 if ETc ≤ 6 |
| T4 | Rice, d = 50, ETc 6, S 4, no rain, 5 days | 40, 30, 20, 10, 0 → refill on day 5, amount 50 mm |
| T5 | Rice, d = 80, rain 60 mm, bund 100 | d = min(100, 80 + 60 − ETc − S) = 100 (overflow) |
| T6 | Maize, DSP 37 (dev stage, L1 = 20, dev = 35) | Kc = 0.30 + 17/35 × 0.90 = 0.737 |
| T7 | 30 mm on 1.5 ha | 30 × 1.5 × 10 = 450 m³ |
| T8 | Planting date tomorrow | Status "Not planted yet" |

---

## 14. Milestones

| # | Milestone | Done when |
|---|---|---|
| M1 | Setup | Folders created, MockAPI resources made, both API wrappers return data in the console |
| M2 | Field management | Field CRUD, location search and validation all work |
| M3 | Weather | Field detail page shows 7-day weather, with loading and error states |
| M4 | Models | Kc, upland and rice models pass tests T1–T8. 7-day plan table shown |
| M5 | Records | Irrigation and depth-reading CRUD done. Comparison view done |
| M6 | Polish | Rice chart, dashboard cards, responsive layout tested on a phone, deployed |

## 15. Future Enhancements (not required)
Map picking (Leaflet), browser GPS, AWD rice mode, roots that deepen over the season, more crops,
Khmer translation, user accounts.
