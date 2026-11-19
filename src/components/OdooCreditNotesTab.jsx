import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../services/apiClient';
import { errorText, formatDateTime, formatMoney } from '../services/odooService';

/*
 * Odoo Invoices → Credit notes tab (2026-11-19): every Odoo credit note in one place.
 *   To do   GET /api/credit-notes/candidates?source=odoo   (view_credit_worklist) refunds and changed invoices
 *   Issued  GET /api/credit-notes?platform=odoo[&store_id=] (view_documents) credit notes on Odoo e-invoices
 * Issuing stays on the Credit Notes screen (one issue form for everything): the button opens it on that row.
 * Follows the page's Company filter. Nothing is kept in the browser: Refresh reloads from the server.
 */

const PAGE_SIZE = 100;

const TODO_STATUS = {
  credit_all: { label: 'Needs credit note', tone: 'warn' },
  credit_lines: { label: 'Needs credit note', tone: 'warn' },
  review_refund: { label: 'Needs credit note (check amounts)', tone: 'warn' },
  review_odoo_change: { label: 'Changed in Odoo after e-invoice', tone: 'bad' },
  original_not_issued: { label: 'Waits for the invoice\'s e-invoice', tone: 'off' },
  original_not_mirrored: { label: 'Invoice not in the app', tone: 'off' },
  refund_changed_after_credit: { label: 'Refund changed after credit note', tone: 'off' }
};

// same wording as the Credit Notes screen (CORRECTION_CODES there)
const CODES = {
  '01': 'Error on the invoice', '02': 'Duplicate invoice', '03': 'Amount reduced (part returned or refunded)',
  '04': 'Order cancelled or fully returned', '05': 'Returned for a replacement', '09': 'Other reason'
};

const isActionable = (c) => c.actionable !== false;

