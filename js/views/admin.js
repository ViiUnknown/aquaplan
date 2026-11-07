// #/admin – only for the "admin" role: manage users, see every field, read contact messages.

import {
  getUsers, updateUser, deleteUser, getFields, deleteFieldWithRecords, getMessages, deleteMessage,
} from '../api/mockoon.js';
import { currentUser, updateSession } from '../auth.js';
import { cropLabel } from './components.js';
import { formatDate, formatNumber } from '../utils/format.js';
import { html, setHTML, renderLoading, friendlyError, flashBanner, setBusy } from '../utils/ui.js';
import { setFlash, takeFlash } from '../state.js';

const dateOnly = iso => (iso ? formatDate(iso.slice(0, 10)) : '–');

export async function renderAdmin(ctx) {
  const { container } = ctx;
  renderLoading(container, 'Loading users…');
  const [users, fields, messages] = await Promise.all([getUsers(), getFields(), getMessages()]);
  if (!ctx.isCurrent()) return;

  const me = currentUser();
  const usersById = new Map(users.map(u => [u.id, u]));
  const fieldCount = id => fields.filter(f => f.ownerId === id).length;

  setHTML(container, html`
    <section class="view">
      ${flashBanner(takeFlash())}
      <div class="page-head">
        <div>
          <h1>Admin</h1>
          <p class="meta">${users.length} user(s) · ${fields.length} field(s) · ${messages.length} message(s)</p>
        </div>
      </div>

      <section class="card" aria-labelledby="users-title">
        <h2 id="users-title">Users</h2>
        <p class="error" data-admin-error role="alert"></p>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th class="num">Fields</th><th>Joined</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              ${users.map(user => {
                const isMe = user.id === me.id;
                return html`
                  <tr>
                    <th scope="row">${user.name}${isMe ? html` <span class="badge badge--muted">you</span>` : ''}</th>
                    <td>${user.email}</td>
                    <td>
                      <label class="visually-hidden" for="role-${user.id}">Role of ${user.name}</label>
                      <select id="role-${user.id}" class="input--inline" data-role-for="${user.id}" ${isMe ? 'disabled' : ''}>
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                      </select>
                    </td>
                    <td class="num">${fieldCount(user.id)}</td>
                    <td>${dateOnly(user.createdAt)}</td>
                    <td>${isMe ? '' : html`<button class="btn btn--sm btn--danger" type="button" data-delete-user="${user.id}">Delete</button>`}</td>
                  </tr>`;
              })}
            </tbody>
          </table>
        </div>
        <p class="hint">You can't change your own role or delete yourself, so there is always at least one admin.</p>
      </section>

      <section class="card" aria-labelledby="fields-title">
        <h2 id="fields-title">All fields</h2>
        ${fields.length === 0 ? html`<p class="muted">No fields yet.</p>` : html`
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Field</th><th>Crop</th><th class="num">Area (ha)</th><th>Owner</th></tr></thead>
              <tbody>
                ${fields.map(field => html`
                  <tr>
                    <th scope="row"><a href="#/fields/${field.id}">${field.name}</a></th>
                    <td>${cropLabel(field.cropType)}</td>
                    <td class="num">${formatNumber(field.areaHa)}</td>
                    <td>${usersById.get(field.ownerId)?.name ?? html`<span class="muted">No owner</span>`}</td>
                  </tr>`)}
              </tbody>
            </table>
          </div>`}
      </section>

      <section class="card" aria-labelledby="messages-title">
        <h2 id="messages-title">Contact messages</h2>
        ${messages.length === 0 ? html`<p class="muted">No messages yet.</p>` : html`
          <ul class="messages">
            ${messages.map(m => html`
              <li class="messages__item">
                <div class="messages__head">
                  <strong>${m.name}</strong> <span class="muted">${m.email} · ${dateOnly(m.sentAt)}</span>
                  <button class="btn btn--sm" type="button" data-delete-message="${m.id}">Delete</button>
                </div>
                <p>${m.message}</p>
              </li>`)}
          </ul>`}
      </section>
    </section>`);

  const adminError = container.querySelector('[data-admin-error]');
  const reload = message => {
    setFlash(message);
    if (ctx.isCurrent()) renderAdmin(ctx);
  };

  // Change a user's role.
  container.querySelectorAll('[data-role-for]').forEach(select => {
    select.addEventListener('change', async () => {
      const user = usersById.get(select.dataset.roleFor);
      select.disabled = true;
      try {
        const saved = await updateUser(user.id, { ...user, role: select.value });
        updateSession(saved);
        reload(`${saved.name} is now ${saved.role === 'admin' ? 'an admin' : 'a user'}.`);
      } catch (error) {
        select.disabled = false;
        select.value = user.role;
        adminError.textContent = friendlyError(error);
      }
    });
  });

  // Delete a user together with their fields and records.
  container.querySelectorAll('[data-delete-user]').forEach(button => {
    button.addEventListener('click', async () => {
      const user = usersById.get(button.dataset.deleteUser);
      const own = fields.filter(f => f.ownerId === user.id);
      if (!window.confirm(`Delete ${user.name} and their ${own.length} field(s)? This cannot be undone.`)) return;
      setBusy(button, true, 'Deleting…');
      try {
        for (const field of own) await deleteFieldWithRecords(field.id);
        await deleteUser(user.id);
        reload(`${user.name} was deleted.`);
      } catch (error) {
        setBusy(button, false);
        adminError.textContent = friendlyError(error);
      }
    });
  });

  // Delete a contact message.
  container.querySelectorAll('[data-delete-message]').forEach(button => {
    button.addEventListener('click', async () => {
      setBusy(button, true, 'Deleting…');
      try {
        await deleteMessage(button.dataset.deleteMessage);
        reload('Message deleted.');
      } catch (error) {
        setBusy(button, false);
        adminError.textContent = friendlyError(error);
      }
    });
  });
}
