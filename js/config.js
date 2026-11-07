// AquaPlan configuration.

// Base URL of the local Mockoon server that stores users, fields, records and messages.
// Start it from the Mockoon desktop app or the CLI with mockoon/aquaplan.json
// (see MOCKOON_SETUP.md). It must be running before you open the app.
export const API_BASE = 'http://localhost:3001/api';

// Time zone used for "today" and for Open-Meteo daily values.
export const TIMEZONE = 'Asia/Phnom_Penh';

// How long weather responses are cached in sessionStorage.
export const WEATHER_CACHE_MINUTES = 60;
