const TOKEN_KEY = "sg_auth_token";

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore storage errors
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function requestJson(apiBase, path, options = {}) {
  const { method = "GET", body, token, headers = {} } = options;
  const mergedHeaders = {
    "Content-Type": "application/json",
    ...headers,
  };
  if (token) {
    mergedHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: mergedHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const detail = payload?.detail || payload?.message || "Request failed";
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }

  return payload;
}
