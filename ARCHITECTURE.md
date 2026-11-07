# AquaPlan – System Architecture

This document describes how AquaPlan is organised: the parts of the system, how they talk to each
other, how data is stored in the local Mockoon API, and what happens step by step for the main user actions.

> **Viewing the diagrams:** the diagrams use **Mermaid**. GitHub renders them automatically. In VS Code,
> install the extension **"Markdown Preview Mermaid Support"** (by Matt Bierner), then press
> `Ctrl+Shift+V` to open the preview. You can also paste any diagram into https://mermaid.live.

Related documents: [REQUIREMENTS.md](REQUIREMENTS.md) · [EXPLANATION.md](EXPLANATION.md)

---

## 1. Architecture at a glance

AquaPlan is a **client-only single-page application**. All application logic (routing, validation,
irrigation calculations, rendering) runs **in the user's browser**. There is no custom server.
These external services are used:

| Service | Role | Auth | Data direction |
|---|---|---|---|
| **Open-Meteo Geocoding** | Place name → latitude/longitude | None | Read only |
| **Open-Meteo Forecast** | Past and forecast rain + ET₀ | None | Read only |
| **OpenStreetMap tiles** (via Leaflet 1.9.4 from cdnjs) | Map for picking a field's location | None | Read only |
| **Nominatim** (OpenStreetMap) | Map point → place name (reverse geocoding) | None | Read only |
| **Browser Geolocation API** | "Use my location" button | User permission | Read only |
| **Mockoon** (local, `localhost:3001`) | Stores `fields`, `records` and `messages` (our "database") | None (only on this computer) | Read + write |

Key design choices:
1. **Layered code:** UI (views) → services (API wrappers, models) → external APIs. Each layer only calls the layer below it.
2. **Pure calculation core:** `js/models/` has no DOM or `fetch`, so it is easy to test.
3. **Store inputs, compute outputs:** Mockoon holds only what the user entered. Deficits, depths and plans are recalculated on every view.
4. **Hash routing:** one `index.html`. The `#/...` part of the URL decides which view is shown.
5. **Store mm, show farmer units:** water amounts are always stored in mm and converted for display to cm, m³ or pump hours.

---

## 2. System context diagram

Who and what interacts with AquaPlan.

```mermaid
flowchart LR
    farmer(["👩‍🌾 Farmer / User"])

    subgraph browser["User's browser"]
        app["AquaPlan SPA<br/>HTML + CSS + Vanilla JS"]
        cache[("sessionStorage<br/>weather cache")]
        theme[("localStorage<br/>light/dark choice")]
        gps["Geolocation API"]
    end

    geo["Open-Meteo<br/>Geocoding API"]
    wx["Open-Meteo<br/>Forecast API"]
    osm["OpenStreetMap<br/>map tiles"]
    nom["Nominatim<br/>reverse geocoding"]
    mock[("Mockoon (localhost:3001)<br/>fields · records · messages")]

    farmer -- "uses" --> app
    app -- "GET place search" --> geo
    app -- "GET daily rain + ET0" --> wx
    app -- "GET tiles (Leaflet)" --> osm
    app -- "GET place name for a map point" --> nom
    app -- "GET / POST / PUT / DELETE" --> mock
    app <--> cache
    app <--> theme
    app --> gps
```

---

## 3. Deployment diagram (local only)

Where each piece runs. Everything except the weather and the map runs on one computer.

```mermaid
flowchart TB
    subgraph pc["The farmer's / presenter's computer"]
        web["Web server (npm start)<br/>localhost:3000<br/>index.html · css · js"]
        mock["Mockoon (npm run api)<br/>localhost:3001/api<br/>mockoon/aquaplan.json"]
        runtime["Browser<br/>runs AquaPlan"]
    end

    subgraph cloud["Internet APIs (HTTPS, JSON)"]
        om["api.open-meteo.com<br/>geocoding-api.open-meteo.com"]
        map["tile.openstreetmap.org<br/>nominatim.openstreetmap.org"]
        cdn["cdnjs.cloudflare.com<br/>Leaflet library"]
    end

    web -- "1 download static files" --> runtime
    cdn -- "1b download Leaflet" --> runtime
    runtime -- "2 fetch() weather" --> om
    runtime -- "3 fetch() CRUD" --> mock
    runtime -- "4 map tiles + place names" --> map
```

