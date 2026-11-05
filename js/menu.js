// The ☰ menu button in the header: opens and closes the list of pages.
// It closes when a page is chosen, on Escape, or when you click anywhere else.

export function initMenu(button, menu) {
  if (!button || !menu) return;

  const isOpen = () => button.getAttribute('aria-expanded') === 'true';

  function open() {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', 'Close menu');
  }

  function close() {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Open menu');
  }

  button.addEventListener('click', () => (isOpen() ? close() : open()));

  // Close after choosing a page (also when it is the page you are already on).
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) close();
  });
  window.addEventListener('hashchange', close);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen()) {
      close();
      button.focus();
    }
  });

  document.addEventListener('click', event => {
    if (isOpen() && !menu.contains(event.target) && !button.contains(event.target)) close();
  });
}
