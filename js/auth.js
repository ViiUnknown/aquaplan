// Accounts and roles (prototype level).
//
// Users are stored on the Mockoon server in /users with a salted SHA-256 password hash
// (never the plain password). The logged-in user is kept in sessionStorage, so closing the
// browser tab logs you out.
//
// Roles:  "user"  – sees and manages only their own fields
//         "admin" – also opens #/admin to manage every user and read contact messages
//
// Note: this runs entirely in the browser against a mock API, so it demonstrates accounts and
// roles but is not real security (anyone who can reach the Mockoon server can read /users).

import { getUsers, createUser } from './api/mockoon.js';

const SESSION_KEY = 'aquaplan-session';
const listeners = new Set();

// ---------- password hashing (Web Crypto, built into the browser) ----------

const toHex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');

export function makeSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

/** SHA-256 of "salt:password", as a hex string. */
export async function hashPassword(password, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

// ---------- session ----------

/** The logged-in user { id, name, email, role }, or null. */
export function currentUser() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export const isLoggedIn = () => currentUser() !== null;
export const isAdmin = () => currentUser()?.role === 'admin';

function saveSession(user) {
  const session = user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null;
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
  listeners.forEach(listener => listener(session));
}

/** Call `listener(user)` whenever someone logs in or out (the header uses this). */
export function onAuthChange(listener) {
  listeners.add(listener);
}

// ---------- login / register / logout ----------

const sameEmail = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Returns the user, or throws an error with a message for the form. */
export async function login(email, password) {
  const users = await getUsers();
  const user = users.find(u => sameEmail(u.email, email));
  const hash = user ? await hashPassword(password, user.salt) : null;
  if (!user || hash !== user.passwordHash) {
    // Same message either way, so the form doesn't reveal which emails have accounts.
    throw new Error('Wrong email or password.');
  }
  saveSession(user);
  return user;
}

/** Creates a normal "user" account and logs it in. */
export async function register({ name, email, password }) {
  const users = await getUsers();
  if (users.some(u => sameEmail(u.email, email))) {
    const error = new Error('An account with this email already exists. Log in instead.');
    error.field = 'email';
    throw error;
  }
  const salt = makeSalt();
  const user = await createUser({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: 'user',
    salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  });
  saveSession(user);
  return user;
}

export function logout() {
  saveSession(null);
}

/** Refresh the stored session after an admin changes this user's own name or role. */
export function updateSession(user) {
  if (currentUser()?.id === user.id) saveSession(user);
}

// ---------- access checks ----------

/** Can the logged-in user open this field? Owners can; admins can open every field. */
export function canAccessField(field) {
  const user = currentUser();
  return Boolean(user) && (user.role === 'admin' || field.ownerId === user.id);
}

/** Throws a 403-style error when the logged-in user may not open this field. */
export function assertCanAccessField(field) {
  if (!canAccessField(field)) {
    const error = new Error("This field belongs to another account, so you can't open it.");
    error.status = 403;
    throw error;
  }
}
