# AquaPlan – System Architecture

This document describes how AquaPlan is organised: the parts of the system, how they talk to each
other, how data is stored in MockAPI, and what happens step by step for the main user actions.

> **Viewing the diagrams:** the diagrams use **Mermaid**. GitHub renders them automatically. In VS Code,
> install the extension **"Markdown Preview Mermaid Support"** (by Matt Bierner), then press
> `Ctrl+Shift+V` to open the preview. You can also paste any diagram into https://mermaid.live.

Related documents: [REQUIREMENTS.md](REQUIREMENTS.md) · [EXPLANATION.md](EXPLANATION.md) · [MOCKAPI_SETUP.md](MOCKAPI_SETUP.md)

---

## 1. Architecture at a glance

AquaPlan is a **client-only single-page application**. All application logic (routing, validation,
irrigation calculations, rendering) runs **in the user's browser**. There is no custom server.
Two external services are used:

| Service | Role | Auth | Data direction |
|---|---|---|---|
| **Open-Meteo Geocoding** | Place name → latitude/longitude | None | Read only |
| **Open-Meteo Forecast** | Past and forecast rain + ET₀ | None | Read only |
| **MockAPI.io** | Stores `fields` and `records` (our "database") | None (public URL) | Read + write |

Key design choices:
1. **Layered code:** UI (views) → services (API wrappers, models) → external APIs. Each layer only calls the layer below it.
2. **Pure calculation core:** `js/models/` has no DOM or `fetch`, so it is easy to test.
3. **Store inputs, compute outputs:** MockAPI holds only what the user entered. Deficits, depths and plans are recalculated on every view.
4. **Hash routing:** one `index.html`. The `#/...` part of the URL decides which view is shown.

---

## 2. System context diagram

Who and what interacts with AquaPlan.

```mermaid
flowchart LR
    farmer(["👩‍🌾 Farmer / User"])

    subgraph browser["User's browser"]
        app["AquaPlan SPA<br/>HTML + CSS + Vanilla JS"]
        cache[("sessionStorage<br/>weather cache")]
    end

    geo["Open-Meteo<br/>Geocoding API"]
    wx["Open-Meteo<br/>Forecast API"]
    mock[("MockAPI.io<br/>fields · records")]

    farmer -- "uses" --> app
    app -- "GET place search" --> geo
    app -- "GET daily rain + ET0" --> wx
    app -- "GET / POST / PUT / DELETE" --> mock
    app <--> cache
```

---

## 3. Deployment diagram

Where each piece runs.

```mermaid
flowchart TB
    subgraph host["Static hosting: GitHub Pages / Netlify / Live Server"]
        files["index.html<br/>css/styles.css<br/>js/**/*.js"]
    end

    subgraph client["Browser: phone or desktop"]
        runtime["JavaScript runtime<br/>runs AquaPlan"]
    end

    subgraph cloud["Third-party cloud APIs (HTTPS, JSON)"]
        om["api.open-meteo.com<br/>geocoding-api.open-meteo.com"]
        ma["&lt;project-id&gt;.mockapi.io/api/v1"]
    end

    host -- "1 download static files" --> client
    client -- "2 fetch() weather" --> om
    client -- "3 fetch() CRUD" --> ma
```

The host only serves files; it runs no code. All requests to Open-Meteo and MockAPI go **directly
from the browser** to those services (both allow cross-origin requests).

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
        state["state.js<br/>in-memory cache"]
    end

    subgraph L2["Service layer"]
        subgraph api["js/api/"]
            om["openMeteo.js<br/>geocode · getWeather"]
            ma["mockApi.js<br/>fields + records CRUD"]
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
    api --> cfg["config.js<br/>MOCKAPI_BASE"]
