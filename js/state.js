// Tiny in-memory app state shared between views.

// A one-time message shown on the next page, e.g. "Field saved." after a redirect.
let flash = null;

export function setFlash(message, type = 'success') {
  flash = { message, type };
}

/** Returns the pending flash message (if any) and clears it. */
export function takeFlash() {
  const current = flash;
  flash = null;
  return current;
}
