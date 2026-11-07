// Small UI helpers: safe HTML templates, loading / error states, form errors.

// ---------- Safe HTML ----------
// html`<p>${userText}</p>` escapes every ${value} so user input can never inject HTML.
// Wrap trusted markup with raw(...) (or nest another html`` result) to insert it as-is.

class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

export function raw(markup) {
  return new SafeHtml(String(markup));
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toHtml(value) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(toHtml).join('');
  if (value instanceof SafeHtml) return value.value;
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += toHtml(value) + strings[i + 1]; });
  return new SafeHtml(out);
}

export function setHTML(element, content) {
  element.innerHTML = toHtml(content);
}

// ---------- Loading / error states ----------

export function renderLoading(container, message = 'Loading…') {
  setHTML(container, html`
    <div class="state" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <p>${message}</p>
    </div>`);
}

export function errorBox({ title = 'Something went wrong', message, retry = false }) {
  return html`
    <div class="state state--error" role="alert">
      <h2>${title}</h2>
      <p>${message}</p>
      ${retry ? html`<button class="btn" type="button" data-action="retry">Try again</button>` : ''}
    </div>`;
}

export function renderError(container, { title, message, onRetry } = {}) {
  setHTML(container, errorBox({ title, message, retry: Boolean(onRetry) }));
  if (onRetry) container.querySelector('[data-action="retry"]').addEventListener('click', onRetry);
}

/** Turn any error into a sentence a farmer can understand. */
export function friendlyError(error) {
  if (!error) return 'Unknown error.';
  if (error.code === 'API_OFFLINE') return "Can't reach AquaPlan's data server.";
  if (error.code === 'NETWORK') return 'Network error. Check your internet connection and try again.';
  if (error.status === 404) return 'Not found. It may have been deleted.';
  if (error.status === 429) return 'The service is busy (too many requests). Wait a moment and try again.';
  if (error.status >= 500) return 'The service is having problems right now. Try again later.';
  return error.message || String(error);
}

export function flashBanner(flash) {
  if (!flash) return '';
  return html`<div class="flash flash--${flash.type}" role="status">${flash.message}</div>`;
}

// ---------- Forms ----------

/** Show messages under inputs: every <p data-error-for="name"> gets errors[name]. */
export function showFieldErrors(form, errors) {
  form.querySelectorAll('[data-error-for]').forEach(el => {
    const name = el.dataset.errorFor;
    const message = errors[name] ?? '';
    el.textContent = message;
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLElement) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  });
  const firstInvalid = form.querySelector('[aria-invalid="true"]');
  if (firstInvalid) firstInvalid.focus();
}

export function setBusy(button, busy, busyText = 'Saving…') {
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label ?? button.textContent;
    button.disabled = false;
  }
}

/** Read a form input as a number; empty → null, text → NaN (caught by validation). */
export function numberValue(form, name) {
  const value = (form.elements.namedItem(name)?.value ?? '').trim();
  return value === '' ? null : Number(value);
}

export function textValue(form, name) {
  return (form.elements.namedItem(name)?.value ?? '').trim();
}
