/**
 * Generic API client for the E-Invoice Django backend.
 * - Sends session cookies (credentials: 'include')
 * - Adds X-CSRFToken automatically for non-GET requests
 * - Returns a normalized response object (never throws on HTTP errors)
 */
import { getCsrfToken } from './authService.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function readCsrfCookie() {
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function buildUrl(path, query = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (k && v !== undefined && v !== null && String(v) !== '') params.append(k, v);
  });
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

/**
 * @param {string} method  GET | POST | PATCH | PUT | DELETE
 * @param {string} path    e.g. /api/me
 * @param {{query?: object, body?: any}} options
 */
export async function apiRequest(method, path, { query, body } = {}) {
  const upper = method.toUpperCase();
  const headers = { Accept: 'application/json' };

  if (upper !== 'GET' && upper !== 'HEAD') {
    // Django rotates the token on login, so prefer the live cookie value
    const token = readCsrfCookie() || (await getCsrfToken(true));
    if (token) headers['X-CSRFToken'] = token;
  }

  let payload;
  if (body !== undefined && body !== null && upper !== 'GET') {
    headers['Content-Type'] = 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const url = buildUrl(path, query);
  const started = performance.now();

  try {
    const res = await fetch(url, {
      method: upper,
      headers,
      body: payload,
      credentials: 'include'
    });
    const raw = await res.text();
    const timeMs = Math.round(performance.now() - started);

    let data = raw;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      /* not JSON — keep raw text */
    }

    const resHeaders = {};
    res.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      timeMs,
      size: new Blob([raw]).size,
      headers: resHeaders,
      data,
      raw,
      url
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      statusText: 'Network Error',
      timeMs: Math.round(performance.now() - started),
      size: 0,
      headers: {},
      data: { error: 'network_error', message: err.message },
      raw: '',
      url,
      networkError: true
    };
  }
}

export const api = {
  get: (path, query) => apiRequest('GET', path, { query }),
  post: (path, body, query) => apiRequest('POST', path, { body, query }),
  patch: (path, body, query) => apiRequest('PATCH', path, { body, query })
};