The web server only serves files; it runs no code. **Mockoon** is a mock REST API: it answers
GET/POST/PUT/DELETE from its data buckets (in memory, reset when Mockoon restarts). CORS is on, so the
page on port 3000 may call port 3001. There is **no public deployment**: the app only works on a
computer that runs both servers.

---

## 4. Layered (logical) architecture

```mermaid
flowchart TB
    subgraph L1["Presentation layer: js/views/"]
        dash["dashboard.js"]
        form["fieldForm.js"]
        detail["fieldDetail.js"]
        recs["records.js"]
    end

    subgraph L0["Application shell"]
        main["main.js<br/>router + start-up"]
        state["state.js<br/>flash messages"]
        theme["theme.js<br/>light/dark toggle"]
    end

    subgraph L2["Service layer"]
        subgraph api["js/api/"]
            om["openMeteo.js<br/>geocode · getWeather"]
            nom["nominatim.js<br/>reverseGeocode"]
            ma["mockoon.js<br/>fields · records · messages CRUD"]
        end
        subgraph models["js/models/ (pure functions)"]
            kc["kc.js"]
            up["upland.js"]
            rice["rice.js"]
            plan["plan.js"]
            const["constants.js"]
        end
    end

    subgraph L3["Utilities: js/utils/"]
        val["validation.js"]
        fmt["format.js"]
        ui["ui.js<br/>loading / errors"]
    end

    main --> L1
    L1 --> state
    L1 --> api
    L1 --> models
    L1 --> L3
    up --> kc
    rice --> kc
    plan --> up
    plan --> rice
    kc --> const
    up --> const
    rice --> const
    api --> cfg["config.js<br/>API_BASE"]
```

### Module responsibilities

| Module | Responsibility | May use | Must NOT use |
|---|---|---|---|
| `main.js` | Listens for `hashchange` and calls the matching view | views | fetch directly |
| `views/*` | Build HTML, handle events, call services, show loading/errors | api, models, utils, state | — |
| `api/openMeteo.js` | Build Open-Meteo URLs, fetch, reshape arrays into day objects, cache | config, `sessionStorage` | DOM |
| `api/nominatim.js` | Map point → place name, cached in memory (usage policy: ≤ 1 request/second) | `http.js` | DOM |
| `api/mockoon.js` | One function per CRUD action, throw on non-2xx, mark "server not running" | config | DOM |
| `models/*` | Kc, water balance, projection, plan statuses | constants | DOM, fetch, storage |
| `utils/validation.js` | Return `{field: message}` error maps | — | fetch |
| `utils/format.js` | mm ↔ m³, cm ↔ mm, mm ↔ pump hours, drum timing → m³/h, formatting | — | — |
| `utils/ui.js` | Spinner, error banner, empty state, HTML escaping | DOM | fetch |
| `state.js` | Hold a one-time "flash" message (e.g. "Field saved") to show on the next page | — | — |
| `theme.js` | Light/dark toggle button, saves the choice in `localStorage` | DOM | fetch |

---

## 5. Routing map

```mermaid
flowchart LR
    start(("open app")) --> d["#/dashboard<br/>list of fields + today's status"]
    d -- "Add field" --> n["#/fields/new<br/>create form"]
    d -- "click a field" --> f["#/fields/:id<br/>7-day plan · chart · comparison"]
    f -- "Edit" --> e["#/fields/:id/edit<br/>edit form"]
    f -- "Records" --> r["#/fields/:id/records<br/>irrigation + depth readings"]
    n -- "saved" --> f
    e -- "saved" --> f
    r -- "back" --> f
    f -- "back" --> d
    x["unknown hash"] --> nf["Not found view"]
```

