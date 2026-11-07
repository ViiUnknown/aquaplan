# AquaPlan – Farm Weather & Irrigation Planner

A single-page web app (vanilla JavaScript, no framework) that tells farmers **when** to water a field
and **how much**, using live rain and evapotranspiration data and the FAO-56 water-balance method.

Runs **locally**: the website on `localhost:3000` and a [Mockoon](https://mockoon.com) mock API on `localhost:3001`.

Team: Ravy Lang, Kithya Tes, Menghong Ing, Sivhuy Hong, Hak Sokhai
Course: INFO 251 001 – Web Development II, American University of Phnom Penh · Instructor: Monyrath BUNTOUN

## Features

- **Accounts and roles:** register and log in. A **user** sees only their own fields. An **admin** also gets an Admin page to change roles, delete users (with their fields), see every field and read contact messages. Passwords are stored as salted SHA-256 hashes (prototype level, see Limitations).
- **Information pages:** Home, Our purpose, How it works, About us and Contact us (the contact form is saved to Mockoon). All pages are in the ☰ menu and the footer.
- **Fields:** add, edit and delete fields (crop, area, soil, planting date, location). All forms are validated in the browser.
- **Location:** search a place by name, click it on a map, or use the phone's GPS.
- **7-day plan:** one status per day (**Water today / Wait for the rain / Check your field / No water needed**) with the amount to apply.
- **Two crop models:**
  - Paddy rice: the app tracks the depth of water in the paddy, starting from a ruler reading.
  - Maize, soybean and cassava: the app tracks how much water the soil is missing.
- **Amounts farmers understand:** cm of water (rice), m³, and **hours to run the pump** (from the pump's flow, or by timing how long it takes to fill a 200 L drum).
- **Records:** log each watering and each rice depth reading (add, edit, delete). Rice amounts and depths can't be higher than the field wall.
- **Usual vs recommended:** compare the farmer's habit with what the plan recommends.
- **Dashboard:** every field with today's status. Also a water-depth chart, light and dark mode, and a phone-friendly layout.

## APIs

| API | Used for | Methods |
|---|---|---|
| [Open-Meteo Forecast](https://open-meteo.com/en/docs) | Past and forecast rain, ET₀, temperature | GET |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | Place name → coordinates | GET |
| [OpenStreetMap tiles](https://www.openstreetmap.org/copyright) + [Leaflet 1.9.4](https://leafletjs.com/) | Map for picking a location | GET (tiles) |
| [Nominatim](https://nominatim.org/release-docs/latest/api/Reverse/) | Map point → place name | GET |
| [Mockoon](https://mockoon.com) (local mock REST API, `mockoon/aquaplan.json`) | Stores `users`, `fields`, `records` and contact `messages` | **GET, POST, PUT, DELETE** |

Open-Meteo is read-only, so a Mockoon mock API provides the write requests, as the project guidelines allow.

## Run locally

You need Node.js. Open two terminals in the project folder:

```
npm run api      # 1. Mockoon data server  →  http://localhost:3001/api
npm start        # 2. website              →  http://localhost:3000
```
Then open http://localhost:3000 and click **Load demo data** on the dashboard.
Instead of `npm run api` you can open `mockoon/aquaplan.json` in the Mockoon desktop app and press ▶ Start.
Mockoon keeps data in memory, so the data is empty again after a restart.

Don't open `index.html` by double-clicking: browsers block ES modules on `file://`.

## Tests

```
npm test                    # 28 tests for the models and validation (Node)
```
You can also open `http://localhost:3000/tests/` to run the same tests in the browser.

## Project structure

```
index.html        page shell (header, nav, main, footer)
css/styles.css    all styles (light and dark themes, responsive)
js/main.js        start-up and hash router
js/api/           fetch wrappers: openMeteo, nominatim, mockoon, http
js/models/        pure calculation code (Kc, upland, rice, 7-day plan)
js/services/      combines field + records + weather into a plan; demo data
js/views/         one file per page + shared components and the chart
js/utils/         dates, unit conversion, validation, safe HTML
tests/            model tests
mockoon/          Mockoon environment (users, fields, records, messages)
assets/           logo and favicon
```

## Documentation

- [REQUIREMENTS.md](REQUIREMENTS.md): functional requirements, formulas and validation rules
- [ARCHITECTURE.md](ARCHITECTURE.md): diagrams, data model, request flows, error handling
- [EXPLANATION.md](EXPLANATION.md): background on the irrigation method
- [SETUP_AND_DEPLOY.md](SETUP_AND_DEPLOY.md): how to set up and run the app locally

## Limitations

- Local only: the app works on a computer that runs Mockoon. There is no public live link.
- Data is reset when Mockoon restarts (the starting admin account always comes back).
- Login runs in the browser against a mock API: it demonstrates accounts and roles, but it is not real security. Anyone who can reach `localhost:3001/api/users` can read the user list.
- The calculations use simplified FAO-56 defaults. This is a course prototype, not agronomic advice.
