# AquaPlan – Setup and Run (local only)

AquaPlan runs **only on your own computer**. Two small local servers work together:

- a **web server** that serves the website files, and
- a **Mockoon** server that stores the data (accounts, fields, records, contact messages).

There is no public live site. To demo the app, run both servers on the presenting laptop.

**Repo:** https://github.com/ViiUnknown/aquaplan

Type commands in the **VS Code terminal** (`` Ctrl+` ``), inside the project folder.

---

## How the pieces fit together

```
  Your computer
  ─────────────────────────────────────────────────────────────
  web server (npm start)  ──►  browser: http://localhost:3000
                                   │                 │
                                   │ fetch()         │ fetch()
                                   ▼                 ▼
                   Mockoon (npm run api)        Open-Meteo (internet)
                   http://localhost:3001/api    weather + place search
                   users · fields · records · messages
```

- There is **no backend code to write**. All of AquaPlan's code runs in the browser.
- **Mockoon** is a mock REST API defined in `mockoon/aquaplan.json`. It answers GET, POST, PUT and DELETE.
- **Open-Meteo** (weather) and the **OpenStreetMap** map still come from the internet, so you need a connection.

---

## Project structure

```
aquaplan/
├── index.html                 the one HTML page (single-page app)
├── css/styles.css             all styles (light + dark)
├── assets/                    logo, favicon, background photos
├── mockoon/aquaplan.json      ⚙️ the Mockoon environment (the data API)
├── js/
│   ├── main.js                start-up + hash router (#/home, #/dashboard, #/fields/:id …)
│   ├── auth.js                accounts: log in, register, roles, field access
│   ├── config.js              API_BASE = http://localhost:3001/api
│   ├── menu.js                ☰ menu
│   ├── theme.js               light/dark switch
│   ├── state.js               one-time "Field saved." messages
│   ├── api/
│   │   ├── http.js            fetch wrapper with friendly errors
│   │   ├── openMeteo.js       place search + weather (with 1-hour cache)
│   │   ├── nominatim.js       map point → place name
│   │   └── mockoon.js         create/read/update/delete for users, fields, records, messages
│   ├── models/                pure calculation code (no DOM, no fetch)
│   ├── services/              field + records + weather → plan; demo data
│   ├── utils/                 dates, units, validation, safe HTML
│   └── views/                 one file per page (pages.js = Home/Purpose/About/Contact, howItWorks.js, auth.js = login/register, admin.js)
├── tests/                     28 tests (npm test, or open /tests/ in the browser)
└── package.json               shortcuts: npm start, npm run api, npm test
```

---

# Part 1 – One-time setup

1. **Node.js** – check with `node --version`. If it's missing: `winget install --id OpenJS.NodeJS.LTS -e`, then reopen the terminal.
2. **Mockoon** – either
   - install the **Mockoon desktop app** from https://mockoon.com/download/, **or**
   - use the **CLI** through `npm run api` (downloads automatically the first time).

Details: **MOCKOON_SETUP.md**.

---

# Part 2 – Run AquaPlan

Open **two terminals** (click **+** in the VS Code terminal panel for the second one).

**Terminal 1 – data server (Mockoon)**
```powershell
npm run api
```
✅ You see `Server started on port 3001`.
(Using the desktop app instead? Open `mockoon/aquaplan.json` and press ▶ Start.)

**Terminal 2 – website**
```powershell
npm start
```
✅ Open **http://localhost:3000**.

Stop either server with **Ctrl+C** in its terminal.

### Why a web server and not a double-click?
AquaPlan uses **ES modules** (`import` / `export`). Browsers block modules on pages opened by
double-clicking `index.html` (`file://…`). The web server only serves your files.
Other options: VS Code **Live Server**, or `python -m http.server 3000`.

### First run
1. Open **Dashboard** from the ☰ menu. ✅ You are sent to **Log in** (the dashboard needs an account).
2. Click **Create one** and register (or log in as the admin from MOCKOON_SETUP.md §5b).
   ✅ "No fields yet" with two buttons.
3. Click **Load demo data**. ✅ Three Cambodian demo fields appear with today's status. They belong to your account.
4. Optional: open http://localhost:3001/api/fields to see the saved data as JSON.

> Mockoon keeps data **in memory**. When you restart it, the data is empty again (only the starting admin
> account is left) – register and click **Load demo data** before each demo. See MOCKOON_SETUP.md §5.

### Run the calculation tests
```powershell
npm test
```
✅ `28/28 passed`. (Or open http://localhost:3000/tests/ while the website server is running.)

---

# Part 3 – Share changes with the team (Git)

The code (including `mockoon/aquaplan.json`) goes through Git like everything else:

```powershell
git switch -c my-change
git add .
git status                      # check the list of files
git commit -m "Describe the change"
git push -u origin my-change
gh pr create --fill             # the owner (ViiUnknown) reviews and merges
```
Teammates then run `git switch main` and `git pull`. Each person runs the two servers on their own
computer, so each person has their **own** data.

> The app is local only. If GitHub Pages was turned on earlier, the owner can switch it off in
> **Settings → Pages**, or with `gh api -X DELETE repos/ViiUnknown/aquaplan/pages`.
> A Pages site can't reach `localhost`, so it would show "Can't reach AquaPlan's data server".

---

## Troubleshooting

| Problem | Cause → Fix |
|---|---|
| "Can't reach AquaPlan's data server…" | Mockoon isn't running. Start it (Part 2, Terminal 1), then click **Try again** |
| Blank page, console says *"Cannot use import statement"* | Opened by double-click (`file://`). Use `npm start` |
| `Port 3000/3001 is already in use` | That server is already running in another terminal. Use it, or stop it with Ctrl+C |
| CORS error in the console | CORS is off in Mockoon. Environment **Settings → CORS** on (it is on in `aquaplan.json`) |
| My fields (or my account) disappeared | Mockoon was restarted, so only the starting admin account is left. Register again, then click **Load demo data** |
| "Not found" for a field | The field was deleted, or Mockoon restarted |
| Weather unavailable on one field | No internet, or an Open-Meteo hiccup. Click **Try again** |
| Changes on `main` rejected for teammates | Expected: `main` is protected. Use a branch and a pull request |

Press **F12** in the browser. The **Console** shows errors, and the **Network** tab shows every request
to `localhost:3001` (Mockoon) and Open-Meteo with its status.

---

## Checklist

- [ ] `npm test` shows 28/28
- [ ] `npm run api` (or the Mockoon app) shows the server on port 3001
- [ ] http://localhost:3001/api/fields shows `[]` (or your data)
- [ ] `npm start` and http://localhost:3000 opens
- [ ] "Load demo data" works
- [ ] Before a demo: both servers running, demo data loaded
