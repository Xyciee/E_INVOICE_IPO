import React, { useCallback, useEffect, useState } from 'react';
import { Eye, PackageX, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotify } from '../context/NotificationContext';
import { api } from '../services/apiClient.js';
import { errorText, formatDateTime } from '../services/odooService';
import {
  fetchDocumentDetails,
  fetchOrderDraft,
  getSavedStationCode,
  issueMissedScanOrder,
  normalizeDocumentRecord,
  stationCodesOf
} from '../services/scanService';
import WaybillTicket from '../components/WaybillTicket';
import './pages.css';
import './odoo.css';

/*
 * Missed scans (brief 2026-11-25 §3): parcels the carrier has already picked up without an e-invoice.
 *   GET /api/missed-scans                 (view_documents: Order Manager, Accounting, Executive, IT)
 *   POST /api/orders/<p>/<s>/<o>/issue    (issue_missed_scan: Order Manager, IT) for "due" rows only
 * "hold" rows show the reason from the database and have no button: a person must look first. The box has left,
 * so delivery is electronic (QR / buyer portal); the invoice is then in the Invoices Tracker like any other.
 * Every row opens an invoice preview (the live draft, GET /api/orders/<p>/<s>/<o>/draft); Issue invoice is pressed
 * there, and the dialog then shows the issued invoice with its number and QR code (user request 2026-11-25).
 */

const STATE_CHIP = {
  due: ['odoo-chip-warn', 'Missed scan'],
  hold: ['odoo-chip-bad', 'On hold']
};

