import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw, Search, AlertTriangle, CloudDownload, CloudUpload, FileText, Printer, Zap, Layers, ListFilter, Check, SearchCheck, Info
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotify } from '../context/NotificationContext';
import {
  odooApi, errorText, fieldErrors, SYNC_STATUS, keyBanner, syncSummary, formatMoney, formatDateTime
} from '../services/odooService';
import OdooInvoiceSheet from '../components/OdooInvoiceSheet';
import { buildOdooInvoice, ODOO_INVOICE_SHEET_CSS } from '../services/odooInvoicePrint';
import { printElement } from '../services/printSheet';
import './pages.css';
import './odoo.css';

/*
 * Odoo invoices (Executive, Accounting, IT): customer invoices and refunds the backend pulled from Odoo.
 *   GET  /api/odoo/invoices, /api/odoo/invoices/<id>   (view_odoo_invoices; ?raw=1 for IT only)
 *   GET  /api/odoo/sync-runs                           sync status, schedule, key expiry
 *   POST /api/odoo/sync                                Sync now (run_odoo_sync: Accounting, IT) — only queues
 *   GET  /api/odoo/sync-requests/<id>                  polled every 2 s until done / failed
 * Nothing is kept in the browser: every list comes from the server.
 */

const PAGE_SIZE = 50;
const POLL_MS = 2000;
const FLAG_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'flagged', label: 'Flagged (any)' },
  { value: 'changed', label: 'Changed after posting' },
  { value: 'cancelled', label: 'Cancelled after posting' },
  { value: 'reset_to_draft', label: 'Reset to draft after posting' },
  { value: 'none', label: 'Not flagged' }
];
const EMPTY_FILTERS = { move_type: '', state: '', flag: '', q: '', invoice_from: '', invoice_to: '' };