```

### Module responsibilities

| Module | Responsibility | May use | Must NOT use |
|---|---|---|---|
| `main.js` | Listens for `hashchange` and calls the matching view | views | fetch directly |
| `views/*` | Build HTML, handle events, call services, show loading/errors | api, models, utils, state | — |
| `api/openMeteo.js` | Build Open-Meteo URLs, fetch, reshape arrays into day objects, cache | config, `sessionStorage` | DOM |
| `api/mockApi.js` | One function per CRUD action, throw on non-2xx | config | DOM |
| `models/*` | Kc, water balance, projection, plan statuses | constants | DOM, fetch, storage |
| `utils/validation.js` | Return `{field: message}` error maps | — | fetch |
| `utils/format.js` | mm ↔ m³, cm ↔ mm, date formatting | — | — |
| `utils/ui.js` | Spinner, error banner, empty state, HTML escaping | DOM | fetch |
| `state.js` | Hold the last-loaded fields/records so the UI doesn't refetch on every click | — | — |

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

## 6. Data architecture (MockAPI)

### 6.1 Entity-relationship diagram

One **field** has many **records**. A record is either an irrigation event or a rice depth reading.

```mermaid
erDiagram
    FIELDS ||--o{ RECORDS : "has many"

    FIELDS {
        string id PK "auto by MockAPI"
        date createdAt "auto by MockAPI"
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
    }

    RECORDS {
        string id PK "auto by MockAPI"
        date createdAt "auto by MockAPI"
        string fieldId FK "points to FIELDS.id"
        string date "YYYY-MM-DD"
        string type "irrigation | depthReading"
        number amountMm "irrigation only"
        number depthMm "depthReading only"
        number recommendedMm "snapshot at save time"
        string note "optional"
    }
```

### 6.2 What is stored vs what is calculated

```mermaid
flowchart LR
    subgraph stored["Stored in MockAPI (user inputs)"]
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

Base URL: `https://<project-id>.mockapi.io/api/v1`

```mermaid
flowchart LR
    base["/api/v1"] --> fields["/fields"]
    base --> records["/records"]
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
| POST | `/fields` | field JSON (no id) | 201 + created object | new form |
| PUT | `/fields/:id` | full field JSON | 200 + updated object | edit form |
| DELETE | `/fields/:id` | – | 200 + deleted object | detail (after deleting its records) |
| GET | `/records?fieldId=:id` | – | 200 + array (**filter exactly in JS**, see MOCKAPI_SETUP §7) | detail, records |
| POST | `/records` | record JSON | 201 | records |
| PUT | `/records/:id` | full record JSON | 200 | records |
| DELETE | `/records/:id` | – | 200 | records |

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
    participant MA as mockApi.js
    participant M as MockAPI.io

    U->>V: types "Battambang", clicks Search
    V->>OM: geocode("Battambang")
    OM->>G: GET /v1/search?name=Battambang&count=5
    G-->>OM: { results: [...] }
    OM-->>V: list of places
    V-->>U: show results list
    U->>V: picks a place (stores lat/lon), fills form, clicks Save
    V->>VAL: validateField(formData)
    alt has errors
        VAL-->>V: { areaHa: "must be > 0" }
        V-->>U: show messages under inputs
    else valid
        V->>MA: createField(formData)
        MA->>M: POST /fields
        M-->>MA: 201 { id: "7", ... }
        MA-->>V: new field
        V-->>U: redirect to #/fields/7
    end
```

### 7.2 Open a field's detail page (the main flow)

```mermaid
sequenceDiagram
    actor U as Farmer
    participant R as main.js router
    participant V as fieldDetail.js
    participant MA as mockApi.js
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
    participant MA as mockApi.js
    participant M as MockAPI.io

    U->>V: enters date + amount (mm or m³), Save
    V->>V: validate, convert m³ to mm
    V->>MOD: recommendation for that date
    MOD-->>V: recommendedMm
    V->>MA: createRecord({fieldId, date, type:"irrigation", amountMm, recommendedMm})
    MA->>M: POST /records
    M-->>MA: 201 record
    V-->>U: list updated, comparison recalculated
```

### 7.4 Delete a field (manual cascade)

MockAPI does not delete child data automatically when used with a flat `records` resource, so the app does it:

```mermaid
sequenceDiagram
    actor U as Farmer
    participant V as fieldDetail.js
    participant MA as mockApi.js
    participant M as MockAPI.io
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
    plan --> out["IRRIGATE / SKIP / MONITOR / OK<br/>+ amount mm and m³"]
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
| No internet / DNS failure (`fetch` rejects) | view `try/catch` | "You appear to be offline." + **Retry** |
| MockAPI 404 on `/fields/:id` | view | "Field not found." + link to dashboard |
| MockAPI 404 on a filtered list | `mockApi.js` | Treated as an empty list `[]` (see MOCKAPI_SETUP §7) |
| MockAPI 429 / 5xx | view | "Storage service is busy, try again." + **Retry** |
| Open-Meteo error / missing `daily` | view | Field info still shown. Plan area says "Weather unavailable" |
| Geocoding has no `results` | form | "No places found, try another spelling." |
| Validation errors | form | Messages under each input. Nothing is sent |
| Rice field with no depth reading | detail | "Enter today's water depth to see a plan" + input |

All API wrappers **throw** on a non-2xx status. Views decide how to show the error. That keeps the
messages in one place and the API code simple.

---

## 10. Security and limitations (state these in your report)

- MockAPI endpoints are **public**: anyone with the URL can read or change data. Acceptable for a demo only.
- No authentication. All users share one dataset.
- User-typed text is shown with `textContent` (or escaped) to prevent HTML/script injection.
- Calculations are simplified FAO-56 defaults, **not** agronomic advice.
- Free API tiers have limits on resources and requests, so caching reduces calls.
