// #/login and #/register

import { login, register } from '../auth.js';
import { validateLogin, validateRegister } from '../utils/validation.js';
import { html, setHTML, showFieldErrors, setBusy, textValue, friendlyError, flashBanner } from '../utils/ui.js';
import { setFlash, takeFlash } from '../state.js';

// Where to go after logging in: the protected page the user tried to open, or the dashboard.
const NEXT_KEY = 'aquaplan-next';
export const rememberNextPage = hash => sessionStorage.setItem(NEXT_KEY, hash);
function goToNextPage() {
  const next = sessionStorage.getItem(NEXT_KEY) || '#/dashboard';
  sessionStorage.removeItem(NEXT_KEY);
  location.hash = next;
}

// Passwords are read as typed (no trimming: spaces can be part of a password).
const passwordValue = (form, name) => form.elements.namedItem(name)?.value ?? '';

const row = (id, label, input, hint = '') => html`
  <div class="form-row">
    <label for="${id}">${label}</label>
    ${input}
    ${hint ? html`<p class="hint">${hint}</p>` : ''}
    <p class="error" data-error-for="${id.slice(2)}"></p>
  </div>`;

// ---------- #/login ----------

export async function renderLogin({ container }) {
  setHTML(container, html`
    <section class="view auth">
      ${flashBanner(takeFlash())}
      <form class="card form auth__card" novalidate>
        <h1>Log in</h1>
        <p class="meta">Log in to see your fields.</p>
        ${row('a-email', 'Email', html`<input id="a-email" name="email" type="email" autocomplete="email">`)}
        ${row('a-password', 'Password', html`<input id="a-password" name="password" type="password" autocomplete="current-password">`)}
        <p class="error form-error" data-form-error role="alert"></p>
        <button class="btn btn--primary auth__submit" type="submit">Log in</button>
        <p class="auth__switch">No account yet? <a href="#/register">Create one</a></p>
      </form>
    </section>`);

  const form = container.querySelector('form');
  const submit = form.querySelector('[type="submit"]');
  const formError = form.querySelector('[data-form-error]');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    formError.textContent = '';
    const values = { email: textValue(form, 'email'), password: passwordValue(form, 'password') };
    const errors = validateLogin(values);
    showFieldErrors(form, errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(submit, true, 'Logging in…');
    try {
      const user = await login(values.email, values.password);
      setFlash(`Welcome back, ${user.name}.`);
      goToNextPage();
    } catch (error) {
      setBusy(submit, false);
      formError.textContent = error.status || error.code ? friendlyError(error) : error.message;
    }
  });
}

// ---------- #/register ----------

export async function renderRegister({ container }) {
  setHTML(container, html`
    <section class="view auth">
      <form class="card form auth__card" novalidate>
        <h1>Create an account</h1>
        <p class="meta">Your fields are only visible to you.</p>
        ${row('a-name', 'Your name', html`<input id="a-name" name="name" autocomplete="name">`)}
        ${row('a-email', 'Email', html`<input id="a-email" name="email" type="email" autocomplete="email">`)}
        ${row('a-password', 'Password', html`<input id="a-password" name="password" type="password" autocomplete="new-password">`,
              'At least 8 characters, with a letter and a number.')}
        ${row('a-confirm', 'Repeat the password', html`<input id="a-confirm" name="confirm" type="password" autocomplete="new-password">`)}
        <p class="error form-error" data-form-error role="alert"></p>
        <button class="btn btn--primary auth__submit" type="submit">Create account</button>
        <p class="auth__switch">Already have an account? <a href="#/login">Log in</a></p>
      </form>
    </section>`);

  const form = container.querySelector('form');
  const submit = form.querySelector('[type="submit"]');
  const formError = form.querySelector('[data-form-error]');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    formError.textContent = '';
    const values = {
      name: textValue(form, 'name'),
      email: textValue(form, 'email'),
      password: passwordValue(form, 'password'),
      confirm: passwordValue(form, 'confirm'),
    };
    const errors = validateRegister(values);
    showFieldErrors(form, errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(submit, true, 'Creating account…');
    try {
      const user = await register(values);
      setFlash(`Welcome, ${user.name}! Add your first field to get a watering plan.`);
      goToNextPage();
    } catch (error) {
      setBusy(submit, false);
      if (error.field) showFieldErrors(form, { [error.field]: error.message });
      else formError.textContent = friendlyError(error);
    }
  });
}
