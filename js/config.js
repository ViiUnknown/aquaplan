// AquaPlan configuration – the only file you need to edit to connect MockAPI.

// Base URL of our MockAPI project (shared by the whole team).
// Find it at the top of your project page on mockapi.io, e.g.
//   https://6712abcd1234ef.mockapi.io/api/v1
// See SETUP_AND_DEPLOY.md, section 3.
export const MOCKAPI_BASE = 'https://6aa1c5b1ccb3db9689a5cd2c.mockapi.io/api/v1';

// Time zone used for "today" and for Open-Meteo daily values.
export const TIMEZONE = 'Asia/Phnom_Penh';

// How long weather responses are cached in sessionStorage.
export const WEATHER_CACHE_MINUTES = 60;

export function isMockApiConfigured() {
  return !MOCKAPI_BASE.includes('YOUR-PROJECT-ID');
}
