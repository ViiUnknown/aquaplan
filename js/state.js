let flash = null;

export function setFlash(message, type = 'success') {
  flash = { message, type };
}

export function takeFlash() {
  const current = flash;
  flash = null;
  return current;
}
