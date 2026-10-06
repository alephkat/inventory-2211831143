/**
 * Thin fetch wrapper around the Express API.
 *
 * Responsibilities kept here (and nowhere else) so callers never deal with it:
 *  - attaches the access token
 *  - transparently refreshes an expired access token once, then replays the
 *    original request, so a 15m token lifetime never surfaces to the user
 *  - unwraps the backend's `{ success, data }` envelope and turns anything
 *    else into a thrown Error carrying the server's message
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const ACCESS_KEY = 'stockwise.accessToken';
const REFRESH_KEY = 'stockwise.refreshToken';

export const tokenStore = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

interface ApiEnvelope<T> {
  success: boolean;
  message?: string | null;
  data: T;
  meta?: unknown;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/** Registered by AuthProvider so a dead session bounces the user to /login. */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized() {
  tokenStore.clear();
  unauthorizedListeners.forEach((listener) => listener());
}

// A single in-flight refresh shared by every request that raced into a 401.
// Without this, ten parallel queries would each spend the refresh token and
// the backend rotates sessions on refresh — nine of them would be logged out.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = tokenStore.refresh;
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return false;

      const body = (await response.json()) as ApiEnvelope<{
        tokens: { accessToken: string; refreshToken: string };
      }>;
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

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { retryOnUnauthorized?: boolean } = {},
): Promise<T> {
  const { retryOnUnauthorized = true } = options;
  const headers = new Headers(init.headers);

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = tokenStore.access;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (response.status === 401 && retryOnUnauthorized) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, init, { retryOnUnauthorized: false });
    }
    notifyUnauthorized();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const envelope = body as { message?: string; error?: { message?: string; code?: string } } | string | null;
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;

    if (typeof envelope === 'object' && envelope !== null) {
      message = envelope.message ?? envelope.error?.message ?? message;
      code = envelope.error?.code;
    } else if (typeof envelope === 'string') {
      message = envelope;
    }
    throw new ApiError(response.status, message, code);
  }

  const envelope = body as ApiEnvelope<T> | null;
  // Endpoints that return a bare payload rather than the envelope are passed
  // through untouched.
  if (envelope && typeof envelope === 'object' && 'success' in envelope && 'data' in envelope) {
    return envelope.data;
  }
  return body as T;
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/** Builds `?a=1&b=2`, dropping empty values so the server sees them as absent. */
export function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const api = {
  get: <T>(path: string, params?: QueryParams) => request<T>(`${path}${buildQuery(params)}`),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
};

/**
 * Paged list endpoint. The backend returns `{ items, total, page, limit }`
 * either at the top level of `data` or nested under `data.data` depending on
 * the route, so both are accepted.
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function normalizeList<T>(payload: unknown, fallbackLimit = 20): Paginated<T> {
  const candidate = payload as
    | { items?: T[]; total?: number; page?: number; limit?: number }
    | Paginated<T>
    | T[]
    | null;

  if (Array.isArray(candidate)) {
    return { items: candidate, total: candidate.length, page: 1, limit: fallbackLimit };
  }

  const source = candidate ?? {};
  const nested = (source as { data?: Paginated<T> }).data;
  const resolved = nested ?? (source as Paginated<T>);

  return {
    items: resolved.items ?? [],
    total: resolved.total ?? resolved.items?.length ?? 0,
    page: resolved.page ?? 1,
    limit: resolved.limit ?? fallbackLimit,
  };
}

export { refreshAccessToken };