function minutesText(minutes) {
  if (minutes === null || minutes === undefined) return 'never';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.floor(hours / 24)} days ago`;
}

function typeLabel(moveType) {
  return moveType === 'out_refund' ? 'Refund' : 'Invoice';
}

function FlagChip({ flag, notMirrored }) {
  return (
    <>
      {flag && <span className={`odoo-chip ${flag.startsWith('changed') ? 'odoo-chip-warn' : 'odoo-chip-bad'}`}>{flag}</span>}
      {notMirrored && <span className="odoo-chip odoo-chip-info" title="The invoice this refund reverses is not in the app">invoice not mirrored</span>}
    </>
  );
}

export default function OdooInvoicesPage() {
  const { user } = useAuth();
  const notify = useNotify();
  const permissions = user?.permissions || [];
  const canSync = permissions.includes('run_odoo_sync');
  const isIT = permissions.includes('manage_odoo_settings');

  const [status, setStatus] = useState(null);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncRequest, setSyncRequest] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [syncDialog, setSyncDialog] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const pollTimer = useRef(null);
  const listArgs = useRef({ filters: EMPTY_FILTERS, offset: 0 });  // what the table shows now, for the reload

  const loadStatus = useCallback(async () => {
    const res = await odooApi.syncRuns();
    if (res.ok) setStatus(res.data);
    return res;
  }, []);

  const loadList = useCallback(async (nextFilters, nextOffsetValue) => {
    listArgs.current = { filters: nextFilters, offset: nextOffsetValue };
    setLoading(true);
    const res = await odooApi.invoices({ ...nextFilters, limit: PAGE_SIZE, offset: nextOffsetValue });
    setLoading(false);
    if (!res.ok) {
      setError(errorText(res, 'Could not load the Odoo invoices.'));
      return;
    }
    setError('');
    setRows(res.data.results || []);
    setCount(res.data.count || 0);
    setNextOffset(res.data.next_offset);
  }, []);

  const pollRequest = useCallback((id) => {
    clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(async () => {
      const res = await odooApi.syncRequest(id);
      if (!res.ok) {
        pollTimer.current = setTimeout(() => pollRequest(id), POLL_MS);
        return;
      }
      const request = res.data;
      setSyncRequest(request);
      if (request.status === 'done' || request.status === 'failed') {
        setSyncRequest(null);
        setSyncResult(request);
        if (request.status === 'done') {
          notify.success('Odoo sync finished', syncSummary(request.summary));
        } else {
          notify.danger('Odoo sync failed', request.message);
        }
        loadStatus();
        loadList(listArgs.current.filters, listArgs.current.offset);
      } else {
        pollRequest(id);
      }
    }, POLL_MS);
  }, [loadList, loadStatus, notify]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await loadStatus();
      if (alive && res.ok && res.data.active_request && canSync) {
        setSyncRequest(res.data.active_request);
        pollRequest(res.data.active_request.id);
      }
    })();
    loadList(EMPTY_FILTERS, 0);
    return () => {
      alive = false;
      clearTimeout(pollTimer.current);
    };
    // first load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = (e) => {
    e?.preventDefault();
    setApplied(filters);
    setOffset(0);
    loadList(filters, 0);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setOffset(0);
    loadList(EMPTY_FILTERS, 0);
  };

  const goTo = (value) => {
    setOffset(value);
    loadList(applied, value);
  };

  /** Starts a sync with the choice made in the dialog. Returns the 400 response so the dialog can show it. */
  const handleSyncNow = async (choice) => {
    setSyncResult(null);
    const res = await odooApi.syncNow(choice);
    if (res.status === 202 || res.status === 200) {
      setSyncDialog(false);
      setSyncRequest(res.data);
      pollRequest(res.data.id);
      if (res.status === 200) notify.info('Sync already running', 'Showing the sync that is already queued or running.');
      return null;
    }
    if (res.status === 400) return res;
    setSyncDialog(false);
    notify.danger('Sync not started', errorText(res, 'Could not start the sync.'));
    loadStatus();
    return null;
  };

  const syncing = Boolean(syncRequest);
  const chip = SYNC_STATUS[status?.status] || null;
  const banner = (canSync || isIT) && status ? keyBanner(status.api_key_status, status.api_key_days_left,
    status.api_key_expires_on) : null;
  const notSetUp = status && !status.configured;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Odoo Invoices</h1>
          <p className="page-subtitle">
            Customer invoices and refunds posted in Odoo, pulled into the e-invoicing database. Read only: change them in Odoo.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => { loadStatus(); loadList(applied, offset); }} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'odoo-spin' : ''} /> Refresh
          </button>
          {canSync && (
            <button
              className="btn btn-primary"
              onClick={() => setSyncDialog(true)}
              disabled={syncing || notSetUp}
              title={notSetUp ? 'Odoo connection not set up (IT)' : 'Choose what to read from Odoo now'}
            >
              {syncing ? <RefreshCw size={16} className="odoo-spin" /> : <CloudDownload size={16} />}
              {syncing ? (syncRequest.status === 'running' ? 'Syncing…' : 'Waiting to sync…') : 'Sync now'}
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div className={`odoo-banner odoo-banner-${banner.tone}`}>
          <AlertTriangle size={18} /> <span>{banner.text}</span>
        </div>
      )}
      {notSetUp && (
        <div className="odoo-banner odoo-banner-warn">
          <AlertTriangle size={18} />
          <span>{canSync ? 'Odoo connection not set up (IT). ' : ''}{status.problem}</span>
        </div>
      )}
      {syncResult && (
        <div className={`odoo-banner odoo-banner-${syncResult.status === 'done' ? 'ok' : 'bad'}`}>
          <span>
            {syncResult.status === 'done' ? `Sync finished: ${syncSummary(syncResult.summary)}.` : `Sync failed: ${syncResult.message}`}
          </span>
        </div>
      )}

      <div className="odoo-strip">
        <div className="odoo-strip-item">
          <span className="odoo-strip-label">Status</span>
          {chip ? <span className={`odoo-chip odoo-chip-${chip.tone}`}>{chip.label}</span> : <span className="odoo-muted">…</span>}
        </div>
        <div className="odoo-strip-item">
          <span className="odoo-strip-label">Last successful sync</span>
          <span>
            {status?.cursor?.last_ok_at ? formatDateTime(status.cursor.last_ok_at) : '—'}{' '}
            <span className="odoo-muted">({minutesText(status?.minutes_since_last_ok)})</span>
          </span>
        </div>
        <div className="odoo-strip-item">
          <span className="odoo-strip-label">Automatic sync</span>
          <span>{status ? (status.auto_sync_enabled ? `On, every ${status.sync_interval_minutes} min` : 'Off') : '—'}</span>
        </div>
        <div className="odoo-strip-spacer" />
        <div className="odoo-strip-item">
          <span className="odoo-strip-label">Invoices shown</span>
          <span>{count}</span>
        </div>
      </div>

      <div className="card-section">
        <form className="odoo-filters" onSubmit={applyFilters}>
          <label>
            Search
            <input
              className="odoo-input odoo-input-wide"
              placeholder="Odoo number, SO number or buyer"
              value={filters.q}
              maxLength={100}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
          </label>
          <label>
            Type
            <select className="odoo-input" value={filters.move_type} onChange={(e) => setFilters({ ...filters, move_type: e.target.value })}>
              <option value="">All</option>
              <option value="out_invoice">Invoices</option>
              <option value="out_refund">Refunds</option>
            </select>
          </label>
          <label>
            State in Odoo
            <select className="odoo-input" value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })}>
              <option value="">All</option>
              <option value="posted">Posted</option>
              <option value="draft">Draft</option>
              <option value="cancel">Cancelled</option>
            </select>
          </label>
          <label>
            Flag
            <select className="odoo-input" value={filters.flag} onChange={(e) => setFilters({ ...filters, flag: e.target.value })}>
              {FLAG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label>
            Invoice date from
            <input type="date" className="odoo-input" value={filters.invoice_from} onChange={(e) => setFilters({ ...filters, invoice_from: e.target.value })} />
          </label>
          <label>
            to
            <input type="date" className="odoo-input" value={filters.invoice_to} onChange={(e) => setFilters({ ...filters, invoice_to: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-primary"><Search size={16} /> Search</button>
          <button type="button" className="btn btn-outline" onClick={resetFilters}>Clear</button>
        </form>

        {error && <div className="odoo-banner odoo-banner-bad">{error}</div>}

        <div className="table-responsive">
          <table className="data-table odoo-table">
            <thead>
              <tr>
                <th>Odoo number</th>
                <th>Type</th>
                <th>State</th>
                <th>Payment</th>
                <th>Invoice date</th>
                <th>SO number</th>
                <th>Buyer</th>
                <th>TIN (as typed)</th>
                <th className="num">Total</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.odoo_id} onClick={() => setDetailId(r.odoo_id)}>
                  <td><strong>{r.name || `#${r.odoo_id}`}</strong>
                    {r.reversed_entry_id && <div className="odoo-muted">refund of {r.reversed_entry_name || `Odoo id ${r.reversed_entry_id}`}</div>}
                  </td>
                  <td>{typeLabel(r.move_type)}</td>
                  <td>{r.state}</td>
                  <td>{r.payment_state || '—'}</td>
                  <td>{r.invoice_date || '—'}</td>
                  <td>{r.invoice_origin || '—'}</td>
                  <td>{r.buyer_name || '—'}</td>
                  <td>{r.buyer_vat_as_typed || '—'}</td>
                  <td className="num">{formatMoney(r.amount_total, r.currency_code)}</td>
                  <td><FlagChip flag={r.flag} notMirrored={r.reversed_entry_not_mirrored} /></td>
                </tr>
              ))}
              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '28px' }} className="odoo-muted">
                    No Odoo invoices {JSON.stringify(applied) !== JSON.stringify(EMPTY_FILTERS) ? 'match these filters' : 'yet'}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="odoo-pager">
          <span>{count ? `${offset + 1}–${offset + rows.length} of ${count}` : ''}</span>
          <span style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-outline" disabled={offset === 0 || loading} onClick={() => goTo(Math.max(0, offset - PAGE_SIZE))}>Previous</button>
            <button className="btn btn-outline" disabled={nextOffset === null || loading} onClick={() => goTo(nextOffset)}>Next</button>
          </span>
        </div>
      </div>

      {detailId !== null && <OdooInvoiceDrawer id={detailId} isIT={isIT} onClose={() => setDetailId(null)} />}
      {syncDialog && (
        <SyncNowDialog startDate={status?.sync_start_date} onStart={handleSyncNow} onClose={() => setSyncDialog(false)} />
      )}
    </div>
  );
}