---

## 6. Data architecture (Mockoon)

### 6.1 Entity-relationship diagram

One **field** has many **records**. A record is either an irrigation event or a rice depth reading.

```mermaid
erDiagram
    FIELDS ||--o{ RECORDS : "has many"

    FIELDS {
        string id PK "UUID, made by Mockoon"
        string name
        string cropType "rice | maize | soybean | cassava"
        string plantingDate "YYYY-MM-DD"
        number areaHa
        string soilType "sand | sandyLoam | loam | clayLoam | clay"
        number rootDepthM "upland only, nullable"
        number p "upland only, nullable"
        string locationName
        number lat
        number lon
        number usualAmountMm "nullable"
        number usualIntervalDays "nullable"
        number seepageMmDay "rice only"
        number refillMm "rice only"
        number targetMm "rice only"
        number bundMm "rice only"
        number pumpM3PerHour "nullable, pump flow"
    }

    RECORDS {
        string id PK "UUID, made by Mockoon"
        string fieldId FK "points to FIELDS.id"
        string date "YYYY-MM-DD"
        string type "irrigation | depthReading"
        number amountMm "irrigation only"
        number depthMm "depthReading only"
        number recommendedMm "snapshot at save time"
        string note "optional"
    }

    MESSAGES {
        string id PK "UUID, made by Mockoon"
        string name
        string email
        string message
        string sentAt "ISO date-time"
    }
```

`messages` (contact form) is not linked to fields.

### 6.2 What is stored vs what is calculated

```mermaid
flowchart LR
    subgraph stored["Stored in Mockoon (user inputs)"]
        F["fields"]
        R["records"]
    end
    subgraph fetched["Fetched live (never stored remotely)"]
        W["weather: rain, ET0"]
    end
    subgraph computed["Computed in the browser every time"]
        K["Kc, ETc"]
        D["deficit D / depth d"]
        P["7-day plan + statuses"]
        C["comparison numbers"]
    end
    F --> K
    W --> K
    K --> D
    R --> D
    D --> P
    P --> C
    F --> C
    R --> C
```

Because derived values are never saved, editing or deleting a record can never leave the stored
data inconsistent. The next page load simply recalculates.

### 6.3 Endpoint map

Base URL: `http://localhost:3001/api` (`API_BASE` in `js/config.js`). Each path is a Mockoon **CRUD route** backed by a data bucket.

```mermaid
flowchart LR
    base["/api"] --> fields["/fields"]
    base --> records["/records"]
    base --> messages["/messages<br/>POST from the contact form"]
    fields --> f1["GET  list all"]
    fields --> f2["POST create"]
    fields --> fid["/fields/:id"]
    fid --> f3["GET  one"]
    fid --> f4["PUT  update"]
    fid --> f5["DELETE remove"]
    records --> r1["GET  list ?fieldId=...<br/>then exact match in JS"]
    records --> r2["POST create"]
    records --> rid["/records/:id"]
    rid --> r3["GET · PUT · DELETE"]
```

| Method | Path | Body | Success | Used by |
|---|---|---|---|---|
| GET | `/fields` | – | 200 + array | dashboard |
| GET | `/fields/:id` | – | 200 + object | detail, edit form |
| POST | `/fields` | field JSON (no id) | 200 + created object with a new `id` | new form |
| PUT | `/fields/:id` | full field JSON | 200 + updated object | edit form |
| DELETE | `/fields/:id` | – | 200 | detail (after deleting its records) |
| GET | `/records?fieldId=:id` | – | 200 + array (**filtered exactly in JS**, whatever the server does with the filter) | detail, records |
| POST | `/records` | record JSON | 200 | records |
| PUT | `/records/:id` | full record JSON | 200 | records |
| DELETE | `/records/:id` | – | 200 | records |
| POST | `/messages` | `{ name, email, message, sentAt }` | 200 | contact page |

