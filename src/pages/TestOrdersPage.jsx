import React, { useCallback, useEffect, useState } from 'react';
import { Copy, FlaskConical, RefreshCw } from 'lucide-react';
import { useNotify } from '../context/NotificationContext';
import { api } from '../services/apiClient.js';
import { errorText, formatDateTime } from '../services/odooService';
import './pages.css';
import './odoo.css';

/*
 * Test Orders (IT, permission create_test_orders, STAGING ONLY): make fake Shopee / Lazada / TikTok orders, then
 * scan their waybill at the Packing Scan screen like a real parcel.
 *   GET/POST /api/test-orders, POST /api/test-orders/<platform>/<store_id>/<order_id>/status
 * The backend answers 404 on production; the menu shows this screen only when /api/me says app_env = staging.
 */

const STATE_CHIP = {
  due: ['odoo-chip-info', 'Ready to invoice'],
  issued: ['odoo-chip-ok', 'Invoiced'],
  hold: ['odoo-chip-bad', 'Held'],
  waiting: ['odoo-chip-warn', 'Waiting'],
  not_invoiced: ['odoo-chip-off', 'Not invoiced'],
  before_start: ['odoo-chip-off', 'Before start']
};

const STATUS_LABELS = {
  paid: 'Paid', unpaid: 'Unpaid', shipped: 'Shipped', completed: 'Completed', cancelled: 'Cancelled',
  returned: 'Returned'
};

function storeKey(s) {
  return `${s.platform}:${s.store_id}`;
}

