// Shared fetch wrapper: turns network failures and non-2xx responses into
// errors with a `code` / `status` that the views can explain to the user.

export async function fetchJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (cause) {
    const error = new Error('Network error');
    error.code = 'NETWORK';
    error.cause = cause;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`);
    error.status = response.status;
    error.url = url;
    throw error;
  }
  return response.json();
}