function OdooInvoiceDrawer({ id, isIT, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [raw, setRaw] = useState(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let alive = true;
    odooApi.invoice(id).then((res) => {
      if (!alive) return;
      if (res.ok) setData(res.data);
      else setError(errorText(res, 'Could not load this invoice.'));
    });
    const onKey = (e) => e.key === 'Escape' && !printing && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [id, onClose, printing]);

  const loadRaw = async () => {
    const res = await odooApi.invoice(id, true);
    setRaw(res.ok ? res.data.raw : { error: errorText(res) });
  };

  const move = data?.move;
  const taxNames = Object.fromEntries((data?.taxes || []).map((t) => [t.odoo_id, t.name]));

  return (
    <div className="odoo-backdrop" onClick={onClose}>
      <aside className="odoo-drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="odoo-drawer-header">
          <div>
            <h2 className="odoo-drawer-title">{move ? `${typeLabel(move.move_type)} ${move.name || `#${move.odoo_id}`}` : 'Odoo invoice'}</h2>
            {move && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span className="odoo-chip odoo-chip-off">{move.state}</span>
                <FlagChip flag={move.flag} notMirrored={move.reversed_entry_not_mirrored} />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {data && (
              <button className="btn btn-outline" onClick={() => setPrinting(true)} title="Letter-size sales invoice">
                <Printer size={16} /> Print invoice
              </button>
            )}
            <button className="odoo-close" onClick={onClose} aria-label="Close">&times;</button>
          </div>
        </div>
        <div className="odoo-drawer-body">
          {error && <div className="odoo-banner odoo-banner-bad">{error}</div>}
          {!data && !error && <div className="odoo-muted">Loading…</div>}
          {move && (
            <>
              <section>
                <div className="odoo-section-title">Invoice</div>
                <dl className="odoo-facts">
                  <div><dt>Invoice date</dt><dd>{move.invoice_date || '—'}</dd></div>
                  <div><dt>Due date</dt><dd>{move.invoice_date_due || '—'}</dd></div>
                  <div><dt>SO number</dt><dd>{move.invoice_origin || '—'}</dd></div>
                  <div><dt>Reference</dt><dd>{move.ref || '—'}</dd></div>
                  <div><dt>Payment</dt><dd>{move.payment_state || '—'}</dd></div>
                  <div><dt>Company</dt><dd>{move.company_name || '—'}</dd></div>
                  <div><dt>Untaxed</dt><dd>{formatMoney(move.amount_untaxed, move.currency_code)}</dd></div>
                  <div><dt>Tax</dt><dd>{formatMoney(move.amount_tax, move.currency_code)}</dd></div>
                  <div><dt>Total</dt><dd><strong>{formatMoney(move.amount_total, move.currency_code)}</strong></dd></div>
                  {move.reversed_entry_id && (
                    <div><dt>Refund of</dt><dd>{move.reversed_entry_name || `Odoo id ${move.reversed_entry_id} (not in the app)`}</dd></div>
                  )}
                  <div><dt>Last change in Odoo</dt><dd>{formatDateTime(move.odoo_write_date)}</dd></div>
                </dl>
              </section>

              <section>
                <div className="odoo-section-title">Buyer</div>
                {data.buyer ? (
                  <dl className="odoo-facts">
                    <div><dt>Name</dt><dd>{data.buyer.name || '—'}</dd></div>
                    <div><dt>TIN (as typed in Odoo)</dt><dd>{data.buyer.vat || '—'}</dd></div>
                    <div><dt>Address</dt><dd>{[data.buyer.street, data.buyer.street2, data.buyer.city, data.buyer.zip, data.buyer.country_name].filter(Boolean).join(', ') || '—'}</dd></div>
                  </dl>
                ) : <div className="odoo-muted">No buyer on this invoice.</div>}
              </section>

              <section>
                <div className="odoo-section-title">Lines</div>
                <div className="table-responsive">
                  <table className="data-table odoo-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th className="num">Qty</th>
                        <th className="num">Unit price</th>
                        <th className="num">Disc. %</th>
                        <th>Taxes</th>
                        <th className="num">Subtotal</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((l) => (
                        l.display_type && l.display_type !== 'product' ? (
                          <tr key={l.odoo_id}><td colSpan={7} className="odoo-muted"><em>{l.name}</em></td></tr>
                        ) : (
                          <tr key={l.odoo_id} style={{ cursor: 'default' }}>
                            <td>{l.product_name && <div className="odoo-muted">{l.product_name}</div>}{l.name}</td>
                            <td className="num">{l.quantity} {l.uom_name || ''}</td>
                            <td className="num">{formatMoney(l.price_unit)}</td>
                            <td className="num">{l.discount ?? '—'}</td>
                            <td>{(l.tax_ids || []).length ? l.tax_ids.map((t) => taxNames[t] || `#${t}`).join(', ') : <span className="odoo-chip odoo-chip-warn">no tax</span>}</td>
                            <td className="num">{formatMoney(l.price_subtotal)}</td>
                            <td className="num">{formatMoney(l.price_total)}</td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <div className="odoo-section-title">Versions received from Odoo</div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.875rem' }}>
                  {data.versions.map((v) => (
                    <li key={v.id}>
                      {formatDateTime(v.odoo_write_date)} — {v.state}, total {formatMoney(v.amount_total, move.currency_code)}
                      {v.content_changed && <span className="odoo-chip odoo-chip-warn" style={{ marginLeft: 8 }}>content changed</span>}
                    </li>
                  ))}
                </ul>
              </section>

              {isIT && (
                <section>
                  <div className="odoo-section-title">Raw data from Odoo (IT)</div>
                  {raw ? <pre className="odoo-raw">{JSON.stringify(raw, null, 2)}</pre> : (
                    <button className="btn btn-outline" onClick={loadRaw}><FileText size={16} /> Show raw JSON</button>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </aside>
      {printing && data && <OdooInvoicePrintPreview detail={data} onClose={() => setPrinting(false)} />}
    </div>
  );
}

const SYNC_CHOICES = [
  { value: 'changes', icon: Zap, label: 'New changes', help: 'What was created or changed in Odoo since the last sync. Same as the automatic sync.' },
  { value: 'all', icon: Layers, label: 'Sync all', help: 'Read every invoice again from the sync start date. Takes longer.' },
  { value: 'custom', icon: ListFilter, label: 'Custom selection', help: 'Pick a date range or numbers, see what Odoo has, then choose what to upload.' }
];

const PREVIEW_STATUS = {
  new: { label: 'New', tone: 'ok', pick: true },
  changed: { label: 'Changed in Odoo', tone: 'warn', pick: true },
  up_to_date: { label: 'Already up to date', tone: 'off', pick: false },
  not_posted: { label: 'Not posted', tone: 'bad', pick: false, disabled: true, hint: 'Draft or cancelled before posting: not stored' }
};

function SyncNowDialog({ startDate, onStart, onClose }) {
  const [mode, setMode] = useState('changes');
  const [invoiceFrom, setInvoiceFrom] = useState('');
  const [invoiceTo, setInvoiceTo] = useState('');
  const [numbers, setNumbers] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);
  const [picked, setPicked] = useState(() => new Set());

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const numberList = () => numbers.split(/[\n,]+/).map((n) => n.trim()).filter(Boolean);

  // a new range or new numbers make the list out of date
  const editSelection = (setter) => (e) => {
    setter(e.target.value);
    setPreview(null);
    setErrors({});
  };

  const showErrors = (res) => {
    const errs = fieldErrors(res);
    setErrors(Object.keys(errs).length ? errs : { mode: errorText(res) });
  };

  const findInvoices = async () => {
    const body = {};
    if (invoiceFrom) body.invoice_from = invoiceFrom;
    if (invoiceTo) body.invoice_to = invoiceTo;
    const list = numberList();
    if (list.length) body.numbers = list;
    setBusy('preview');
    setErrors({});
    const res = await odooApi.syncPreview(body);
    setBusy('');
    if (!res.ok) {
      setPreview(null);
      showErrors(res);
      return;
    }
    setPreview(res.data);
    setPicked(new Set(res.data.invoices.filter((i) => PREVIEW_STATUS[i.status]?.pick).map((i) => i.odoo_id)));
  };

  const selectable = (preview?.invoices || []).filter((i) => !PREVIEW_STATUS[i.status]?.disabled);
  const allPicked = selectable.length > 0 && selectable.every((i) => picked.has(i.odoo_id));

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const pickWhere = (test) => setPicked(new Set(selectable.filter(test).map((i) => i.odoo_id)));

  const start = async (e) => {
    e.preventDefault();
    let choice = { mode };
    if (mode === 'custom') {
      if (!preview) {
        await findInvoices();
        return;
      }
      choice = { mode: 'custom', move_ids: [...picked] };
    }
    setBusy('start');
    setErrors({});
    const refused = await onStart(choice);
    setBusy('');
    if (refused) showErrors(refused);
  };

  const counts = preview?.counts || {};
  let primaryLabel = 'Start sync';
  if (mode === 'custom') primaryLabel = preview ? `Upload ${picked.size} selected` : 'Find invoices in Odoo';
  const primaryDisabled = Boolean(busy) || (mode === 'custom' && preview && picked.size === 0);

  return (
    <div className="odoo-modal-backdrop" onClick={() => !busy && onClose()}>
      <form className={`odoo-modal ${preview && mode === 'custom' ? 'odoo-modal-wide' : ''}`} role="dialog"
        aria-modal="true" aria-labelledby="odoo-sync-title" onClick={(e) => e.stopPropagation()} onSubmit={start}>
        <div className="odoo-modal-header">
          <div>
            <h2 className="odoo-modal-title" id="odoo-sync-title">Sync now</h2>
            <p className="odoo-modal-subtitle">Choose what to read from Odoo. Nothing is ever changed in Odoo.</p>
          </div>
          <button type="button" className="odoo-close" onClick={onClose} disabled={Boolean(busy)} aria-label="Close">&times;</button>
        </div>

        <div className="odoo-modal-body">
          <div className="odoo-tiles" role="radiogroup" aria-label="What to sync">
            {SYNC_CHOICES.map((c) => {
              const Icon = c.icon;
              const selected = mode === c.value;
              return (
                <label key={c.value} className={`odoo-tile ${selected ? 'selected' : ''}`}>
                  <input type="radio" name="odoo-sync-mode" value={c.value} checked={selected}
                    onChange={() => { setMode(c.value); setErrors({}); }} />
                  {selected && <span className="odoo-tile-check"><Check size={12} strokeWidth={3} /></span>}
                  <span className="odoo-tile-icon"><Icon size={18} /></span>
                  <span className="odoo-tile-label">{c.label}</span>
                  <span className="odoo-tile-help">
                    {c.help}{c.value === 'all' && startDate ? ` From ${startDate}.` : ''}
                  </span>
                </label>
              );
            })}
          </div>

          {mode === 'custom' && (
            <div className="odoo-panel">
              <div className="odoo-panel-grid">
                <label className="odoo-field">
                  <span>Invoice date from</span>
                  <input type="date" className="odoo-input" value={invoiceFrom} min={startDate || undefined}
                    onChange={editSelection(setInvoiceFrom)} />
                  {errors.invoice_from && <span className="odoo-field-error">{errors.invoice_from}</span>}
                </label>
                <label className="odoo-field">
                  <span>Invoice date to</span>
                  <input type="date" className="odoo-input" value={invoiceTo} min={invoiceFrom || startDate || undefined}
                    onChange={editSelection(setInvoiceTo)} />
                  {errors.invoice_to && <span className="odoo-field-error">{errors.invoice_to}</span>}
                </label>
                <label className="odoo-field odoo-panel-numbers">
                  <span>Odoo or SO numbers <em className="odoo-optional">optional</em></span>
                  <textarea className="odoo-input odoo-textarea" rows={2} value={numbers}
                    placeholder="INV/2026/00012, SO-18125" onChange={editSelection(setNumbers)} />
                  {errors.numbers && <span className="odoo-field-error">{errors.numbers}</span>}
                </label>
              </div>
              <div className="odoo-panel-actions">
                <span className="odoo-field-help">
                  {preview ? 'Changed the dates or numbers? Search again.' : 'Odoo is only read here. You choose what to upload in the next step.'}
                </span>
                {preview && (
                  <button type="button" className="btn btn-outline" onClick={findInvoices} disabled={Boolean(busy)}>
                    {busy === 'preview' ? <RefreshCw size={16} className="odoo-spin" /> : <SearchCheck size={16} />}
                    Search again
                  </button>
                )}
              </div>

              {preview && (
                <div className="odoo-preview">
                  <div className="odoo-preview-summary">
                    <strong>{preview.total} found</strong>
                    <span className="odoo-chip odoo-chip-ok">{counts.new || 0} new</span>
                    <span className="odoo-chip odoo-chip-warn">{counts.changed || 0} changed</span>
                    <span className="odoo-chip odoo-chip-off">{counts.up_to_date || 0} up to date</span>
                    {counts.not_posted > 0 && <span className="odoo-chip odoo-chip-bad">{counts.not_posted} not posted</span>}
                    <span className="odoo-preview-pick">
                      Select:
                      <button type="button" onClick={() => pickWhere((i) => PREVIEW_STATUS[i.status].pick)}>New &amp; changed</button>
                      <button type="button" onClick={() => pickWhere(() => true)}>All</button>
                      <button type="button" onClick={() => setPicked(new Set())}>None</button>
                    </span>
                  </div>
                  {preview.truncated && (
                    <div className="odoo-banner odoo-banner-warn">
                      <Info size={16} /> Only the first {preview.limit} invoices are shown. Choose a shorter date range to see the rest.
                    </div>
                  )}
                  {preview.total === 0 ? (
                    <div className="odoo-preview-empty">Odoo has no customer invoices or refunds for this selection.</div>
                  ) : (
                    <div className="odoo-preview-table">
                      <table className="data-table odoo-table">
                        <thead>
                          <tr>
                            <th className="odoo-col-check">
                              <input type="checkbox" checked={allPicked} aria-label="Select all"
                                onChange={() => (allPicked ? setPicked(new Set()) : pickWhere(() => true))} />
                            </th>
                            <th>Odoo number</th>
                            <th>Date</th>
                            <th>SO number</th>
                            <th>Buyer</th>
                            <th className="num">Total</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.invoices.map((inv) => {
                            const st = PREVIEW_STATUS[inv.status] || PREVIEW_STATUS.up_to_date;
                            const checked = picked.has(inv.odoo_id);
                            return (
                              <tr key={inv.odoo_id} className={`${st.disabled ? 'odoo-row-disabled' : ''} ${checked ? 'odoo-row-picked' : ''}`}
                                onClick={() => !st.disabled && toggle(inv.odoo_id)} title={st.hint}>
                                <td className="odoo-col-check">
                                  <input type="checkbox" checked={checked} disabled={st.disabled}
                                    onChange={() => toggle(inv.odoo_id)} onClick={(e) => e.stopPropagation()}
                                    aria-label={`Select ${inv.name || inv.odoo_id}`} />
                                </td>
                                <td><strong>{inv.name || `#${inv.odoo_id}`}</strong>
                                  {inv.move_type === 'out_refund' && <span className="odoo-muted"> refund</span>}</td>
                                <td>{inv.invoice_date || '—'}</td>
                                <td>{inv.invoice_origin || '—'}</td>
                                <td>{inv.buyer_name || '—'}</td>
                                <td className="num">{formatMoney(inv.amount_total, inv.currency)}</td>
                                <td><span className={`odoo-chip odoo-chip-${st.tone}`}>{st.label}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {errors.mode && <div className="odoo-banner odoo-banner-bad">{errors.mode}</div>}
          {errors.move_ids && <div className="odoo-banner odoo-banner-bad">{errors.move_ids}</div>}
        </div>

        <div className="odoo-modal-footer">
          {mode === 'custom' && preview && (
            <span className="odoo-footer-note">{picked.size} of {preview.total} selected</span>
          )}
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={Boolean(busy)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={primaryDisabled}>
            {busy === 'start' || (busy === 'preview' && !preview) ? <RefreshCw size={16} className="odoo-spin" />
              : (mode === 'custom' ? (preview ? <CloudUpload size={16} /> : <SearchCheck size={16} />) : <CloudDownload size={16} />)}
            {primaryLabel}
          </button>
        </div>
      </form>
    </div>
  );
}


function OdooInvoicePrintPreview({ detail, onClose }) {
  const invoice = buildOdooInvoice(detail);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const print = () => printElement({
    element: <OdooInvoiceSheet invoice={invoice} />,
    css: ODOO_INVOICE_SHEET_CSS,
    title: `${invoice.isRefund ? 'Credit note' : 'Invoice'} ${invoice.number}`,
    page: 'letter',
    margin: '0.4in'
  });

  return (
    <div className="odoo-modal-backdrop odoo-print-backdrop" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="odoo-print-modal" role="dialog" aria-modal="true" aria-label="Print preview"
        onClick={(e) => e.stopPropagation()}>
        <div className="odoo-modal-header">
          <div>
            <h2 className="odoo-modal-title">Print preview: {invoice.number}</h2>
            <p className="odoo-modal-subtitle">Letter size (8.5 × 11 in). In the print window, choose the printer and keep the scale at 100%.</p>
          </div>
          <button type="button" className="odoo-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        {invoice.state !== 'posted' && (
          <div className="odoo-banner odoo-banner-bad" style={{ margin: '0 24px' }}>
            <AlertTriangle size={16} /> This invoice is not posted in Odoo any more: the printout is stamped NOT VALID.
          </div>
        )}
        <div className="odoo-print-paper-wrap">
          <style>{ODOO_INVOICE_SHEET_CSS}</style>
          <div className="odoo-print-paper">
            <OdooInvoiceSheet invoice={invoice} />
          </div>
        </div>
        <div className="odoo-modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={print}><Printer size={16} /> Print</button>
        </div>
      </div>
    </div>
  );
}
