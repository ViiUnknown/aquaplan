// App start-up and hash router.
//   #/home  #/purpose  #/how-it-works  #/about  #/contact   information pages
//   #/dashboard            all fields
//   #/fields/new           add a field
//   #/fields/:id           field detail (plan, chart, comparison)
//   #/fields/:id/edit      edit a field
//   #/fields/:id/records   irrigation records + depth readings
//   #/login  #/register     accounts          #/admin   admin only
//
// access: 'user'  → must be logged in (any role)
//         'admin' → must be logged in with the admin role
//         'guest' → only when logged out (login/register)

import { renderHome, renderPurpose, renderAbout, renderContact } from './views/pages.js';
import { renderHowItWorks } from './views/howItWorks.js';
import { renderDashboard } from './views/dashboard.js';
import { renderFieldForm } from './views/fieldForm.js';
import { renderFieldDetail } from './views/fieldDetail.js';
import { renderRecords } from './views/records.js';
import { renderLogin, renderRegister, rememberNextPage } from './views/auth.js';
import { renderAdmin } from './views/admin.js';
import { currentUser, isLoggedIn, isAdmin, logout, onAuthChange } from './auth.js';
import { setFlash } from './state.js';
import { html, setHTML, renderError, friendlyError } from './utils/ui.js';
import { initThemeToggle } from './theme.js';
import { initMenu } from './menu.js';

const app = document.getElementById('app');

const routes = [
  { pattern: /^#\/?$/, view: renderHome, nav: 'home' },
  { pattern: /^#\/home$/, view: renderHome, nav: 'home' },
  { pattern: /^#\/purpose$/, view: renderPurpose, nav: 'purpose' },
  { pattern: /^#\/how-it-works$/, view: renderHowItWorks, nav: 'how' },
  { pattern: /^#\/about$/, view: renderAbout, nav: 'about' },
  { pattern: /^#\/contact$/, view: renderContact, nav: 'contact' },
  { pattern: /^#\/login$/, view: renderLogin, nav: 'login', access: 'guest' },
  { pattern: /^#\/register$/, view: renderRegister, nav: 'register', access: 'guest' },
  { pattern: /^#\/dashboard$/, view: renderDashboard, nav: 'dashboard', access: 'user' },
  { pattern: /^#\/fields\/new$/, view: renderFieldForm, nav: 'dashboard', access: 'user' },
  { pattern: /^#\/fields\/([^/]+)\/edit$/, view: renderFieldForm, access: 'user' },
  { pattern: /^#\/fields\/([^/]+)\/records$/, view: renderRecords, access: 'user' },
  { pattern: /^#\/fields\/([^/]+)$/, view: renderFieldDetail, access: 'user' },
  { pattern: /^#\/admin$/, view: renderAdmin, nav: 'admin', access: 'admin' },
];

// Each navigation gets a number. Slow requests from an old page check
// ctx.isCurrent() and stop instead of drawing over the new page.
let currentRender = 0;

function renderNotFound() {
  setHTML(app, html`
    <div class="state">
      <h1>Page not found</h1>
      <p>This address doesn't exist in AquaPlan.</p>
      <a class="btn btn--primary" href="#/dashboard">Go to dashboard</a>
    </div>`);
}

function renderAdminsOnly() {
  setHTML(app, html`
    <div class="state">
      <h1>Admins only</h1>
      <p>This page is only for AquaPlan administrators.</p>
      <a class="btn btn--primary" href="#/dashboard">Go to your dashboard</a>
    </div>`);
}

/** Show/hide menu items for guests, users and admins, and the name + Log out button. */
function updateAuthUI(user) {
  document.querySelectorAll('[data-auth]').forEach(el => {
    const need = el.dataset.auth;
    el.hidden = need === 'guest' ? Boolean(user) : need === 'admin' ? user?.role !== 'admin' : !user;
  });
  const name = document.querySelector('[data-user-name]');
  if (name) name.textContent = user ? `${user.name}${user.role === 'admin' ? ' (admin)' : ''}` : '';
}

function highlightNav(nav) {
  document.querySelectorAll('[data-nav]').forEach(link => {
    if (link.dataset.nav === nav) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

async function router() {
  const hash = window.location.hash || '#/home';
  const renderId = ++currentRender;
  const ctx = { container: app, isCurrent: () => renderId === currentRender };

  const route = routes.find(r => r.pattern.test(hash));
  highlightNav(route?.nav);
  window.scrollTo(0, 0);

  if (!route) {
    renderNotFound();
    return;
  }

  // Access rules (see the list at the top of this file).
  if (route.access === 'guest' && isLoggedIn()) {
    location.hash = '#/dashboard';
    return;
  }
  if ((route.access === 'user' || route.access === 'admin') && !isLoggedIn()) {
    rememberNextPage(hash);               // come back here after logging in
    setFlash('Please log in to continue.', 'error');
    location.hash = '#/login';
    return;
  }
  if (route.access === 'admin' && !isAdmin()) {
    renderAdminsOnly();
    return;
  }

  const params = hash.match(route.pattern).slice(1).map(decodeURIComponent);
  try {
    await route.view(ctx, ...params);
  } catch (error) {
    console.error(error);
    if (!ctx.isCurrent()) return;
    if (error.status === 403) {
      // Someone else's field: explain it, no "Try again" (it would fail again).
      renderError(app, { title: 'No access', message: friendlyError(error) });
      app.querySelector('.state')?.insertAdjacentHTML('beforeend', '<a class="btn btn--primary" href="#/dashboard">Go to your dashboard</a>');
    } else {
      renderError(app, { message: friendlyError(error), onRetry: router });
    }
  }
}

initThemeToggle(document.querySelector('[data-theme-toggle]'));
initMenu(document.querySelector('[data-menu-toggle]'), document.getElementById('site-menu'));

onAuthChange(updateAuthUI);
updateAuthUI(currentUser());
document.querySelector('[data-logout]')?.addEventListener('click', () => {
  logout();
  setFlash('You are logged out.');
  if (location.hash === '#/login') router();
  else location.hash = '#/login';
});
window.addEventListener('hashchange', router);
router();
