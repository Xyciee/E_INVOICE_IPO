/**
 * Generic API client for the E-Invoice Django backend.
 * - Sends session cookies (credentials: 'include')
 * - Adds X-CSRFToken automatically for non-GET requests
 * - No saved copies (2026-11-09): every screen asks the server, so packers never act on an old list
 *   (an order fixed or printed at another station, a list loaded by the previous user on this PC).
 *   Only identical GETs sent at the same moment share one request.
 */
import { getCsrfToken } from './authService.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
// Saved answers of older builds (sessionStorage) and per-PC copies of server data (localStorage).
const OLD_SESSION_CACHE_PREFIX = 'einvoice_api_cache_';
const OLD_LOCAL_DATA_KEYS = ['bir_printed_einvoices', 'bir_recent_scan_logs'];

const inFlightRequests = new Map();

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

/** Nothing is saved any more; kept so older callers still work. Always null. */
export function getCachedResponse() {
  return null;
}

/**
 * Removes data older builds kept in this browser: saved API answers, the per-PC "printed" list and the recent
 * scans list. Called on sign-in and sign-out so the next person on this PC never sees the previous one's data.
 * The station chosen on this PC and the last page opened are settings, not data, and stay.
 */
export function clearApiCache() {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith(OLD_SESSION_CACHE_PREFIX) || OLD_LOCAL_DATA_KEYS.includes(k))) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // storage blocked: nothing to clear
  }
  try {
    OLD_LOCAL_DATA_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage blocked: nothing to clear
  }
}

/**
 * @param {string} method  GET | POST | PATCH | PUT | DELETE
 * @param {string} path    e.g. /api/me
 * @param {{query?: object, body?: any}} options  (forceRefresh / bypassCache are accepted and ignored:
 *   every request goes to the server)
 */
export async function apiRequest(method, path, { query, body } = {}) {
  const upper = method.toUpperCase();
  const url = buildUrl(path, query);
  const shareable = upper === 'GET';

  if (shareable && inFlightRequests.has(url)) {
    return inFlightRequests.get(url);
  }

  const executeFetch = async () => {
    const headers = { Accept: 'application/json' };

    if (upper !== 'GET' && upper !== 'HEAD') {
      const token = readCsrfCookie() || (await getCsrfToken(true));
      if (token) headers['X-CSRFToken'] = token;
    }

    let payload;
    if (body !== undefined && body !== null && upper !== 'GET') {
      headers['Content-Type'] = 'application/json';
      payload = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const started = performance.now();

    try {
      const res = await fetch(url, {
        method: upper,
        headers,
        body: payload,
        credentials: 'include',
        cache: 'no-store'
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
        url,
        cached: false
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
        networkError: true,
        cached: false
      };
    } finally {
      if (shareable) inFlightRequests.delete(url);
    }
  };

  const promise = executeFetch();
  if (shareable) {
    inFlightRequests.set(url, promise);
  }
  return promise;
}

export const api = {
  get: (path, query, options = {}) => apiRequest('GET', path, { query, ...options }),
  post: (path, body, query, options = {}) =>
    apiRequest('POST', path, { body, query, ...options }),
  patch: (path, body, query, options = {}) =>
    apiRequest('PATCH', path, { body, query, ...options }),
  put: (path, body, query, options = {}) =>
    apiRequest('PUT', path, { body, query, ...options }),
  delete: (path, query, options = {}) => apiRequest('DELETE', path, { query, ...options })
};
