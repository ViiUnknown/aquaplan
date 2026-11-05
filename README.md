# AquaPlan – Farm Weather & Irrigation Planner

A single-page web app (vanilla JavaScript, no framework) that tells farmers **when** to water a field
and **how much**, using live rain and evapotranspiration data and the FAO-56 water-balance method.

**Live demo:** https://viiunknown.github.io/aquaplan/

Team: Ravy Lang, Kithya Tes, Menghong Ing, Sivhuy Hong, Hak Sokhai
Course: INFO 251 001 – Web Development II, American University of Phnom Penh · Instructor: Monyrath BUNTOUN

## Features

- **Fields:** add, edit and delete fields (crop, area, soil, planting date, location). All forms are validated in the browser.
- **Location:** search a place by name, click it on a map, or use the phone's GPS.
- **7-day plan:** one status per day (**Water today / Wait for the rain / Check your field / No water needed**) with the amount to apply.
- **Two crop models:**
  - Paddy rice: the app tracks the depth of water in the paddy, starting from a ruler reading.
  - Maize, soybean and cassava: the app tracks how much water the soil is missing.
- **Amounts farmers understand:** cm of water (rice), m³, and **hours to run the pump** (from the pump's flow, or by timing how long it takes to fill a 200 L drum).
- **Records:** log each watering and each rice depth reading (add, edit, delete).
- **Usual vs recommended:** compare the farmer's habit with what the plan recommends.
- **Dashboard:** every field with today's status. Also a water-depth chart, light and dark mode, and a phone-friendly layout.

## APIs

| API | Used for | Methods |
|---|---|---|
| [Open-Meteo Forecast](https://open-meteo.com/en/docs) | Past and forecast rain, ET₀, temperature | GET |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | Place name → coordinates | GET |
| [OpenStreetMap tiles](https://www.openstreetmap.org/copyright) + [Leaflet 1.9.4](https://leafletjs.com/) | Map for picking a location | GET (tiles) |
| [Nominatim](https://nominatim.org/release-docs/latest/api/Reverse/) | Map point → place name | GET |
| [MockAPI.io](https://mockapi.io) | Stores `fields` and `records` | **GET, POST, PUT, DELETE** |

Open-Meteo is read-only, so MockAPI provides the write requests, as the project guidelines allow.

## Run locally

Browsers block ES modules on `file://`, so open the app through a local server:

```
npx serve . -l 3000        →  http://localhost:3000
```
Another option is `python -m http.server 3000`.

## Tests

```
npm test                    # 24 tests for the calculation models (Node)
```
You can also open `http://localhost:3000/tests/` to run the same tests in the browser.

## Project structure

```
index.html        page shell (header, nav, main, footer)
css/styles.css    all styles (light and dark themes, responsive)
js/main.js        start-up and hash router
js/api/           fetch wrappers: openMeteo, nominatim, mockApi, http
js/models/        pure calculation code (Kc, upland, rice, 7-day plan)
js/services/      combines field + records + weather into a plan; demo data
js/views/         one file per page + shared components and the chart
js/utils/         dates, unit conversion, validation, safe HTML
tests/            model tests
```

## Documentation

- [REQUIREMENTS.md](REQUIREMENTS.md): functional requirements, formulas and validation rules
- [ARCHITECTURE.md](ARCHITECTURE.md): diagrams, data model, request flows, error handling
- [EXPLANATION.md](EXPLANATION.md): background on the irrigation method
- [SETUP_AND_DEPLOY.md](SETUP_AND_DEPLOY.md): setup and GitHub Pages deployment

## Limitations

- No login. Everyone using the live demo shares the same MockAPI data.
- The calculations use simplified FAO-56 defaults. This is a course prototype, not agronomic advice.
