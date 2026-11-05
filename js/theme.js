// Light / dark mode. By default the app follows the device setting; the switch in the header
// (sun on the left = light, moon on the right = dark) overrides it, and the choice is saved
// in localStorage (applied early by index.html).

const STORAGE_KEY = 'aquaplan-theme';
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function currentTheme() {
  return document.documentElement.dataset.theme ?? (systemDark.matches ? 'dark' : 'light');
}

function save(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage blocked (private mode): the choice lasts until the page is closed
  }
}

export function initThemeToggle(button) {
  if (!button) return;

  // The switch is "on" in dark mode: CSS slides the knob right when aria-checked is "true".
  function showState() {
    const dark = currentTheme() === 'dark';
    button.setAttribute('aria-checked', String(dark));
    button.title = dark ? 'Dark mode (click for light)' : 'Light mode (click for dark)';
  }

  button.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    save(next);
    showState();
  });
  systemDark.addEventListener('change', showState);   // device switched while no choice is saved
  showState();
}
