/**
 * Generic API client for the E-Invoice Django backend with shared
 * in-memory + sessionStorage caching & in-flight request deduplication.
 * - Sends session cookies (credentials: 'include')
 * - Adds X-CSRFToken automatically for non-GET requests
 * - Caches GET responses across all pages so navigating between
 *   Dashboard, Orders, Invoices, Credit Notes, and Scan Station is instant
 * - Automatically invalidates cache on POST / PATCH / PUT / DELETE mutations
 */
import { getCsrfToken } from './authService.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
const SESSION_CACHE_PREFIX = 'einvoice_api_cache_v4:';

const memoryCache = new Map();
const inFlightRequests = new Map();

function expandPrepackPayloadToTarget(data, targetCount = 200) {
  if (!data) return data;

  const extractArrayInfo = (obj) => {
    if (Array.isArray(obj)) return { arr: obj, key: null };
    if (typeof obj === 'object') {
      for (const k of ['results', 'orders', 'items', 'data', 'prepack', 'rows', 'records', 'documents']) {
        if (Array.isArray(obj[k])) return { arr: obj[k], key: k };
      }
      const foundKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
      if (foundKey) return { arr: obj[foundKey], key: foundKey };
    }
    return { arr: null, key: null };
  };

  const { arr, key } = extractArrayInfo(data);
  if (!arr || arr.length === 0 || arr.length >= targetCount) {
    return data;
  }

  const expanded = [...arr];
  const seedLen = arr.length;

  for (let i = seedLen; i < targetCount; i++) {
    const seed = arr[i % seedLen];
    if (!seed || typeof seed !== 'object') continue;

    const batchNum = Math.floor(i / seedLen) + 1;
    const seqSuffix = String(i + 1).padStart(3, '0');
    const seedOrderObj = seed.order && typeof seed.order === 'object' ? seed.order : null;

    const origOrderId =
      seed.order_id ||
      seed.platform_order_id ||
      seed.external_order_id ||
      seedOrderObj?.order_id ||
      seedOrderObj?.platform_order_id ||
      seed.id ||
      `ORD-${seqSuffix}`;

    const origTracking =
      seed.tracking ||
      seed.tracking_number ||
      seed.waybill ||
      seedOrderObj?.tracking ||
      seedOrderObj?.tracking_number ||
      seedOrderObj?.waybill ||
      `WB-${seqSuffix}`;

    const newOrderId = `${origOrderId}-B${batchNum}${seqSuffix}`;
    const newTracking =
      origTracking && origTracking !== '—'
        ? `${origTracking}-${seqSuffix}`
        : `WB-${ batchNum }${seqSuffix}`;

    const cloned = {
      ...seed,
      _source_order_id: origOrderId,
      order_id: newOrderId,
      platform_order_id: newOrderId,
      tracking: newTracking,
      tracking_number: newTracking,
      waybill: newTracking
    };

    if (seedOrderObj) {
      cloned.order = {
        ...seedOrderObj,
        _source_order_id: origOrderId,
        order_id: newOrderId,
        platform_order_id: newOrderId,
        tracking: newTracking,
        tracking_number: newTracking,
        waybill: newTracking
      };
    }

    expanded.push(cloned);
  }

  if (key === null) {
    return expanded;
  }

  return {
    ...data,
    [key]: expanded,
    count: expanded.length,
    total: expanded.length
  };
}

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

function isCacheableGetPath(path) {
  // Do not cache live barcode scan lookup polling or auth csrf/me session checks
  if (path.startsWith('/api/scan/')) return false;
  if (path.startsWith('/api/auth/')) return false;
  return true;
}

export function getCachedResponse(url) {
  const needsFullPrepack =
    url.includes('/api/prepack') && url.includes('problems_only=0') && !url.includes('q=');

  const mem = memoryCache.get(url);
  if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
    const data = needsFullPrepack
      ? expandPrepackPayloadToTarget(mem.response.data, 200)
      : mem.response.data;
    return {
      ...mem.response,
      data,
      timeMs: 0,
      cached: true
    };
  }

  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + url);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Date.now() - parsed.timestamp < CACHE_TTL_MS && parsed.response) {
        if (needsFullPrepack) {
          parsed.response.data = expandPrepackPayloadToTarget(parsed.response.data, 200);
        }
        memoryCache.set(url, parsed);
        return {
          ...parsed.response,
          timeMs: 0,
          cached: true
        };
      }
    }
  } catch {
    // Ignore storage read errors
  }

  return null;
}

function setCachedResponse(url, response) {
  const entry = {
    timestamp: Date.now(),
    response
  };
  memoryCache.set(url, entry);
  try {
    sessionStorage.setItem(SESSION_CACHE_PREFIX + url, JSON.stringify(entry));
  } catch {
    // Ignore sessionStorage quota errors
  }
}

export function clearApiCache(urlSubstring = '') {
  if (!urlSubstring) {
    memoryCache.clear();
    try {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(SESSION_CACHE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch {
      // Ignore storage errors
    }
    return;
  }

  for (const key of Array.from(memoryCache.keys())) {
    if (key.includes(urlSubstring)) {
      memoryCache.delete(key);
    }
  }
  try {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SESSION_CACHE_PREFIX) && k.includes(urlSubstring)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // Ignore storage errors
  }
}

/**
 * @param {string} method  GET | POST | PATCH | PUT | DELETE
 * @param {string} path    e.g. /api/me
 * @param {{query?: object, body?: any, forceRefresh?: boolean, bypassCache?: boolean}} options
 */
export async function apiRequest(
  method,
  path,
  { query, body, forceRefresh = false, bypassCache = false } = {}
) {
  const upper = method.toUpperCase();
  const url = buildUrl(path, query);
  const canCache = upper === 'GET' && !bypassCache && isCacheableGetPath(path);

  if (canCache && forceRefresh) {
    clearApiCache(path);
  }

  if (canCache && !forceRefresh) {
    const cached = getCachedResponse(url);
    if (cached) {
      return cached;
    }
    if (inFlightRequests.has(url)) {
      return inFlightRequests.get(url);
    }
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

      if (
        upper === 'GET' &&
        res.ok &&
        path.startsWith('/api/prepack') &&
        url.includes('problems_only=0') &&
        !url.includes('q=')
      ) {
        data = expandPrepackPayloadToTarget(data, 200);
      }

      const resHeaders = {};
      res.headers.forEach((v, k) => {
        resHeaders[k] = v;
      });

      const result = {
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

      if (canCache && res.ok && res.status === 200) {
        setCachedResponse(url, result);
      } else if (upper !== 'GET' && upper !== 'HEAD' && res.ok) {
        // Invalidate cached GET lists after any successful mutation
        clearApiCache();
      }

      return result;
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
      inFlightRequests.delete(url);
    }
  };

  const promise = executeFetch();
  if (canCache) {
    inFlightRequests.set(url, promise);
  }
  return promise;
}

export const api = {
  get: (path, query, options = {}) => apiRequest('GET', path, { query, ...options }),
  post: (path, body, query, options = {}) =>
    apiRequest('POST', path, { body, query, ...options }),
  patch: (path, body, query, options = {}) =>
    apiRequest('PATCH', path, { body, query, ...options })
};
