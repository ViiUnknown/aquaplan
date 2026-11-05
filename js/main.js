// App start-up and hash router.
//   #/dashboard            all fields
//   #/fields/new           add a field
//   #/fields/:id           field detail (plan, chart, comparison)
//   #/fields/:id/edit      edit a field
//   #/fields/:id/records   irrigation records + depth readings

import { renderDashboard } from './views/dashboard.js';
import { renderFieldForm } from './views/fieldForm.js';
import { renderFieldDetail } from './views/fieldDetail.js';
import { renderRecords } from './views/records.js';
import { html, setHTML, renderError, friendlyError } from './utils/ui.js';
import { initThemeToggle } from './theme.js';

const app = document.getElementById('app');

const routes = [
  { pattern: /^#\/?$/, view: renderDashboard, nav: 'dashboard' },
  { pattern: /^#\/dashboard$/, view: renderDashboard, nav: 'dashboard' },
  { pattern: /^#\/fields\/new$/, view: renderFieldForm, nav: 'new' },
  { pattern: /^#\/fields\/([^/]+)\/edit$/, view: renderFieldForm },
  { pattern: /^#\/fields\/([^/]+)\/records$/, view: renderRecords },
  { pattern: /^#\/fields\/([^/]+)$/, view: renderFieldDetail },
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

function highlightNav(nav) {
  document.querySelectorAll('[data-nav]').forEach(link => {
    if (link.dataset.nav === nav) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

async function router() {
  const hash = window.location.hash || '#/dashboard';
  const renderId = ++currentRender;
  const ctx = { container: app, isCurrent: () => renderId === currentRender };

  const route = routes.find(r => r.pattern.test(hash));
  highlightNav(route?.nav);
  window.scrollTo(0, 0);

  if (!route) {
    renderNotFound();
    return;
  }

  const params = hash.match(route.pattern).slice(1).map(decodeURIComponent);
  try {
    await route.view(ctx, ...params);
  } catch (error) {
    console.error(error);
    if (ctx.isCurrent()) {
      renderError(app, { message: friendlyError(error), onRetry: router });
    }
  }
}

initThemeToggle(document.querySelector('[data-theme-toggle]'));
window.addEventListener('hashchange', router);
router();
