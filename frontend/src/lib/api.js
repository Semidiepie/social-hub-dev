// Central JWT-aware fetch wrapper for the PostMePlex web app. Mirrors the
// mobile client so both surfaces speak the same API dialect.

const BASE_URL = process.env.REACT_APP_BACKEND_URL;
const TOKEN_KEY = "postmeplex.token";

export function getToken() {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* no-op */
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* no-op */
  }
}

async function request(path, init = {}, authed = true) {
  const headers = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  if (authed) {
    const t = getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  let res;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, { ...init, headers });
  } catch {
    throw new Error(
      "Can't reach PostMePlex servers. Check your connection and try again."
    );
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = data?.detail || data?.message || `Request failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

export const api = {
  get: (p, authed = true) => request(p, { method: "GET" }, authed),
  post: (p, body, authed = true) =>
    request(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }, authed),
  put: (p, body, authed = true) =>
    request(p, { method: "PUT", body: body ? JSON.stringify(body) : undefined }, authed),
  del: (p, authed = true) => request(p, { method: "DELETE" }, authed),
};
