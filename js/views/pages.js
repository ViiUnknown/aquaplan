// Information pages: #/home, #/purpose, #/about and #/contact (How it works has its own file)

import { createMessage } from '../api/mockoon.js';
import { validateContact } from '../utils/validation.js';
import { html, setHTML, showFieldErrors, setBusy, textValue, friendlyError } from '../utils/ui.js';

// TODO (team): add each member's role, e.g. { name: 'Ravy Lang', role: 'Rice model + charts' }.
const TEAM = [
  { name: 'Ravy Lang' },
  { name: 'Kithya Tes' },
  { name: 'Menghong Ing' },
  { name: 'Sivhuy Hong' },
  { name: 'Hak Sokhai' },
];

const PURPOSES = [
  {
    title: 'Save water and fuel',
    text: 'Many farmers water on a fixed schedule. When rain is coming, that water and the diesel to pump it are wasted.',
  },
  {
    title: 'Protect the harvest',
    text: 'Too little water at the wrong time stresses the crop. The plan warns you before the field gets too dry.',
  },
  {
    title: 'Simple units',
    text: 'Advice is given in centimetres of water for paddy rice and in hours of pumping, not in formulas.',
  },
];

const HOME_LINKS = [
  { href: '#/purpose', title: 'Our purpose', text: 'Why we built AquaPlan.' },
  { href: '#/how-it-works', title: 'How it works', text: 'Three steps from your field to a watering plan.' },
  { href: '#/about', title: 'About us', text: 'The team behind the project.' },
  { href: '#/contact', title: 'Contact us', text: 'Send us a question or an idea.' },
];

const initials = name => name.split(' ').map(part => part[0]).join('');

const pageHead = (title, intro) => html`
  <div class="page-head">
    <div>
      <h1>${title}</h1>
      <p class="meta">${intro}</p>
    </div>
  </div>`;

// ---------- #/home ----------

export async function renderHome({ container }) {
  setHTML(container, html`
    <section class="view">
      <div class="home-hero">
        <img class="home-hero__logo" src="assets/logo-dark.png" alt="" width="300" height="80">
        <h1 class="home-hero__title">Know when to water your field, and how much.</h1>
        <p class="home-hero__text">
          AquaPlan combines the weather forecast with your crop and soil to make a 7-day watering plan
          for each of your fields.
        </p>
        <div class="actions actions--center">
          <a class="btn btn--primary" href="#/dashboard">Open dashboard</a>
        </div>
      </div>
      <ul class="info-grid info-grid--4">
        ${HOME_LINKS.map(link => html`
          <li>
            <a class="card info-link" href="${link.href}">
              <h2>${link.title}</h2>
              <p>${link.text}</p>
              <span class="info-link__more" aria-hidden="true">Read more →</span>
            </a>
          </li>`)}
      </ul>
    </section>`);
}

// ---------- #/purpose ----------

export async function renderPurpose({ container }) {
  setHTML(container, html`
    <section class="view">
      ${pageHead('Our purpose', 'Helping farmers use the right amount of water at the right time.')}
      <ul class="info-grid">
        ${PURPOSES.map(item => html`
          <li class="card">
            <h2>${item.title}</h2>
            <p>${item.text}</p>
          </li>`)}
      </ul>
    </section>`);
}

// ---------- #/about ----------

export async function renderAbout({ container }) {
  setHTML(container, html`
    <section class="view">
      ${pageHead('About us', 'Five students at the American University of Phnom Penh.')}
      <div class="card">
        <p>We built AquaPlan for INFO 251 Web Development II to help Cambodian farmers plan irrigation with
           real weather data.</p>
      </div>
      <ul class="team">
        ${TEAM.map(member => html`
          <li class="team__member">
            <span class="team__avatar" aria-hidden="true">${initials(member.name)}</span>
            <span class="team__name">${member.name}</span>
            ${member.role ? html`<span class="team__role">${member.role}</span>` : ''}
          </li>`)}
      </ul>
    </section>`);
}

// ---------- #/contact ----------

export async function renderContact({ container }) {
  setHTML(container, html`
    <section class="view view--narrow">
      ${pageHead('Contact us', 'Questions or ideas? Send us a message.')}
      <form class="card form" novalidate>
        <p class="hint">
          This is a class project: messages are saved on the AquaPlan data server, where the admin
          reads them. Please don't include private information.
        </p>
        <div class="form-grid">
          <div class="form-row">
            <label for="c-name">Your name</label>
            <input id="c-name" name="name" autocomplete="name">
            <p class="error" data-error-for="name"></p>
          </div>
          <div class="form-row">
            <label for="c-email">Email</label>
            <input id="c-email" name="email" type="email" autocomplete="email">
            <p class="error" data-error-for="email"></p>
          </div>
        </div>
        <div class="form-row">
          <label for="c-message">Message</label>
          <textarea id="c-message" name="message" rows="5"></textarea>
          <p class="error" data-error-for="message"></p>
        </div>
        <p class="error form-error" data-contact-error></p>
        <div class="flash flash--success" data-contact-success hidden role="status">
          Thank you! Your message was sent.
        </div>
        <div class="actions">
          <button class="btn btn--primary" type="submit">Send message</button>
        </div>
      </form>
    </section>`);

  wireContactForm(container.querySelector('form'));
}

function wireContactForm(form) {
  const submit = form.querySelector('[type="submit"]');
  const formError = form.querySelector('[data-contact-error]');
  const success = form.querySelector('[data-contact-success]');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    formError.textContent = '';
    success.hidden = true;

    const message = {
      name: textValue(form, 'name'),
      email: textValue(form, 'email'),
      message: textValue(form, 'message'),
    };
    const errors = validateContact(message);
    showFieldErrors(form, errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(submit, true, 'Sending…');
    try {
      await createMessage({ ...message, sentAt: new Date().toISOString() });
      form.reset();
      success.hidden = false;
    } catch (error) {
      formError.textContent = error.status === 404
        ? 'The contact form is not connected yet. Please try again later.'
        : friendlyError(error);
    } finally {
      setBusy(submit, false);
    }
  });
}
