import React, { useCallback, useEffect, useState } from 'react';
import { PackageX, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConfirm, useNotify } from '../context/NotificationContext';
import { api } from '../services/apiClient.js';
import { errorText, formatDateTime } from '../services/odooService';
import { getSavedStationCode, issueMissedScanOrder, stationCodesOf } from '../services/scanService';
import './pages.css';
import './odoo.css';

/*
 * Missed scans (brief 2026-11-25 §3): parcels the carrier has already picked up without an e-invoice.
 *   GET /api/missed-scans                 (view_documents: Order Manager, Accounting, Executive, IT)
 *   POST /api/orders/<p>/<s>/<o>/issue    (issue_missed_scan: Order Manager, IT) for "due" rows only
 * "hold" rows show the reason from the database and have no button: a person must look first. The box has left,
 * so delivery is electronic (QR / buyer portal); the invoice is then in the Invoices Tracker like any other.
 */

const STATE_CHIP = {
  due: ['odoo-chip-warn', 'Missed scan'],
  hold: ['odoo-chip-bad', 'On hold']
};

const PLATFORM_NAMES = { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok' };

const rowKey = (r) => `${r.platform}:${r.store_id}:${r.platform_order_id}`;

export default function MissedScansPage({ onNavigate }) {
  const { user } = useAuth();
  const notify = useNotify();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const stationCodes = stationCodesOf(user?.stations);
  const savedStation = getSavedStationCode();
  const station = stationCodes.includes(savedStation) ? savedStation : stationCodes[0] || '';

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get(`/api/missed-scans${stateFilter ? `?state=${stateFilter}` : ''}`);
    setLoading(false);
    if (!res.ok) {
      setError(errorText(res, 'Could not load the missed scans.'));
      return;
    }
    setError('');
    setData(res.data);
  }, [stateFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const issue = async (row) => {
    if (!station) {
      notify.danger('No station', 'Your account has no packing station. Ask IT to add one, then try again.');
      return;
    }
    const ok = await confirm({
      title: `Issue the invoice for order ${row.platform_order_id}?`,
      message:
        `The parcel (waybill ${row.tracking_number || '—'}) has already left. The invoice gets its number now ` +
        `(invoice total ₱${row.total_amount}) and the buyer sees it through the QR link. An invoice cannot be undone.`,
      confirmText: 'Issue invoice',
      variant: 'warning'
    });
    if (!ok) return;
    setBusyKey(rowKey(row));
    const res = await issueMissedScanOrder(row.platform, row.store_id, row.platform_order_id, {
      tracking: row.tracking_number,
      station
    });
    setBusyKey('');
    const outcome = res.data?.outcome;
    if (res.ok && (outcome === 'issued' || outcome === 'already_issued')) {
      const number = res.data?.document?.document_number || '';
      notify.success(
        outcome === 'issued' ? 'Invoice issued' : 'Already invoiced',
        `${number} for order ${row.platform_order_id}. It is in the Invoices Tracker for printing or sending.`
      );
    } else if (outcome === 'blocked') {
      notify.danger('Invoice not issued', res.data?.problem || 'This order cannot be invoiced yet.');
    } else {
      notify.danger('Invoice not issued', errorText(res, 'The server did not issue the invoice. Try again.'));
    }
    load();
  };

  const rows = data?.results || [];
  const totals = data?.totals || { count: 0, due: 0, hold: 0 };
  const canIssue = Boolean(data?.can_issue);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Missed scans</h1>
          <p className="page-subtitle">
            Parcels the courier has already picked up without an e-invoice. Issue the invoice for each
            missed scan; orders on hold need a person to look first.
          </p>
        </div>
        <div className="page-actions">
          <select className="odoo-input" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}
            aria-label="Show">
            <option value="">All ({totals.count})</option>
            <option value="due">Missed scans only</option>
            <option value="hold">On hold only</option>
          </select>
          <button className="btn btn-outline" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'odoo-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="odoo-banner odoo-banner-bad">{error}</div>}
      {data && !data.available && <div className="odoo-banner odoo-banner-bad">{data.problem}</div>}

      {data?.available && (
        <div className="card-section">
          <p className="odoo-muted" style={{ marginTop: 0 }}>
            {totals.due} to issue · {totals.hold} on hold
            {!canIssue && ' · You can look at this list; Order Managers and IT issue the invoices.'}
          </p>
          <div className="table-responsive">
            <table className="data-table odoo-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Order</th>
                  <th>Waybill</th>
                  <th>Platform status</th>
                  <th>State</th>
                  <th className="num">Invoice total</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const [chipClass, chipText] = STATE_CHIP[r.state] || ['odoo-chip-off', r.state || '—'];
                  const key = rowKey(r);
                  return (
                    <tr key={key} style={{ cursor: 'default' }}>
                      <td>
                        {PLATFORM_NAMES[r.platform] || r.platform}
                        <div className="odoo-muted">{r.store_name}</div>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>
                        {r.platform_order_id}
                        <div className="odoo-muted" style={{ fontFamily: 'inherit' }}>
                          Ordered {formatDateTime(r.order_created_at)}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>
                        {r.tracking_number || '—'}
                        {r.shipping_carrier && <div className="odoo-muted">{r.shipping_carrier}</div>}
                      </td>
                      <td>
                        {r.platform_order_status || '—'}
                        <div className="odoo-muted">Updated {formatDateTime(r.last_update)}</div>
                      </td>
                      <td>
                        <span className={`odoo-chip ${chipClass}`}>{chipText}</span>
                        {r.hold_reason && <div className="odoo-muted" style={{ maxWidth: 320 }}>{r.hold_reason}</div>}
                      </td>
                      <td className="num">
                        {r.total_amount != null ? `₱${r.total_amount}` : '—'}
                        {r.vat_amount != null && <div className="odoo-muted">VAT ₱{r.vat_amount}</div>}
                      </td>
                      <td>
                        {r.state === 'due' && canIssue ? (
                          <button className="btn btn-primary" onClick={() => issue(r)} disabled={busyKey === key}>
                            {busyKey === key ? 'Issuing…' : 'Issue invoice'}
                          </button>
                        ) : r.state === 'hold' ? (
                          <span className="odoo-muted">Look at the reason first</span>
                        ) : (
                          <span className="odoo-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="odoo-muted" style={{ textAlign: 'center', padding: '28px' }}>
                      <PackageX size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                      No missed scans. Every parcel that left has its e-invoice.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {canIssue && onNavigate && (
            <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => onNavigate('invoices')}>
              Open Invoices Tracker
            </button>
          )}
        </div>
      )}
    </div>
  );
}