export default function TestOrdersPage() {
  const notify = useNotify();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ store: '', scenario: 'ready', count: 1 });
  const [busy, setBusy] = useState(false);
  const [lastMade, setLastMade] = useState([]);
  const [unitsOrder, setUnitsOrder] = useState(null); // the order whose units are being cancelled / returned

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get('/api/test-orders');
    setLoading(false);
    if (!res.ok) {
      setError(errorText(res, 'Could not load the test orders.'));
      return;
    }
    setError('');
    setInfo(res.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const make = async () => {
    const body = { scenario: form.scenario, count: Number(form.count) };
    if (form.store) {
      const [platform, storeId] = form.store.split(':');
      body.platform = platform;
      body.store_id = Number(storeId);
    }
    setBusy(true);
    const res = await api.post('/api/test-orders', body);
    setBusy(false);
    if (!res.ok) {
      notify.danger('No test orders made', errorText(res, `The server said ${res.status}.`));
      return;
    }
    setLastMade(res.data.orders || []);
    notify.success('Test orders made', `${res.data.orders.length} order(s). Scan the waybill at the Packing Scan screen.`);
    load();
  };

  const setStatus = async (order, status) => {
    const url = `/api/test-orders/${order.platform}/${order.store_id}/${encodeURIComponent(order.platform_order_id)}/status`;
    const res = await api.post(url, { status });
    if (!res.ok) {
      notify.danger('Status not changed', errorText(res, `The server said ${res.status}.`));
      return;
    }
    notify.success('Status changed', `${order.platform_order_id} is now ${STATUS_LABELS[status] || status}.`);
    load();
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      notify.success('Copied', text);
    } catch {
      notify.danger('Not copied', 'Select the waybill number and copy it by hand.');
    }
  };

  const scenario = info?.scenarios?.find((s) => s.code === form.scenario);
  const unitPlatforms = info?.unit_statuses || {};

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Test Orders</h1>
          <p className="page-subtitle">
            Staging only. Make fake marketplace orders, then scan their waybill at Packing Scan like a real parcel.
            Test invoices are numbered TEST-… and never reach production.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'odoo-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="odoo-banner odoo-banner-bad">{error}</div>}
      {info && !info.available && <div className="odoo-banner odoo-banner-bad">{info.reason}</div>}

      {info?.available && (
        <div className="card-section">
          <div className="odoo-filters">
            <label>
              Store
              <select className="odoo-input" value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })}>
                <option value="">Any store (random)</option>
                {info.stores.map((s) => (
                  <option key={storeKey(s)} value={storeKey(s)}>{s.platform} · {s.store_name}</option>
                ))}
              </select>
            </label>
            <label>
              What to test
              <select className="odoo-input" value={form.scenario}
                onChange={(e) => setForm({ ...form, scenario: e.target.value })}>
                {info.scenarios.map((s) => <option key={s.code} value={s.code}>{s.code.replace('_', ' ')}</option>)}
              </select>
            </label>
            <label>
              How many
              <input className="odoo-input" type="number" min={1} max={info.max_count} value={form.count}
                onChange={(e) => setForm({ ...form, count: e.target.value })} />
            </label>
            <button className="btn btn-primary" onClick={make} disabled={busy} style={{ alignSelf: 'flex-end' }}>
              <FlaskConical size={16} /> {busy ? 'Making…' : 'Make test orders'}
            </button>
          </div>
          {scenario && <p className="odoo-muted" style={{ marginTop: 8 }}>{scenario.description}</p>}
          {lastMade.length > 0 && (
            <div className="odoo-banner" style={{ marginTop: 12 }}>
              Just made — waybills to scan:{' '}
              {lastMade.map((o) => (
                <button key={o.platform_order_id} className="btn btn-outline" style={{ margin: '4px 6px 0 0' }}
                  onClick={() => copy(o.tracking_number)} title="Copy the waybill number">
                  <Copy size={14} /> {o.tracking_number}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {info?.available && (
        <div className="card-section">
          <div className="table-responsive">
            <table className="data-table odoo-table">
              <thead>
                <tr>
                  <th>Made</th>
                  <th>Store</th>
                  <th>Order</th>
                  <th>Waybill</th>
                  <th>Status</th>
                  <th>Invoice</th>
                  <th className="num">Total</th>
                  <th>Change status</th>
                </tr>
              </thead>
              <tbody>
                {info.orders.map((o) => {
                  const [chipClass, chipText] = STATE_CHIP[o.state] || ['odoo-chip-off', o.state || '—'];
                  return (
                    <tr key={`${o.platform}:${o.store_id}:${o.platform_order_id}`} style={{ cursor: 'default' }}>
                      <td>{formatDateTime(o.created_at)}<div className="odoo-muted">{o.scenario} · {o.created_by}</div></td>
                      <td>{o.platform}<div className="odoo-muted">{o.store_name}</div></td>
                      <td style={{ fontFamily: 'monospace' }}>{o.platform_order_id}</td>
                      <td>
                        <button className="btn btn-outline" onClick={() => copy(o.tracking_number)} title="Copy">
                          <Copy size={14} /> <span style={{ fontFamily: 'monospace' }}>{o.tracking_number}</span>
                        </button>
                      </td>
                      <td>{o.order_status}</td>
                      <td>
                        <span className={`odoo-chip ${chipClass}`} title={o.hold_reason || ''}>{chipText}</span>
                        {o.invoice_number && <div style={{ fontFamily: 'monospace' }}>{o.invoice_number}</div>}
                        {o.hold_reason && <div className="odoo-muted">{o.hold_reason}</div>}
                      </td>
                      <td className="num">{o.total_amount}</td>
                      <td>
                        <select className="odoo-input" value="" onChange={(e) => e.target.value && setStatus(o, e.target.value)}>
                          <option value="">Set to…</option>
                          {info.statuses.filter((s) => !(o.platform === 'tiktok' && s === 'returned')).map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                          ))}
                        </select>
                        {unitPlatforms[o.platform] && (
                          <button className="btn btn-outline" style={{ marginTop: 6, width: '100%' }}
                            disabled={!info.units_available}
                            title={info.units_available ? 'Cancel or return some units (partial credit note)'
                              : 'Needs sql/14s_test_order_units_staging_2026-11-21.sql on staging'}
                            onClick={() => setUnitsOrder(o)}>
                            Cancel units…
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!loading && info.orders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="odoo-muted" style={{ textAlign: 'center', padding: '28px' }}>
                      No test orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {unitsOrder && (
        <UnitsDialog order={unitsOrder} onClose={() => setUnitsOrder(null)} onChanged={load} />
      )}
    </div>
  );
}

const UNIT_STATUS_LABELS = { cancelled: 'Cancelled', returned: 'Returned' };

/*
 * Cancel or return some units of one Lazada / TikTok test order (they keep one item row per unit). Once the order is
 * invoiced, the Credit Notes work list then suggests "credit lines" for exactly these units.
 */
function UnitsDialog({ order, onClose, onChanged }) {
  const notify = useNotify();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ sku: '', units: 1, status: 'cancelled' });
  const [busy, setBusy] = useState(false);
  const url = `/api/test-orders/${order.platform}/${order.store_id}/${encodeURIComponent(order.platform_order_id)}/units`;

  useEffect(() => {
    let alive = true;
    api.get(url).then((res) => {
      if (!alive) return;
      if (!res.ok) {
        setError(errorText(res, 'Could not load the items of this order.'));
        return;
      }
      setData(res.data);
      setForm((f) => ({ ...f, sku: res.data.lines[0]?.sku || '' }));
    });
    return () => { alive = false; };
  }, [url]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await api.post(url, { sku: form.sku, units: Number(form.units), status: form.status });
    setBusy(false);
    if (!res.ok) {
      setError(errorText(res, `The server said ${res.status}.`));
      return;
    }
    setData((d) => ({ ...d, lines: res.data.lines }));
    setError('');
    notify.success('Units changed', `${res.data.changed.length} unit(s) of ${form.sku} set to ${UNIT_STATUS_LABELS[form.status]}.`);
    onChanged();
  };

  const summary = (line) => Object.entries(line.statuses || {})
    .map(([status, units]) => `${Number(units)} ${status || 'no status'}`).join(', ');

  return (
    <div className="odoo-modal-backdrop" onClick={() => !busy && onClose()}>
      <form className="odoo-modal" role="dialog" aria-modal="true" aria-labelledby="units-dialog-title"
        onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="odoo-modal-header">
          <div>
            <h2 className="odoo-modal-title" id="units-dialog-title">Cancel units</h2>
            <p className="odoo-modal-subtitle">
              {order.platform} · {order.platform_order_id}. Invoice the order first (scan it); the Credit Notes list then
              suggests crediting exactly these units.
            </p>
          </div>
          <button type="button" className="odoo-close" onClick={onClose} disabled={busy} aria-label="Close">&times;</button>
        </div>

        <div className="odoo-modal-body">
          {error && <div className="odoo-banner odoo-banner-bad">{error}</div>}
          {!data && !error && <p className="odoo-muted">Loading…</p>}
          {data && (
            <>
              <table className="data-table odoo-table" style={{ marginBottom: 12 }}>
                <thead><tr><th>Item</th><th className="num">Units</th><th>Status of the units</th></tr></thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={`${l.sku}:${l.unit_price}`} style={{ cursor: 'default' }}>
                      <td>{l.name}<div className="odoo-muted">{l.sku} · ₱{l.unit_price}</div></td>
                      <td className="num">{Number(l.units)}</td>
                      <td>{summary(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="odoo-filters">
                <label>
                  Item
                  <select className="odoo-input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}>
                    {data.lines.map((l) => <option key={`${l.sku}:${l.unit_price}`} value={l.sku}>{l.sku}</option>)}
                  </select>
                </label>
                <label>
                  Units
                  <input className="odoo-input" type="number" min={1} max={20} value={form.units}
                    onChange={(e) => setForm({ ...form, units: e.target.value })} />
                </label>
                <label>
                  New status
                  <select className="odoo-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {data.statuses.map((s) => <option key={s} value={s}>{UNIT_STATUS_LABELS[s] || s}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}
        </div>

        <div className="odoo-modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Close</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !data || !form.sku}>
            {busy ? 'Saving…' : 'Set units'}
          </button>
        </div>
      </form>
    </div>
  );
}