export default function OdooCreditNotesTab({ companyId, companies, canWorklist, canIssue, onNavigate, reloadKey }) {
  const [todo, setTodo] = useState([]);
  const [todoError, setTodoError] = useState('');
  const [todoLoading, setTodoLoading] = useState(canWorklist);
  const [issued, setIssued] = useState([]);
  const [totals, setTotals] = useState(null);
  const [nextOffset, setNextOffset] = useState(null);
  const [issuedError, setIssuedError] = useState('');
  const [issuedLoading, setIssuedLoading] = useState(true);

  const companyName = useMemo(() => {
    const names = Object.fromEntries((companies || []).map((c) => [String(c.company_id), c.company_name]));
    return (id) => names[String(id)] || `Company ${id}`;
  }, [companies]);

  const loadTodo = useCallback(async () => {
    if (!canWorklist) return;
    setTodoLoading(true);
    const res = await api.get('/api/credit-notes/candidates', { source: 'odoo' });
    setTodoLoading(false);
    if (!res.ok) {
      setTodoError(errorText(res, 'Could not load the Odoo credit notes to do.'));
      return;
    }
    setTodoError('');
    const rows = Array.isArray(res.data) ? res.data : (res.data?.results || []);
    setTodo(rows.filter((c) => c.source === 'odoo'));
  }, [canWorklist]);

  const loadIssued = useCallback(async (offset = 0) => {
    setIssuedLoading(true);
    const res = await api.get('/api/credit-notes', {
      platform: 'odoo', store_id: companyId || undefined, limit: PAGE_SIZE, offset
    });
    setIssuedLoading(false);
    if (!res.ok) {
      setIssuedError(errorText(res, 'Could not load the issued Odoo credit notes.'));
      return;
    }
    setIssuedError('');
    const rows = res.data?.results || [];
    setIssued((prev) => (offset ? [...prev, ...rows] : rows));
    setTotals(res.data?.totals || null);
    setNextOffset(res.data?.next_offset ?? null);
  }, [companyId]);

  useEffect(() => { loadTodo(); }, [loadTodo, reloadKey]);
  useEffect(() => { loadIssued(0); }, [loadIssued, reloadKey]);

  const shownTodo = useMemo(
    () => todo.filter((c) => !companyId || String(c.store_id) === String(companyId))
      .sort((a, b) => Number(isActionable(b)) - Number(isActionable(a))),
    [todo, companyId]
  );
  const actionableCount = shownTodo.filter(isActionable).length;

  const openOnCreditNotes = (c) => onNavigate?.('credit-notes', {
    tab: 'candidates',
    source: 'odoo',
    search: c.odoo_refund_name || c.odoo_invoice_name || c.invoice_number || '',
    open: { invoice_id: c.invoice_id ?? null, odoo_refund_id: c.odoo_refund_id ?? null }
  });

  return (
    <div className="odoo-cn">
      <div className="odoo-cn-summary">
        <div className="odoo-strip-item">
          <span className="odoo-strip-label">Need a credit note</span>
          <span className="odoo-cn-count">{canWorklist ? (todoLoading && !todo.length ? '…' : actionableCount) : '—'}</span>
        </div>
        <div className="odoo-strip-item">
          <span className="odoo-strip-label">Credit notes issued</span>
          <span className="odoo-cn-count">{totals ? totals.count : '…'}</span>
        </div>
        <div className="odoo-strip-item">
          <span className="odoo-strip-label">Total credited</span>
          <span className="odoo-cn-count">{totals ? formatMoney(totals.credit_note?.total_amount) : '…'}</span>
        </div>
      </div>

      {canWorklist && (
        <section className="odoo-cn-section">
          <div className="odoo-section-title">To do: refunds and changes in Odoo</div>
          {todoError ? (
            <div className="odoo-banner odoo-banner-bad"><AlertTriangle size={18} /> <span>{todoError}</span></div>
          ) : shownTodo.length === 0 ? (
            <div className="odoo-cn-empty">
              {todoLoading ? <span className="odoo-muted">Loading…</span> : (
                <><CheckCircle2 size={18} /> Nothing to do. Refunds made in Odoo, and Odoo invoices cancelled or
                  changed after their e-invoice, show up here after the next sync.</>
              )}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table odoo-table odoo-cn-table">
                <thead>
                  <tr>
                    <th>Odoo document</th>
                    {!companyId && <th>Company</th>}
                    <th>E-invoice</th>
                    <th>What happened</th>
                    <th className="num">Odoo refund</th>
                    <th className="num">Still open</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shownTodo.map((c, idx) => {
                    const status = TODO_STATUS[c.suggested_action];
                    const actionable = isActionable(c);
                    return (
                      <tr key={`${c.invoice_id ?? 'none'}-${c.odoo_refund_id ?? ''}-${idx}`}
                        className={actionable ? '' : 'odoo-cn-info'}>
                        <td>
                          <strong>{c.odoo_refund_name || c.odoo_invoice_name || '—'}</strong>
                          {c.odoo_refund_name && c.odoo_invoice_name && (
                            <div className="odoo-muted">refund of {c.odoo_invoice_name}</div>
                          )}
                          {!c.odoo_refund_name && <div className="odoo-muted">Odoo invoice</div>}
                        </td>
                        {!companyId && <td>{companyName(c.store_id)}</td>}
                        <td>
                          {c.invoice_number
                            ? <span className="odoo-einvoice-number">{c.invoice_number}</span>
                            : <span className="odoo-muted">No e-invoice yet</span>}
                          {c.invoice_total !== null && c.invoice_total !== undefined && (
                            <div className="odoo-muted">Total {formatMoney(c.invoice_total)}</div>
                          )}
                        </td>
                        <td className="odoo-cn-why">{c.explanation || '—'}</td>
                        <td className="num">{formatMoney(c.odoo_refund_total)}</td>
                        <td className="num">{actionable ? formatMoney(c.open_amount) : '—'}</td>
                        <td>
                          {status
                            ? <span className={`odoo-chip odoo-chip-${status.tone}`}>{status.label}</span>
                            : <span className="odoo-muted">{c.suggested_action || ''}</span>}
                        </td>
                        <td className="odoo-cn-action">
                          {!actionable ? (
                            <span className="odoo-muted">Information only</span>
                          ) : canIssue ? (
                            <button type="button" className="btn btn-primary odoo-cn-btn" onClick={() => openOnCreditNotes(c)}>
                              {c.suggested_action === 'review_odoo_change' ? 'Review' : 'Review & issue'} <ArrowRight size={14} />
                            </button>
                          ) : (
                            <span className="odoo-muted">Accounting or IT issues it</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="odoo-cn-section">
        <div className="odoo-section-title">Issued credit notes on Odoo e-invoices</div>
        {issuedError ? (
          <div className="odoo-banner odoo-banner-bad"><AlertTriangle size={18} /> <span>{issuedError}</span></div>
        ) : issued.length === 0 ? (
          <div className="odoo-cn-empty">
            <span className="odoo-muted">{issuedLoading ? 'Loading…' : 'No credit note has been issued on an Odoo e-invoice yet.'}</span>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="data-table odoo-table odoo-cn-table">
                <thead>
                  <tr>
                    <th>Credit note</th>
                    <th>Issued</th>
                    {!companyId && <th>Company</th>}
                    <th>On e-invoice</th>
                    <th>Reason</th>
                    <th className="num">Amount</th>
                    <th className="num">Printed</th>
                  </tr>
                </thead>
                <tbody>
                  {issued.map((d) => (
                    <tr key={d.id}>
                      <td><span className="odoo-einvoice-number"><strong>{d.document_number}</strong></span></td>
                      <td>{formatDateTime(d.issued_at)}</td>
                      {!companyId && <td>{companyName(d.store_id)}</td>}
                      <td>
                        <span className="odoo-einvoice-number">{d.original_document_number || '—'}</span>
                        <div className="odoo-muted">Odoo invoice id {d.platform_order_id}</div>
                      </td>
                      <td className="odoo-cn-why">
                        {d.correction_code && <span className="odoo-chip odoo-chip-info">Code {d.correction_code}{CODES[d.correction_code] ? ` · ${CODES[d.correction_code]}` : ''}</span>}
                        {d.correction_reason && <div className="odoo-muted">{d.correction_reason}</div>}
                      </td>
                      <td className="num">{formatMoney(d.total_amount)}</td>
                      <td className="num">{d.print_count ? `${d.print_count}×` : <span className="odoo-muted">not yet</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="odoo-pager">
              <span>{totals ? `${issued.length} of ${totals.count}` : ''}</span>
              {nextOffset !== null && (
                <button type="button" className="btn btn-outline" disabled={issuedLoading} onClick={() => loadIssued(nextOffset)}>
                  Load more
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