---

## 7. Key interaction sequences

### 7.1 Create a field (with location search)

```mermaid
sequenceDiagram
    actor U as Farmer
    participant V as fieldForm.js
    participant OM as openMeteo.js
    participant G as Open-Meteo Geocoding
    participant VAL as validation.js
    participant MA as mockoon.js
    participant M as Mockoon

    alt search by name
        U->>V: types "Battambang", clicks Search
        V->>OM: geocode("Battambang")
        OM->>G: GET /v1/search?name=Battambang&count=6
        G-->>OM: { results: [...] }
        OM-->>V: list of places
        V-->>U: show results list, user picks one
    else click the map or "Use my location"
        U->>V: clicks a point (or GPS gives lat/lon)
        V->>V: Nominatim reverse → place name
    end
    U->>V: fills form (optional pump flow), clicks Save
    V->>VAL: validateField(formData)
    alt has errors
        VAL-->>V: { areaHa: "must be > 0" }
        V-->>U: show messages under inputs
    else valid
        V->>MA: createField(formData)
        MA->>M: POST /fields
        M-->>MA: 200 { id: "3f2a…", ... }
        MA-->>V: new field
        V-->>U: redirect to #/fields/3f2a…
    end
```

### 7.2 Open a field's detail page (the main flow)

```mermaid
sequenceDiagram
    actor U as Farmer
    participant R as main.js router
    participant V as fieldDetail.js
    participant MA as mockoon.js
    participant OM as openMeteo.js
    participant C as sessionStorage
    participant MOD as models (plan.js)

    U->>R: navigates to #/fields/7
    R->>V: render("7")
    V->>V: showLoading()
    par in parallel
        V->>MA: getField("7")
        MA-->>V: field
    and
        V->>MA: getRecords("7")
        MA-->>V: records
    end
    V->>OM: getWeather(lat, lon, pastDays)
    OM->>C: cached and < 1 hour old?
    alt cache hit
        C-->>OM: cached days
    else cache miss
        OM->>OM: GET api.open-meteo.com/v1/forecast
        OM->>C: save
    end
    OM-->>V: days[] (past + 7 forecast)
    V->>MOD: buildPlan(field, records, days)
    MOD-->>V: { history[], plan[7], summary }
    V-->>U: plan table + chart + comparison
    V->>V: hideLoading()
    Note over V: any failure → catch → showError("…", retry button)
```

### 7.3 Add an irrigation record

```mermaid
sequenceDiagram
    actor U as Farmer
    participant V as records.js
    participant MOD as plan.js
    participant MA as mockoon.js
    participant M as Mockoon

    U->>V: enters date + amount (cm or pump hours), Save
    V->>V: validate, convert cm / hours to mm
    V->>MOD: recommendation for that date
    MOD-->>V: recommendedMm
    V->>MA: createRecord({fieldId, date, type:"irrigation", amountMm, recommendedMm})
    MA->>M: POST /records
    M-->>MA: 200 record
    opt pump flow changed
        V->>MA: updateField(id, {..., pumpM3PerHour})
        MA->>M: PUT /fields/:id
    end
    V-->>U: list updated, comparison recalculated
```

### 7.4 Delete a field (manual cascade)

Mockoon CRUD routes don't know that records belong to a field, so the app deletes them first:

```mermaid
sequenceDiagram
    actor U as Farmer
    participant V as fieldDetail.js
    participant MA as mockoon.js
    participant M as Mockoon
    U->>V: Delete field → confirm()
    V->>MA: getRecords(id)
    MA->>M: GET /records?fieldId=id
    loop each record
        V->>MA: deleteRecord(r.id)
        MA->>M: DELETE /records/:rid
    end
    V->>MA: deleteField(id)
    MA->>M: DELETE /fields/:id
    V-->>U: back to #/dashboard
```

---

## 8. Calculation pipeline

