// Light / dark mode. By default the app follows the device setting; the 🌙/☀ button
// overrides it, and the choice is saved in localStorage (applied early by index.html).

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

  // The button shows where it will take you: 🌙 in light mode, ☀ in dark mode.
  function showIcon() {
    const dark = currentTheme() === 'dark';
    button.textContent = dark ? '☀' : '🌙';
    button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    button.title = button.getAttribute('aria-label');
  }

  button.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    save(next);
    showIcon();
  });
  systemDark.addEventListener('change', showIcon);   // device switched while no choice is saved
  showIcon();
}
