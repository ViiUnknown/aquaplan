# AquaPlan – Run, Connect MockAPI, and Deploy

This guide gets AquaPlan running on your computer, connects it to MockAPI, and publishes it on
**GitHub Pages** so anyone can open it with a link.

**Repo:** https://github.com/ViiUnknown/aquaplan
**Live site (after Part 3):** https://viiunknown.github.io/aquaplan/

Type commands in the **VS Code terminal** (`` Ctrl+` ``), inside the project folder.

---

## How the pieces fit together

```
  Your computer (development)              Internet (live site)
  ───────────────────────────              ─────────────────────
  local server  ──►  browser               GitHub Pages ──► anyone's browser
  (npx serve)        localhost:3000        viiunknown.github.io/aquaplan
                         │                                   │
                         └──────── both call ────────────────┘
                                     │            │
                              Open-Meteo     MockAPI.io
                              (weather)      (fields + records)
```

- There is **no backend code to write**. All the code runs in the browser.
- **GitHub Pages** only hosts the files (HTML, CSS, JS).
- **MockAPI** stores the data. **Open-Meteo** provides the weather.
  The browser talks to both directly, both locally and on the live site.

---

## Project structure

```
aquaplan/
├── index.html                 the one HTML page (single-page app)
├── css/styles.css             all styles (mobile first, light + dark)
├── js/
│   ├── main.js                start-up + hash router (#/dashboard, #/fields/3 …)
│   ├── config.js              ⚙️ MockAPI URL – the only file you edit to connect
│   ├── state.js               small shared state ("Field saved." messages)
│   ├── api/
│   │   ├── http.js            fetch wrapper with friendly errors
│   │   ├── openMeteo.js       place search + weather (with 1-hour cache)
│   │   └── mockApi.js         create/read/update/delete for fields + records
│   ├── models/                ← pure calculation code (no DOM, no fetch)
│   │   ├── constants.js       crop table (Kc), soils, defaults
│   │   ├── kc.js              crop coefficient by growth stage
│   │   ├── upland.js          soil-moisture deficit model
│   │   ├── rice.js            paddy water-depth model
│   │   ├── plan.js            7-day plan: IRRIGATE / SKIP / MONITOR / OK
│   │   └── compare.js         usual vs actual vs recommended
│   ├── services/
│   │   ├── fieldService.js    loads field + records + weather, runs the model
│   │   └── demoData.js        "Load demo data" button
│   ├── utils/
│   │   ├── date.js            "YYYY-MM-DD" date helpers
│   │   ├── format.js          mm ↔ m³, cm ↔ mm, number/date formatting
│   │   ├── validation.js      form rules
│   │   └── ui.js              safe HTML, loading/error states, form helpers
│   └── views/                 one file per page
│       ├── dashboard.js       #/dashboard
│       ├── fieldForm.js       #/fields/new and #/fields/:id/edit
│       ├── fieldDetail.js     #/fields/:id
│       ├── records.js         #/fields/:id/records
│       ├── components.js      shared badges / status cards
│       └── chart.js           SVG line chart (no library)
├── tests/
│   ├── models.test.js         22 tests for the calculations
│   └── index.html             run the tests in a browser
├── package.json               shortcuts: npm start, npm test (optional)
└── .nojekyll                  tells GitHub Pages to serve files as they are
```

---

# Part 1 – Run AquaPlan on your computer (local server)

### Why do I need a server?
AquaPlan uses **ES modules** (`import` / `export`). Browsers block modules on pages opened by
double-clicking `index.html` (`file://…`). A small local server fixes this. It only serves your files.

### Option A – VS Code Live Server (easiest)
1. In VS Code, open **Extensions** (`Ctrl+Shift+X`), search **Live Server** (by Ritwick Dey), and click **Install**.
2. Right-click `index.html` and choose **Open with Live Server**.
3. The browser opens at `http://127.0.0.1:5500`, and it reloads every time you save a file.

### Option B – Node.js
Needs Node.js (`node --version`). If it's missing: `winget install --id OpenJS.NodeJS.LTS -e`, then reopen the terminal.
```powershell
npm start
```
Open the address it prints (usually **http://localhost:3000**). Stop the server with `Ctrl+C`.

### Option C – Python
```powershell
python -m http.server 5500
```
Open **http://localhost:5500**. Stop the server with `Ctrl+C`.

✅ **You should see** the AquaPlan header and a box saying **"Connect MockAPI to get started"**.
That's correct: Part 2 connects it.

### Run the calculation tests
```powershell
npm test
```
✅ `22/22 passed`. (Without Node: start the server and open `/tests/` in the browser.)

---

# Part 2 – Connect MockAPI

**Who:** one person (the owner) creates the MockAPI project. Everyone else just pulls the updated `js/config.js`.

### Step 1 – Create the MockAPI project and resources
In short:
1. Sign in at **https://mockapi.io** and create a project called `aquaplan` with API prefix `/api/v1`.
2. Create a resource named **`fields`** and one named **`records`**, with the properties listed in [REQUIREMENTS.md](REQUIREMENTS.md) §10 (fields also need `pumpM3PerHour`).
3. Set auto-generated items to **0** for both.

### Step 2 – Copy your project URL
At the top of your MockAPI project page you'll see something like:
```
https://6712abcd1234ef.mockapi.io/api/v1
```

### Step 3 – Paste it into `js/config.js`
Open `js/config.js` and replace the placeholder:
```js
// before
export const MOCKAPI_BASE = 'https://YOUR-PROJECT-ID.mockapi.io/api/v1';

// after (use YOUR url)
export const MOCKAPI_BASE = 'https://6712abcd1234ef.mockapi.io/api/v1';
```
Save the file. No trailing slash at the end.

### Step 4 – Check it works
1. Refresh the app in the browser.
   ✅ You should now see **"No fields yet"** with two buttons.
2. Click **Load demo data**.
   ✅ Three Cambodian demo fields appear, each with today's irrigation status.
3. Optional: open `https://<your-id>.mockapi.io/api/v1/fields` in a new tab. You'll see the saved data as JSON.

### Step 5 – Share it with the team
`js/config.js` is code, so it goes through Git like everything else (see Part 3, Step 1).
After it's merged, teammates run `git switch main` then `git pull` and are connected too.

> ⚠️ The MockAPI URL is visible to anyone who opens the website (it's in the JavaScript).
> That's normal for this course prototype. Only store demo data, never private information.

---

# Part 3 – Deploy to GitHub Pages

The repo is **public**, so GitHub Pages is free. The owner (**ViiUnknown**) does this once.
After that the site **updates automatically** every time something is merged into `main`.

### Step 1 – Get the code into `main`
Recommended (same flow as the team): use a branch and a pull request.
```powershell
gh auth status                              # must show ViiUnknown as active
git switch -c feature/starter-app
git add .
git status                                  # check the list of files
git commit -m "Add AquaPlan app: router, views, models, tests, setup guide"
git push -u origin feature/starter-app
gh pr create --fill
gh pr merge --merge --delete-branch --admin # you are the owner, so you merge as admin
git switch main
git pull
```

### Step 2 – Turn on GitHub Pages (one time)
```powershell
gh api -X POST repos/ViiUnknown/aquaplan/pages -f "source[branch]=main" -f "source[path]=/"
```
✅ You'll see JSON that includes `"html_url": "https://viiunknown.github.io/aquaplan/"`.
❌ `409 … already enabled` means it's already on. Skip to Step 3.

### Step 3 – Wait for the first deploy (about 1–2 minutes)
```powershell
gh api repos/ViiUnknown/aquaplan/pages/builds/latest --jq "{status, created_at}"
```
Repeat until `status` is **`built`**.

### Step 4 – Open the live site
```powershell
Start-Process "https://viiunknown.github.io/aquaplan/"
```
✅ The dashboard loads with your MockAPI data (if Part 2 is done and merged).

### Step 5 – Show the link on the repo page (optional)
```powershell
gh repo edit ViiUnknown/aquaplan --homepage "https://viiunknown.github.io/aquaplan/"
```

### Updating the live site later
Nothing extra to do. Every pull request you merge into `main` redeploys the site in about 1 minute.
If you still see the old version, press **`Ctrl+F5`** (hard refresh).

---

## Troubleshooting

| Problem | Cause → Fix |
|---|---|
| Blank page locally, console says *"Cannot use import statement"* or a CORS error | Opened by double-click (`file://`). Use a local server (Part 1) |
| "Connect MockAPI to get started" still shows | `js/config.js` still has `YOUR-PROJECT-ID`, or the change isn't merged/pulled yet |
| "Not found" on every page | Wrong MockAPI URL or prefix. Compare with your MockAPI dashboard (it must end in `/api/v1`, no slash) |
| "Network error" | No internet, or a typo in the URL (`https://`) |
| "The service is busy (too many requests)" | MockAPI rate limit. Wait a minute. The weather cache helps |
| Weather unavailable on one field | Open-Meteo hiccup. Click **Try again** |
| Live site shows **404** | Pages not enabled (Step 2), the first build isn't finished (Step 3), or `index.html` isn't in the repo root |
| Live site works but looks old | Hard refresh `Ctrl+F5`. Check `gh api repos/ViiUnknown/aquaplan/pages/builds/latest` |
| Works locally but a file is missing online | File names are **case-sensitive** on GitHub Pages: `fieldForm.js` ≠ `FieldForm.js` |
| Changes on `main` rejected for teammates | Expected: `main` is protected. Use a branch and a pull request (TEAMMATE_GITHUB_SETUP.md) |

Press **F12** in the browser. The **Console** shows errors, and the **Network** tab shows every request to MockAPI and Open-Meteo with its status.

---

## Checklist

- [ ] App runs locally (Part 1) and `npm test` shows 22/22
- [ ] MockAPI project with `fields` and `records` created
- [ ] `js/config.js` has the real MockAPI URL
- [ ] "Load demo data" works
- [ ] Code merged into `main` through a pull request
- [ ] GitHub Pages enabled and showing `built`
- [ ] https://viiunknown.github.io/aquaplan/ opens and shows the data