```mermaid
flowchart TB
    in1["field<br/>crop, soil, plantingDate, rice settings"] --> dsp
    in2["weather days<br/>rain, ET0"] --> etc
    in3["records<br/>irrigations, depth readings"] --> sim

    dsp["days since planting"] --> chk{"DSP < 0 ?<br/>DSP > season ?"}
    chk -- "yes" --> special["Not planted yet /<br/>Season finished"]
    chk -- "no" --> kc["Kc by growth stage"]
    kc --> etc["ETc = Kc × ET0"]
    etc --> pick{"cropType == rice ?"}
    pick -- "rice" --> sim_r["rice.js<br/>depth projection from<br/>latest depth reading"]
    pick -- "upland" --> sim_u["upland.js<br/>deficit replay from<br/>planting date"]
    sim_r --> sim
    sim_u --> sim
    sim["daily state<br/>past days + 7 forecast days"] --> plan["plan.js<br/>status per forecast day"]
    plan --> out["IRRIGATE / SKIP / MONITOR / OK<br/>+ amount in cm, m³ and pump hours"]
```

### Daily status decision

```mermaid
flowchart TD
    s(["forecast day i"]) --> need{"need water?<br/>upland: D ≥ RAW<br/>rice: d ≤ refill"}
    need -- "no" --> mon{"near threshold?<br/>upland: D ≥ 0.7·RAW<br/>rice: d ≤ refill + 10"}
    mon -- "yes" --> MONITOR["🟡 MONITOR"]
    mon -- "no" --> OK["🟢 OK"]
    need -- "yes" --> rain{"effective rain on<br/>days i+1, i+2 ≥ amount?"}
    rain -- "yes" --> SKIP["🔵 SKIP (rain expected)"]
    rain -- "no" --> IRR["🔴 IRRIGATE amount"]
    IRR --> apply["assume applied:<br/>D = 0 / d = target"]
    apply --> next(["continue to day i+1"])
```

---

## 9. Error handling strategy

| Failure | Where caught | What the user sees |
|---|---|---|
| Mockoon not running (`fetch` to localhost:3001 rejects) | `mockoon.js` marks it `API_OFFLINE` → view | "Can't reach AquaPlan's data server. Start the Mockoon environment…" + **Try again** |
| No internet (Open-Meteo `fetch` rejects) | view `try/catch` | "Network error. Check your internet connection…" + **Try again** |
| Mockoon 404 on `/fields/:id` | view | "Not found. It may have been deleted." |
| 404 on a list | `mockoon.js` | Treated as an empty list `[]` |
| 5xx | view | "The service is having problems right now." + **Try again** |
| Open-Meteo error / missing `daily` | view | Field info still shown. Plan area says "Weather unavailable" |
| Geocoding has no `results` | form | "No places found, try another spelling." |
| Nominatim fails for a map click | form | The coordinates are used as the place name |
| GPS denied or unavailable | form | "Could not get your location. Tap the map instead." |
| Leaflet / map fails to load | form | "The map could not load… Use the search below instead." |
| Validation errors | form | Messages under each input. Nothing is sent |
| Rice field with no depth reading | detail | "Enter today's water depth to see a plan" + input |

All API wrappers **throw** on a non-2xx status. Views decide how to show the error. That keeps the
messages in one place and the API code simple.

---

## 10. Security and limitations (state these in your report)

- Data is stored by **Mockoon on the local computer** only, so nobody on the internet can read or change it.
- Data is kept in memory and **reset when Mockoon restarts** (use "Load demo data").
- No authentication. Everyone using the same computer shares one dataset.
- Local only: there is no public link; a demo needs both servers running.
- User-typed text is shown with `textContent` (or escaped) to prevent HTML/script injection.
- Calculations are simplified FAO-56 defaults, **not** agronomic advice.
- Open-Meteo's free tier has request limits, so weather is cached for 1 hour.
- Nominatim allows about 1 request per second, so map-click names are cached (≈100 m grid).