const PLATFORM_NAMES = { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok' };

const rowKey = (r) => `${r.platform}:${r.store_id}:${r.platform_order_id}`;

// What the slip shows for a marketplace order before issuing: the generic buyer prints blank (decision 2026-11-25).
const BLANK_BUYER = { buyer: { show: false, name: '', address: '', tin_branch: '' } };

export default function MissedScansPage({ onNavigate }) {
  const { user } = useAuth();
  const notify = useNotify();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  // {row, phase: 'loading' | 'draft' | 'issuing' | 'issued', doc, state, holdReason, loadError, problem}
  const [preview, setPreview] = useState(null);

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

  const openPreview = async (row) => {
    setPreview({ row, phase: 'loading' });
    const res = await fetchOrderDraft(row.platform, row.store_id, row.platform_order_id);
    const draft = res?.ok ? res.data?.draft : null;
    if (!draft) {
      const loadError = errorText(res, 'The invoice preview could not be loaded.');
      setPreview((p) => (p && p.row === row ? { row, phase: 'draft', loadError } : p));
      return;
    }
    const doc = normalizeDocumentRecord(res.data);
    const state = String(draft.state || '').toLowerCase();
    setPreview((p) => (p && p.row === row ? { row, phase: 'draft', doc, state, holdReason: draft.hold_reason } : p));
  };

  const issueFromPreview = async () => {
    const row = preview?.row;
    if (!row || preview.phase !== 'draft') return;
    if (!station) {
      notify.danger('No station', 'Your account has no packing station. Ask IT to add one, then try again.');
      return;
    }
    setPreview((p) => ({ ...p, phase: 'issuing', problem: null }));
    const res = await issueMissedScanOrder(row.platform, row.store_id, row.platform_order_id, {
      tracking: row.tracking_number,
      station
    });
    const outcome = res.data?.outcome;
    if (res.ok && (outcome === 'issued' || outcome === 'already_issued')) {
      const issuedId = res.data?.document?.id;
      // Read the issued document again: real number, QR code and the printout rules (buyer block, buyer paid).
      const detail = issuedId ? await fetchDocumentDetails(issuedId) : null;
      const doc = normalizeDocumentRecord(detail?.ok && detail.data ? detail.data : res.data);
      setPreview((p) => ({ ...p, phase: 'issued', doc, alreadyIssued: outcome === 'already_issued' }));
      notify.success(
        outcome === 'issued' ? 'Invoice issued' : 'Already invoiced',
        `${doc?.documentNumber || ''} for order ${row.platform_order_id}.`
      );
    } else {
      const problem = outcome === 'blocked'
        ? res.data?.problem || 'This order cannot be invoiced yet.'
        : errorText(res, 'The server did not issue the invoice. Try again.');
      setPreview((p) => ({ ...p, phase: 'draft', problem }));
      notify.danger('Invoice not issued', problem);
    }
    load();
  };

  const closePreview = () => {
    if (preview?.phase !== 'issuing') setPreview(null);
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
                          <button className="btn btn-primary" onClick={() => openPreview(r)}>
                            Issue invoice…
                          </button>
                        ) : (
                          <button className="btn btn-outline" onClick={() => openPreview(r)}>
                            <Eye size={14} /> Preview
                          </button>
                        )}
                        {r.state === 'hold' && (
                          <div className="odoo-muted" style={{ marginTop: 4 }}>Look at the reason first</div>
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

      {preview && (
        <PreviewDialog
          preview={preview}
          canIssue={canIssue}
          onIssue={issueFromPreview}
          onClose={closePreview}
          onOpenTracker={onNavigate ? () => { setPreview(null); onNavigate('invoices'); } : null}
        />
      )}
    </div>
  );
}

const WARN_BOX = {
  margin: '12px 0', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid #f59e0b',
  background: 'rgba(245, 158, 11, 0.12)', fontSize: '0.82rem'
};

/*
 * Invoice preview for one missed-scan order. Before issuing: the live draft (exactly what issuing will store), with
 * the buyer block blank like the printout. After issuing: the issued invoice (number, QR code, amount paid by buyer).
 */
function PreviewDialog({ preview, canIssue, onIssue, onClose, onOpenTracker }) {
  const { row, phase, doc, loadError, problem } = preview;
  const issued = phase === 'issued';
  const state = issued ? 'issued' : preview.state || row.state;
  const showIssue = canIssue && !issued && !loadError && state === 'due' && (phase === 'draft' || phase === 'issuing');
  const reason = preview.holdReason || row.hold_reason;
  let subtitle;
  if (issued) {
    subtitle = preview.alreadyIssued
      ? 'This order already had this invoice. Nothing new was issued.'
      : 'Issued. The buyer can open it through the QR link; it is also in the Invoices Tracker.';
  } else {
    subtitle = `Waybill ${row.tracking_number || '—'} has already left. Check the items and totals; the invoice ` +
      'number is given only when you press Issue invoice. An issued invoice cannot be changed or deleted.';
  }
  return (
    <div className="scan-modal-backdrop no-print" onClick={onClose}>
      <div className="doc-modal-card" style={{ maxWidth: '520px' }} role="dialog" aria-modal="true"
        aria-label="Invoice preview" onClick={(e) => e.stopPropagation()}>
        <div className="doc-modal-header">
          <div>
            <h2 className="card-section-title"
              style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Eye size={17} color="var(--primary)" />
              {issued ? `Invoice ${doc?.documentNumber || ''}` : `Invoice preview - order ${row.platform_order_id}`}
            </h2>
            <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>{subtitle}</p>
          </div>
        </div>

        {phase === 'loading' ? (
          <p style={{ margin: '16px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Loading the invoice preview...
          </p>
        ) : (
          <>
            {loadError && <div style={WARN_BOX}><strong>{loadError} Nothing was issued. Close and try again.</strong></div>}
            {problem && <div style={WARN_BOX}><strong>Not issued:</strong> {problem}</div>}
            {!issued && !loadError && state !== 'due' && (
              <div style={WARN_BOX}>
                <strong>This order cannot be invoiced yet ({String(state).replace(/_/g, ' ')}).</strong>
                {reason && <div style={{ marginTop: '4px' }}>{reason}</div>}
              </div>
            )}
            {doc && (
              <div style={{ maxHeight: '60vh', overflowY: 'auto', margin: '12px 0' }}>
                <WaybillTicket
                  platform={doc.platform || row.platform}
                  storeName={doc.storeName || row.store_name}
                  copyTag={issued ? 'ORIGINAL' : 'PREVIEW'}
                  invoiceNumber={issued ? doc.documentNumber : 'Given when issued'}
                  issuedAt={issued ? doc.issuedAt : ''}
                  orderId={row.platform_order_id}
                  lines={doc.lines || []}
                  discountAmount={doc.discountAmount || '0.00'}
                  vatableSales={doc.vatableSales || '0.00'}
                  vatAmount={doc.vatAmount || '0.00'}
                  vatExemptSales={doc.vatExemptSales || '0.00'}
                  zeroRatedSales={doc.zeroRatedSales || '0.00'}
                  totalAmount={doc.totalAmount || '0.00'}
                  portalQrSvg={issued ? doc.portalQrSvg : null}
                  printout={issued && doc.printout ? doc.printout : BLANK_BUYER}
                  buyerPaidAmount={issued ? doc.buyerPaidAmount : null}
                />
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          {issued && onOpenTracker && (
            <button type="button" className="btn btn-outline" onClick={onOpenTracker}>Open Invoices Tracker</button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={phase === 'issuing'}>
            Close
          </button>
          {showIssue && (
            <button type="button" className="btn btn-primary" onClick={onIssue} disabled={phase === 'issuing'}>
              {phase === 'issuing' ? 'Issuing...' : 'Issue invoice'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
