/**
 * Odoo invoice sync (backend brief docs/odoo-invoice-sync-brief_2026-11-13.md). Pull only: the backend reads Odoo;
 * nothing here sends invoice data anywhere. The Odoo API key is sent once when IT saves or tests it and is never
 * returned by the server, so this file never stores it.
 */
import { api } from './apiClient.js';

export const odooApi = {
  invoices: (query) => api.get('/api/odoo/invoices', query),
  invoice: (id, raw = false) => api.get(`/api/odoo/invoices/${id}`, raw ? { raw: 1 } : undefined),
  syncRuns: () => api.get('/api/odoo/sync-runs'),
  // choice: {mode: 'changes' | 'all' | 'custom', invoice_from?, invoice_to?, numbers?}
  syncNow: (choice = { mode: 'changes' }) => api.post('/api/odoo/sync', choice),
  syncRequest: (id) => api.get(`/api/odoo/sync-requests/${id}`),
  settings: () => api.get('/api/odoo/settings'),
  saveSettings: (body) => api.put('/api/odoo/settings', body),
  removeKey: () => api.delete('/api/odoo/settings/api-key'),
  testConnection: (body) => api.post('/api/odoo/settings/test', body)
};

/** Plain message from an error response: {message}, {detail}, or the first field error of a 400. */
export function errorText(res, fallback = 'Something went wrong. Try again.') {
  if (!res) return fallback;
  if (res.networkError) return 'The server is not answering. Check the connection and try again.';
  const data = res.data;
  if (data && typeof data === 'object') {
    if (typeof data.message === 'string' && data.message) return data.message;
    if (typeof data.detail === 'string' && data.detail) return data.detail;
    const first = Object.values(data).find((v) => typeof v === 'string' || Array.isArray(v));
    if (first) return Array.isArray(first) ? String(first[0]) : first;
  }
  return fallback;
}

/** Field errors of a 400 ({field: "message"} or {field: ["message"]}) as {field: "message"}. */
export function fieldErrors(res) {
  if (!res || res.status !== 400 || !res.data || typeof res.data !== 'object') return {};
  const out = {};
  Object.entries(res.data).forEach(([k, v]) => {
    out[k] = Array.isArray(v) ? String(v[0]) : String(v);
  });
  return out;
}

export const SYNC_STATUS = {
  ok: { label: 'Up to date', tone: 'ok' },
  stale: { label: 'Not synced for 30+ min', tone: 'warn' },
  failing: { label: 'Last sync failed', tone: 'bad' },
  off: { label: 'Not set up', tone: 'off' }
};

export function keyBanner(status, daysLeft, expiresOn) {
  if (status === 'expired') {
    return { tone: 'bad', text: `The Odoo API key expired on ${expiresOn}. IT must make a new key in Odoo and enter it in Settings → Odoo connection.` };
  }
  if (status === 'expires_soon') {
    return { tone: 'warn', text: `The Odoo API key expires on ${expiresOn} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left). IT should make a new key in Odoo soon.` };
  }
  return null;
}

export function syncSummary(summary) {
  if (!summary) return '';
  const n = (k) => Number(summary[k] || 0);
  const parts = [`${n('new')} new`, `${n('updated')} updated`, `${n('unchanged')} unchanged`];
  if (n('skipped')) parts.push(`${n('skipped')} skipped`);
  if (n('buyers_refreshed')) parts.push(`${n('buyers_refreshed')} buyers refreshed`);
  return parts.join(', ');
}

export function formatMoney(value, currency) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  const text = Number.isFinite(num)
    ? num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(value);
  return currency ? `${currency} ${text}` : text;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit' });
}
