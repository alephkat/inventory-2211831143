const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const ACCESS_KEY = "stockwise.accessToken";
const REFRESH_KEY = "stockwise.refreshToken";
const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(accessToken, refreshToken) {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
};
class ApiError extends Error {
  status;
  code;
  constructor(status, message, code) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}
const unauthorizedListeners = /* @__PURE__ */ new Set();
function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}
function notifyUnauthorized() {
  tokenStore.clear();
  unauthorizedListeners.forEach((listener) => listener());
}
let refreshInFlight = null;
async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = tokenStore.refresh;
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken })
      });
      if (!response.ok) return false;
      const body = await response.json();
      tokenStore.set(body.data.tokens.accessToken, body.data.tokens.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}
async function request(path, init = {}, options = {}) {
  const { retryOnUnauthorized = true } = options;
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = tokenStore.access;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (response.status === 401 && retryOnUnauthorized) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, init, { retryOnUnauthorized: false });
    }
    notifyUnauthorized();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }
  if (response.status === 204) return void 0;
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const envelope2 = body;
    let message = `Request failed with status ${response.status}`;
    let code;
    if (typeof envelope2 === "object" && envelope2 !== null) {
      message = envelope2.message ?? envelope2.error?.message ?? message;
      code = envelope2.error?.code;
    } else if (typeof envelope2 === "string") {
      message = envelope2;
    }
    throw new ApiError(response.status, message, code);
  }
  const envelope = body;
  if (envelope && typeof envelope === "object" && "success" in envelope && "data" in envelope) {
    return envelope.data;
  }
  return body;
}
function buildQuery(params) {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === void 0 || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
const api = {
  get: (path, params) => request(`${path}${buildQuery(params)}`),
  post: (path, body) => request(path, { method: "POST", body: body === void 0 ? void 0 : JSON.stringify(body) }),
  put: (path, body) => request(path, { method: "PUT", body: body === void 0 ? void 0 : JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: "PATCH", body: body === void 0 ? void 0 : JSON.stringify(body) }),
  delete: (path, body) => request(path, { method: "DELETE", body: body === void 0 ? void 0 : JSON.stringify(body) })
};
function normalizeList(payload, fallbackLimit = 20) {
  const candidate = payload;
  if (Array.isArray(candidate)) {
    return { items: candidate, total: candidate.length, page: 1, limit: fallbackLimit };
  }
  const source = candidate ?? {};
  const nested = source.data;
  const resolved = nested ?? source;
  return {
    items: resolved.items ?? [],
    total: resolved.total ?? resolved.items?.length ?? 0,
    page: resolved.page ?? 1,
    limit: resolved.limit ?? fallbackLimit
  };
}
export {
  ApiError,
  api,
  buildQuery,
  normalizeList,
  onUnauthorized,
  refreshAccessToken,
  tokenStore
};
