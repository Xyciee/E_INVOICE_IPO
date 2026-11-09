import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileMinus,
  Search,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  ArrowRight,
  RotateCcw,
  X,
  FileCheck2,
  Eye,
  AlertTriangle
} from 'lucide-react';
import { api } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { useNotify, useConfirm } from '../context/NotificationContext';
import PlatformBadge from '../components/PlatformBadge';
import './pages.css';
import './creditNotes.css';

/*
 * Credit notes (accounting). Everything on this page comes from the server (2026-11-09):
 *   GET  /api/credit-notes/candidates   work list (view_credit_worklist)
 *   GET  /api/credit-notes              issued credit notes, the register (view_documents)
 *   GET  /api/invoices/<id>/balance     what is still open per invoice line (view_credit_worklist)
 *   POST /api/credit-notes              issue (issue_credit_note: Accounting and IT only)
 *   GET  /api/documents/<id>/eis-json   BIR JSON preview (view_eis_json)
 * An issued credit note can never be changed or deleted, so this page never shows anything as issued
 * unless the server said so, and keeps no copy of the lists in the browser.
 */

// Correction codes the backend accepts (ledger/contract.py CORRECTION_CODES).
const CORRECTION_CODES = [
  { code: '01', label: 'Error on the invoice' },
  { code: '02', label: 'Duplicate invoice' },
  { code: '03', label: 'Amount reduced (part returned or refunded)' },
  { code: '04', label: 'Order cancelled or fully returned' },
  { code: '05', label: 'Returned for a replacement' },
  { code: '09', label: 'Other reason' }
];

const SUGGESTED_ACTIONS = {
  credit_all: 'Credit everything still open',
  credit_lines: 'Credit the returned units',
  review_refund: 'Check the refund amount per line'
};

const CREDIT_MODES = [
  { value: 'all', label: 'Everything still open on the invoice' },
  { value: 'quantity', label: 'Returned units, per line' },
  { value: 'amount', label: 'Money refunded, per line' }
];

const PLATFORM_OPTIONS = [
  { value: '', label: 'All Platforms' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'lazada', label: 'Lazada' },
  { value: 'tiktok', label: 'TikTok Shop' }
];

const ISSUED_PAGE_SIZE = 100;
const POSITIVE_NUMBER = /^\d+(\.\d+)?$/;

// --- helpers ------------------------------------------------------------------------------------------------

function unwrapList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

const FIELD_LABELS = {
  invoice_id: 'Invoice',
  correction_code: 'Correction code',
  source_ref: 'Reference',
  reason: 'Reason',
  lines: 'Lines'
};

/** The server's own message for a failed call (plain English, written for people), or a fallback. */
function serverMessage(res, fallback) {
  if (!res || res.networkError) {
    return 'Could not reach the server. Check the connection and try again.';
  }
  const d = res.data;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    if (typeof d.message === 'string' && d.message) return d.message;
    if (typeof d.detail === 'string' && d.detail) return d.detail;
    const parts = Object.entries(d)
      .filter(([k]) => k !== 'error')
      .map(([k, v]) => `${FIELD_LABELS[k] || k}: ${Array.isArray(v) ? v.join(' ') : String(v)}`);
    if (parts.length) return parts.join(' ');
  }
  if (typeof d === 'string' && d && d.length < 300 && !d.trim().startsWith('<')) return d;
  return `${fallback} (server answered ${res.status || 'no response'}).`;
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toCents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function centsToMoney(cents) {
  return formatMoney((cents / 100).toFixed(2));
}

/** "2.000" -> "2", "1.500" -> "1.5" (display only). */
function formatQty(value) {
  if (value === null || value === undefined || value === '') return '—';
  const s = String(value);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

function codeLabel(code) {
  return CORRECTION_CODES.find((c) => c.code === code)?.label || '';
}

// --- server calls (return plain results; the component decides what to show) --------------------------------

async function fetchCandidates() {
  const res = await api.get('/api/credit-notes/candidates');
  if (!res.ok) return { ok: false, error: serverMessage(res, 'Could not load the work list') };
  return { ok: true, rows: unwrapList(res.data) };
}

async function fetchIssued(platform, offset = 0) {
  const res = await api.get('/api/credit-notes', {
    platform: platform || undefined,
    limit: ISSUED_PAGE_SIZE,
    offset
  });
  if (!res.ok) return { ok: false, error: serverMessage(res, 'Could not load the issued credit notes') };
  return {
    ok: true,
    rows: unwrapList(res.data),
    totals: res.data?.totals || null,
    nextOffset: res.data?.next_offset ?? null
  };
}

async function fetchBalance(invoiceId) {
  const res = await api.get(`/api/invoices/${encodeURIComponent(invoiceId)}/balance`);
  if (!res.ok) return { ok: false, error: serverMessage(res, 'Could not load the invoice lines') };
  return { ok: true, rows: unwrapList(res.data) };
}

/**
 * Finds the invoice for what the person typed: an invoice number, an order id or waybill (via /api/documents?q=),
 * or the invoice's internal id (digits only). Returns {ok, invoice: {id, document_number, ...}} or {ok:false, error}.
 */
async function resolveInvoice(text) {
  const typed = text.trim();
  if (!typed) return { ok: false, error: 'Type the invoice number first.' };
  const res = await api.get('/api/documents', { q: typed });
  if (!res.ok) return { ok: false, error: serverMessage(res, 'Could not search for the invoice') };
  const invoices = unwrapList(res.data).filter((d) => d.doc_type === 'invoice');
  const exact = invoices.filter((d) => String(d.document_number || '').toLowerCase() === typed.toLowerCase());
  if (exact.length === 1) return { ok: true, invoice: exact[0] };
  if (invoices.length === 1) return { ok: true, invoice: invoices[0] };
  if (invoices.length > 1) {
    const numbers = invoices.map((d) => d.document_number).join(', ');
    return { ok: false, error: `Several invoices match "${typed}": ${numbers}. Type the full invoice number.` };
  }
  if (/^\d+$/.test(typed)) return { ok: true, invoice: { id: Number(typed), document_number: null } };
  return { ok: false, error: `No invoice found for "${typed}".` };
}

/** Modal lines from the balance rows, pre-filled with the suggested lines ([{line_no, quantity|amount}]). */
function buildLines(balanceRows, suggestedLines) {
  const suggested = new Map((Array.isArray(suggestedLines) ? suggestedLines : []).map((l) => [Number(l.line_no), l]));
  return balanceRows.map((row) => {
    const s = suggested.get(Number(row.line_no));
    return {
      ...row,
      qty: s && s.quantity !== undefined && s.quantity !== null ? String(s.quantity) : '',
      amount: s && s.amount !== undefined && s.amount !== null ? String(s.amount) : ''
    };
  });
}

function modeForCandidate(candidate) {
  const lines = Array.isArray(candidate.suggested_lines) ? candidate.suggested_lines : [];
  if (lines.length > 0) return lines.some((l) => l.amount !== undefined && l.amount !== null) ? 'amount' : 'quantity';
  if (candidate.suggested_action === 'review_refund') return 'amount';
  return 'all';
}

// --- page ---------------------------------------------------------------------------------------------------

export default function CreditNotesPage() {
  const { user } = useAuth();
  const notify = useNotify();
  const confirm = useConfirm();

  const permissions = useMemo(() => new Set(user?.permissions || []), [user]);
  const canIssue = permissions.has('issue_credit_note');
  const canViewEis = permissions.has('view_eis_json');

  const [activeTab, setActiveTab] = useState('candidates'); // 'candidates' | 'issued' | 'balance'
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');

  // Work list
  const [candidates, setCandidates] = useState([]);
  const [candidatesError, setCandidatesError] = useState('');
  const [loadingCandidates, setLoadingCandidates] = useState(true);

  // Issued credit notes (register)
  const [issued, setIssued] = useState([]);
  const [issuedTotals, setIssuedTotals] = useState(null);
  const [issuedNextOffset, setIssuedNextOffset] = useState(null);
  const [issuedError, setIssuedError] = useState('');
  const [loadingIssued, setLoadingIssued] = useState(true);

  // Issue modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [modalInvoiceInput, setModalInvoiceInput] = useState('');
  const [modalInvoice, setModalInvoice] = useState(null); // {id, document_number, platform, store_id, ...}
  const [modalCode, setModalCode] = useState('');
  const [modalSourceRef, setModalSourceRef] = useState('');
  const [modalReason, setModalReason] = useState('');
  const [modalMode, setModalMode] = useState('all');
  const [modalLines, setModalLines] = useState([]);
  const [modalLinesError, setModalLinesError] = useState('');
  const [modalSubmitError, setModalSubmitError] = useState('');
  const [fetchingLines, setFetchingLines] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const linesRequest = useRef(0);

  // BIR JSON preview
  const [preview, setPreview] = useState(null); // {doc, loading, results, error}

  // Balance inspector
  const [balanceInput, setBalanceInput] = useState('');
  const [balanceInvoice, setBalanceInvoice] = useState(null);
  const [balanceRows, setBalanceRows] = useState([]);
  const [balanceError, setBalanceError] = useState('');
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Work list: load once on open (the Refresh button reloads).
  useEffect(() => {
    let active = true;
    (async () => {
      const r = await fetchCandidates();
      if (!active) return;
      if (r.ok) {
        setCandidates(r.rows);
        setCandidatesError('');
      } else {
        setCandidatesError(r.error);
      }
      setLoadingCandidates(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Issued list: the platform filter is applied by the server, so totals cover every matching credit note.
  useEffect(() => {
    let active = true;
    (async () => {
      const r = await fetchIssued(platformFilter, 0);
      if (!active) return;
      if (r.ok) {
        setIssued(r.rows);
        setIssuedTotals(r.totals);
        setIssuedNextOffset(r.nextOffset);
        setIssuedError('');
      } else {
        setIssued([]);
        setIssuedTotals(null);
        setIssuedNextOffset(null);
        setIssuedError(r.error);
      }
      setLoadingIssued(false);
    })();
    return () => {
      active = false;
    };
  }, [platformFilter]);

  const reloadCandidates = async () => {
    setLoadingCandidates(true);
    const r = await fetchCandidates();
    if (r.ok) {
      setCandidates(r.rows);
      setCandidatesError('');
    } else {
      setCandidatesError(r.error);
    }
    setLoadingCandidates(false);
    return r;
  };

  const reloadIssued = async () => {
    setLoadingIssued(true);
    const r = await fetchIssued(platformFilter, 0);
    if (r.ok) {
      setIssued(r.rows);
      setIssuedTotals(r.totals);
      setIssuedNextOffset(r.nextOffset);
      setIssuedError('');
    } else {
      setIssuedError(r.error);
    }
    setLoadingIssued(false);
    return r;
  };

  const handleRefresh = async () => {
    const [c, i] = await Promise.all([reloadCandidates(), reloadIssued()]);
    if (c.ok && i.ok) {
      notify.success('Updated', `Work list: ${c.rows.length} invoice(s). Issued credit notes reloaded.`);
    } else {
      notify.warning('Not everything loaded', c.ok ? i.error : c.error);
    }
  };

  const handleLoadMoreIssued = async () => {
    if (issuedNextOffset === null) return;
    setLoadingIssued(true);
    const r = await fetchIssued(platformFilter, issuedNextOffset);
    if (r.ok) {
      setIssued((prev) => [...prev, ...r.rows]);
      setIssuedTotals(r.totals);
      setIssuedNextOffset(r.nextOffset);
    } else {
      notify.danger('Could not load more', r.error);
    }
    setLoadingIssued(false);
  };

  // --- filters (work list: in the browser; issued: platform on the server, search on the loaded rows) ---

  const term = searchQuery.trim().toLowerCase();

  const filteredCandidates = useMemo(
    () =>
      candidates.filter((c) => {
        const matchesSearch =
          !term ||
          [c.invoice_number, c.platform_order_id, c.explanation, c.order_status_now]
            .some((v) => String(v || '').toLowerCase().includes(term));
        const matchesPlatform = !platformFilter || c.platform === platformFilter;
        return matchesSearch && matchesPlatform;
      }),
    [candidates, term, platformFilter]
  );

  const filteredIssued = useMemo(
    () =>
      issued.filter(
        (d) =>
          !term ||
          [d.document_number, d.original_document_number, d.platform_order_id, d.correction_reason, d.store_name]
            .some((v) => String(v || '').toLowerCase().includes(term))
      ),
    [issued, term]
  );

  const openOnWorkListCents = useMemo(
    () => candidates.reduce((acc, c) => acc + toCents(c.open_amount), 0),
    [candidates]
  );

  // --- issue modal ------------------------------------------------------------------------------------

  const resetModal = () => {
    setModalSubmitError('');
    setModalLinesError('');
    setModalLines([]);
    setFetchingLines(false);
  };

  /** Loads the invoice's open lines; ignores answers to an older request (another invoice opened since). */
  const loadModalLines = async (invoiceId, suggestedLines) => {
    const requestNo = ++linesRequest.current;
    setFetchingLines(true);
    setModalLinesError('');
    const r = await fetchBalance(invoiceId);
    if (requestNo !== linesRequest.current) return;
    setFetchingLines(false);
    if (!r.ok) {
      setModalLines([]);
      setModalLinesError(r.error);
      return;
    }
    if (r.rows.length === 0) {
      setModalLines([]);
      setModalLinesError('No lines found for this invoice. Check the invoice number.');
      return;
    }
    setModalLines(buildLines(r.rows, suggestedLines));
    const number = r.rows[0]?.invoice_number;
    if (number) setModalInvoice((prev) => (prev ? { ...prev, document_number: prev.document_number || number } : prev));
  };

  const handleOpenIssueCandidate = (candidate) => {
    resetModal();
    setSelectedCandidate(candidate);
    setModalInvoice({
      id: candidate.invoice_id,
      document_number: candidate.invoice_number,
      platform: candidate.platform,
      store_id: candidate.store_id,
      platform_order_id: candidate.platform_order_id
    });
    setModalInvoiceInput(candidate.invoice_number || String(candidate.invoice_id));
    setModalCode(candidate.suggested_correction_code || '');
    setModalSourceRef(candidate.suggested_source_ref || '');
    setModalReason('');
    setModalMode(modeForCandidate(candidate));
    setShowIssueModal(true);
    loadModalLines(candidate.invoice_id, candidate.suggested_lines);
  };

  const handleOpenManualIssue = () => {
    resetModal();
    linesRequest.current++;
    setSelectedCandidate(null);
    setModalInvoice(null);
    setModalInvoiceInput('');
    setModalCode('');
    setModalSourceRef('');
    setModalReason('');
    setModalMode('all');
    setShowIssueModal(true);
  };

  const handleOpenIssueFromBalance = () => {
    if (!balanceInvoice) return;
    resetModal();
    linesRequest.current++;
    setSelectedCandidate(null);
    setModalInvoice(balanceInvoice);
    setModalInvoiceInput(balanceInvoice.document_number || String(balanceInvoice.id));
    setModalCode('');
    setModalSourceRef('');
    setModalReason('');
    setModalMode('all');
    setModalLines(buildLines(balanceRows, null));
    setShowIssueModal(true);
  };

  const handleModalFindInvoice = async () => {
    setModalSubmitError('');
    linesRequest.current++;
    setFetchingLines(true);
    setModalLines([]);
    setModalInvoice(null);
    const found = await resolveInvoice(modalInvoiceInput);
    if (!found.ok) {
      setFetchingLines(false);
      setModalLinesError(found.error);
      return;
    }
    setModalInvoice(found.invoice);
    await loadModalLines(found.invoice.id, null);
  };

  const updateLine = (index, field, value) => {
    setModalLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const fillLineRemaining = (index) => {
    setModalLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        return modalMode === 'quantity'
          ? { ...line, qty: formatQty(line.remaining_quantity) }
          : { ...line, amount: line.remaining_amount ?? '' };
      })
    );
  };

  const openTotalCents = useMemo(
    () => modalLines.reduce((acc, l) => acc + toCents(l.remaining_amount), 0),
    [modalLines]
  );

  const enteredAmountCents = useMemo(
    () => modalLines.reduce((acc, l) => acc + (POSITIVE_NUMBER.test(l.amount.trim()) ? toCents(l.amount) : 0), 0),
    [modalLines]
  );

  /** Checks the form; returns {error} or {payload}. The server checks everything again (it has the last word). */
  const buildPayload = () => {
    if (!modalInvoice?.id) return { error: 'Find the invoice first.' };
    if (modalLines.length === 0) return { error: 'The invoice lines are not loaded yet.' };
    if (!CORRECTION_CODES.some((c) => c.code === modalCode)) return { error: 'Choose a correction code.' };
    const sourceRef = modalSourceRef.trim();
    if (!sourceRef) return { error: 'Type a reference for this adjustment (for example "cancel" or "return:123").' };
    if (sourceRef.length > 100) return { error: 'The reference is too long (100 characters at most).' };
    if (sourceRef.toLowerCase() === 'sale') return { error: '"sale" is used by invoices. Choose another reference.' };
    const reason = modalReason.trim();
    if (!reason) return { error: 'Write the reason for this credit note.' };
    if (reason.length > 500) return { error: 'The reason is too long (500 characters at most).' };

    let lines = null;
    if (modalMode === 'all') {
      if (openTotalCents <= 0) return { error: 'Nothing is left open on this invoice.' };
    } else {
      const field = modalMode === 'quantity' ? 'qty' : 'amount';
      const limitField = modalMode === 'quantity' ? 'remaining_quantity' : 'remaining_amount';
      const what = modalMode === 'quantity' ? 'units' : 'amount';
      lines = [];
      for (const line of modalLines) {
        const value = String(line[field] || '').trim();
        if (!value) continue;
        if (!POSITIVE_NUMBER.test(value) || Number(value) <= 0) {
          return { error: `Line ${line.line_no}: type a number above zero, or leave it empty.` };
        }
        if (Number(value) > Number(line[limitField] || 0)) {
          return {
            error: `Line ${line.line_no}: ${value} is more than the ${what} still open (${modalMode === 'quantity' ? formatQty(line[limitField]) : formatMoney(line[limitField])
              }).`
          };
        }
        lines.push(modalMode === 'quantity' ? { line_no: line.line_no, quantity: value } : { line_no: line.line_no, amount: value });
      }
      if (lines.length === 0) return { error: `Enter the ${what} to credit on at least one line.` };
    }

    return {
      payload: {
        invoice_id: modalInvoice.id,
        correction_code: modalCode,
        source_ref: sourceRef,
        reason,
        lines
      }
    };
  };

  const handleSubmitCreditNote = async (e) => {
    e.preventDefault();
    setModalSubmitError('');
    const { error, payload } = buildPayload();
    if (error) {
      setModalSubmitError(error);
      return;
    }

    const invoiceLabel = modalInvoice.document_number || `#${modalInvoice.id}`;
    const what =
      payload.lines === null
        ? `everything still open (${centsToMoney(openTotalCents)})`
        : modalMode === 'amount'
          ? `${centsToMoney(enteredAmountCents)} on ${payload.lines.length} line(s)`
          : `returned units on ${payload.lines.length} line(s)`;

    const confirmed = await confirm({
      title: 'Issue this credit note?',
      message: `Credit ${what} of invoice ${invoiceLabel}, code ${payload.correction_code}. An issued credit note can never be changed or deleted.`,
      confirmText: 'Issue Credit Note',
      cancelText: 'Go back',
      variant: 'warning'
    });
    if (!confirmed) return;

    setIsSubmitting(true);
    const res = await api.post('/api/credit-notes', payload);
    setIsSubmitting(false);

    if (!res.ok) {
      // Nothing was issued (400 = form problem, 409 = the database refused). Show the server's words.
      const message = res.networkError
        ? 'Could not reach the server, so it is not known whether the credit note was issued. Try again: sending the same reference again never issues a second credit note.'
        : serverMessage(res, 'The credit note was not issued');
      setModalSubmitError(message);
      notify.danger('Credit note not issued', message);
      return;
    }

    const doc = res.data?.document || {};
    const number = doc.document_number || 'the credit note';
    if (res.data?.already_issued) {
      notify.info(
        'Already issued earlier',
        `${number} (${formatMoney(doc.total_amount)}) was already issued for reference "${payload.source_ref}". Nothing new was issued.`
      );
    } else {
      notify.success('Credit note issued', `${number} for ${formatMoney(doc.total_amount)} against invoice ${invoiceLabel}.`);
    }

    setShowIssueModal(false);
    setActiveTab('issued');
    await Promise.all([reloadCandidates(), reloadIssued()]);
  };

  // --- BIR JSON preview -------------------------------------------------------------------------------

  const handleViewEisJson = async (doc) => {
    setPreview({ doc, loading: true, results: [], error: '' });
    const res = await api.get(`/api/documents/${encodeURIComponent(doc.id)}/eis-json`);
    setPreview((prev) => {
      if (!prev || prev.doc.id !== doc.id) return prev;
      return res.ok
        ? { doc, loading: false, results: unwrapList(res.data), error: '' }
        : { doc, loading: false, results: [], error: serverMessage(res, 'Could not load the BIR JSON preview') };
    });
  };

  // --- balance inspector ------------------------------------------------------------------------------

  const handleInspectBalance = async () => {
    setBalanceLoading(true);
    setBalanceError('');
    setBalanceRows([]);
    setBalanceInvoice(null);
    const found = await resolveInvoice(balanceInput);
    if (!found.ok) {
      setBalanceError(found.error);
      setBalanceLoading(false);
      return;
    }
    const r = await fetchBalance(found.invoice.id);
    setBalanceLoading(false);
    if (!r.ok) {
      setBalanceError(r.error);
      return;
    }
    if (r.rows.length === 0) {
      setBalanceError('No lines found for this invoice. Check the invoice number.');
      return;
    }
    setBalanceInvoice({ ...found.invoice, document_number: found.invoice.document_number || r.rows[0].invoice_number });
    setBalanceRows(r.rows);
  };

  const balanceOpenCents = useMemo(() => balanceRows.reduce((acc, l) => acc + toCents(l.remaining_amount), 0), [balanceRows]);

  // --- render -----------------------------------------------------------------------------------------

  const issuedCount = issuedTotals?.credit_note?.count ?? issued.length;
  const issuedTotalAmount = issuedTotals?.credit_note?.total_amount;

  return (
    <div className="cn-page">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            Credit Notes & Adjustments
          </h1>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className="btn btn-outline"
            style={{ borderRadius: 4 }}
            onClick={handleRefresh}
            disabled={loadingCandidates || loadingIssued}
            title="Reload the work list and the issued credit notes from the server"
          >
            <RefreshCw size={15} className={loadingCandidates || loadingIssued ? 'spinner' : ''} />
            <span>Refresh</span>
          </button>
          {canIssue && (
            <button type="button" className="btn btn-primary" style={{ borderRadius: 4 }} onClick={handleOpenManualIssue}>
              <Plus size={16} />
              <span>Issue Credit Note</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="cn-stats-grid">
        <div className="cn-stat-card">
          <div className="cn-stat-top">
            <span className="cn-stat-label">Work List</span>
            <div className="cn-stat-icon">
              <Clock size={20} />
            </div>
          </div>
          <div className="cn-stat-value">{loadingCandidates ? '…' : candidates.length}</div>
          <div className="cn-stat-subtext">
            <span>Invoices of cancelled, returned or refunded orders</span>
          </div>
        </div>

        <div className="cn-stat-card">
          <div className="cn-stat-top">
            <span className="cn-stat-label">Open on Work List</span>
            <div className="cn-stat-icon">
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="cn-stat-value">{loadingCandidates ? '…' : centsToMoney(openOnWorkListCents)}</div>
          <div className="cn-stat-subtext">
            <span>Still open on those invoices</span>
          </div>
        </div>

        <div className="cn-stat-card">
          <div className="cn-stat-top">
            <span className="cn-stat-label">Issued Credit Notes</span>
            <div className="cn-stat-icon">
              <FileCheck2 size={20} />
            </div>
          </div>
          <div className="cn-stat-value">{loadingIssued && !issuedTotals ? '…' : issuedCount}</div>
          <div className="cn-stat-subtext">
            <span>{platformFilter ? 'For the chosen platform' : 'All platforms'}</span>
          </div>
        </div>

        <div className="cn-stat-card">
          <div className="cn-stat-top">
            <span className="cn-stat-label">Total Credited</span>
            <div className="cn-stat-icon">
              <RotateCcw size={20} />
            </div>
          </div>
          <div className="cn-stat-value">{issuedTotalAmount !== undefined ? formatMoney(issuedTotalAmount) : '—'}</div>
          <div className="cn-stat-subtext">
            <span>Not sent to BIR yet (EIS transmission starts after the PTI)</span>
          </div>
        </div>
      </div>

      {/* Main Tabs & Table Card */}
      <div className="cn-toolbar-card">
        <div className="cn-tabs-bar">
          <div className="cn-tabs-group">
            <button
              className={`cn-tab-btn ${activeTab === 'candidates' ? 'active' : ''}`}
              onClick={() => setActiveTab('candidates')}
            >
              <Clock size={16} />
              <span>Accounting Work List</span>
              <span className="cn-tab-badge cn-tab-badge-amber">{candidates.length}</span>
            </button>

            <button
              className={`cn-tab-btn ${activeTab === 'issued' ? 'active' : ''}`}
              onClick={() => setActiveTab('issued')}
            >
              <FileCheck2 size={16} />
              <span>Issued Credit Notes</span>
              <span className="cn-tab-badge cn-tab-badge-neutral">{issuedCount}</span>
            </button>

            <button
              className={`cn-tab-btn ${activeTab === 'balance' ? 'active' : ''}`}
              onClick={() => setActiveTab('balance')}
            >
              <Search size={16} />
              <span>Balance Inspector</span>
            </button>
          </div>

          {activeTab !== 'balance' && (
            <div className="cn-controls-group">
              <div className="cn-search-box">
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search invoice, credit note, order..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ color: 'var(--text-subtle)' }} aria-label="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>

              <select
                className="cn-form-select"
                style={{ width: 'auto', padding: '7px 12px' }}
                value={platformFilter}
                onChange={(e) => {
                  setLoadingIssued(true);
                  setPlatformFilter(e.target.value);
                }}
              >
                {PLATFORM_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* TAB 1: CANDIDATES WORK LIST */}
        {activeTab === 'candidates' && (
          <div className="cn-table-wrapper">
            {candidatesError ? (
              <div className="cn-empty-state">
                <div className="cn-empty-icon">
                  <AlertTriangle size={26} style={{ color: 'var(--accent-rose)' }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>Work list not loaded</div>
                <p style={{ maxWidth: '480px', fontSize: '0.85rem' }}>{candidatesError}</p>
              </div>
            ) : loadingCandidates && candidates.length === 0 ? (
              <div className="cn-empty-state">
                <span className="spinner" />
                <p style={{ fontSize: '0.85rem' }}>Loading the work list…</p>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="cn-empty-state">
                <div className="cn-empty-icon">
                  <CheckCircle2 size={26} style={{ color: 'var(--accent-emerald)' }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
                  {candidates.length === 0 ? 'Work list is clear' : 'Nothing matches the search'}
                </div>
                <p style={{ maxWidth: '420px', fontSize: '0.85rem' }}>
                  {candidates.length === 0
                    ? 'No invoice needs a credit note right now. Invoices of orders that are cancelled, returned or refunded on the platform appear here.'
                    : 'Clear the search or choose another platform.'}
                </p>
              </div>
            ) : (
              <table className="cn-table">
                <thead>
                  <tr>
                    <th>Order & Store</th>
                    <th>Invoice</th>
                    <th>What happened</th>
                    <th>Suggested</th>
                    <th>Still Open</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map((cand) => (
                    <tr key={cand.invoice_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{cand.platform_order_id || '—'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                          <PlatformBadge platform={cand.platform} hideStatus />
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Store {cand.store_id ?? '—'}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--primary)' }}>{cand.invoice_number}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Issued {formatDateTime(cand.invoice_issued_at)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '2px' }}>
                          Total {formatMoney(cand.invoice_total)}
                          {toCents(cand.credited_amount) > 0 && <> &middot; credited {formatMoney(cand.credited_amount)}</>}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{cand.explanation || '—'}</div>
                        <div className="cn-reason-desc">
                          Order status now: {cand.order_status_now || cand.order_status_standard_now || '—'}
                          {cand.core_refund_amount !== null && cand.core_refund_amount !== undefined && (
                            <> &middot; platform refund {formatMoney(cand.core_refund_amount)}</>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="cn-reason-code-badge">Code {cand.suggested_correction_code || '—'}</span>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                          {SUGGESTED_ACTIONS[cand.suggested_action] || cand.suggested_action || ''}
                        </div>
                      </td>
                      <td>
                        <div className="cn-amount-main">{formatMoney(cand.open_amount)}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {canIssue ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '5px 10px', fontSize: '0.74rem', borderRadius: 4 }}
                            onClick={() => handleOpenIssueCandidate(cand)}
                          >
                            <span>Review & Issue</span>
                            <ArrowRight size={13} />
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>Accounting or IT issues it</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 2: ISSUED CREDIT NOTES (server register) */}
        {activeTab === 'issued' && (
          <div className="cn-table-wrapper">
            {issuedError ? (
              <div className="cn-empty-state">
                <div className="cn-empty-icon">
                  <AlertTriangle size={26} style={{ color: 'var(--accent-rose)' }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>Issued credit notes not loaded</div>
                <p style={{ maxWidth: '480px', fontSize: '0.85rem' }}>{issuedError}</p>
              </div>
            ) : loadingIssued && issued.length === 0 ? (
              <div className="cn-empty-state">
                <span className="spinner" />
                <p style={{ fontSize: '0.85rem' }}>Loading issued credit notes…</p>
              </div>
            ) : filteredIssued.length === 0 ? (
              <div className="cn-empty-state">
                <div className="cn-empty-icon">
                  <FileMinus size={26} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
                  {issued.length === 0 ? 'No credit notes issued' : 'Nothing matches the search'}
                </div>
                <p style={{ maxWidth: '420px', fontSize: '0.85rem' }}>
                  {issued.length === 0
                    ? 'No credit note has been issued yet.'
                    : 'The search looks at the credit notes loaded below. Clear it or load more.'}
                </p>
              </div>
            ) : (
              <table className="cn-table">
                <thead>
                  <tr>
                    <th>Credit Note #</th>
                    <th>Original Invoice</th>
                    <th>Order & Store</th>
                    <th>Code & Reason</th>
                    <th>Credited Amount</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssued.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--accent-rose)' }}>{item.document_number}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--primary)' }}>
                          {item.original_document_number || (item.original_document_id ? `#${item.original_document_id}` : '—')}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                          <PlatformBadge platform={item.platform} hideStatus />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.store_name || `Store ${item.store_id}`}</span>
                        </div>
                      </td>
                      <td>
                        <span className="cn-reason-code-badge">Code {item.correction_code || '—'}</span>
                      </td>
                      <td>
                        <div className="cn-amount-credited">-{formatMoney(item.total_amount)}</div>
                      </td>
                      <td>
                        <span className="badge badge-emerald">
                          <CheckCircle2 size={12} />
                          Issued
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {canViewEis && (
                          <button
                            type="button"
                            className="btn btn-info"
                            style={{ padding: '5px 10px', fontSize: '0.74rem', borderRadius: 4 }}
                            onClick={() => handleViewEisJson(item)}
                            title="Preview the BIR JSON for this credit note"
                          >
                            <Eye size={13} />
                            <span>BIR JSON</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!issuedError && issued.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)'
                }}
              >
                <span>
                  Showing {issued.length} of {issuedCount} credit note(s)
                </span>
                {issuedNextOffset !== null && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: '4px 10px', fontSize: '0.74rem', borderRadius: 4 }}
                    onClick={handleLoadMoreIssued}
                    disabled={loadingIssued}
                  >
                    {loadingIssued ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: INVOICE BALANCE INSPECTOR */}
        {activeTab === 'balance' && (
          <div style={{ padding: '24px' }}>
            <div style={{ maxWidth: '640px', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px' }}>What is still open on an invoice</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Type an invoice number (or order id / waybill). Shows, per line, what was invoiced, what was already credited
                and what can still be credited.
              </p>

              <form
                style={{ display: 'flex', gap: '10px' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  handleInspectBalance();
                }}
              >
                <input
                  type="text"
                  className="cn-form-input"
                  style={{ flex: 1 }}
                  placeholder="Invoice number, order id or waybill"
                  value={balanceInput}
                  onChange={(e) => setBalanceInput(e.target.value)}
                />
                <button type="submit" className="btn btn-primary" style={{ borderRadius: 4 }} disabled={balanceLoading || !balanceInput.trim()}>
                  {balanceLoading ? <span className="spinner" /> : <Search size={15} />}
                  <span>Check Balance</span>
                </button>
              </form>
              {balanceError && (
                <p style={{ marginTop: '10px', fontSize: '0.82rem', color: 'var(--accent-rose)' }}>{balanceError}</p>
              )}
            </div>

            {balanceInvoice && balanceRows.length > 0 && (
              <div
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px',
                  maxWidth: '760px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Invoice</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>
                      {balanceInvoice.document_number || `#${balanceInvoice.id}`}
                    </div>
                    {balanceInvoice.replaced_by_number && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-rose)' }}>
                        Replaced by {balanceInvoice.replaced_by_number}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Still open</span>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                      {centsToMoney(balanceOpenCents)}
                    </div>
                  </div>
                </div>

                <div className="cn-lines-card">
                  <div style={{ padding: '10px 14px', background: 'var(--border-light)', fontSize: '0.75rem', fontWeight: 700 }}>
                    PER LINE
                  </div>
                  {balanceRows.map((l) => (
                    <div key={l.line_no} className="cn-line-row">
                      <div>
                        <div style={{ fontWeight: 600 }}>{l.description || 'Line'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Line {l.line_no}
                          {l.sku ? ` · ${l.sku}` : ''} · {formatQty(l.quantity)} × {formatMoney(l.unit_price)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Invoiced</div>
                        <div style={{ fontWeight: 600 }}>{formatMoney(l.line_total)}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Credited {formatMoney(l.credited_amount)}
                          {toCents(l.credited_quantity) > 0 ? ` (${formatQty(l.credited_quantity)} unit(s))` : ''}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Still open</div>
                        <div style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>{formatMoney(l.remaining_amount)}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatQty(l.remaining_quantity)} unit(s)</div>
                      </div>
                    </div>
                  ))}
                </div>

                {canIssue && balanceOpenCents > 0 && (
                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-primary" style={{ borderRadius: 4 }} onClick={handleOpenIssueFromBalance}>
                      <span>Issue Credit Note for this Invoice</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: ISSUE CREDIT NOTE */}
      {showIssueModal && (
        <div className="order-drawer-backdrop no-print" onClick={() => !isSubmitting && setShowIssueModal(false)}>
          <aside className="order-right-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="modal-header">
              <div>
                {modalInvoice?.platform && (
                  <div style={{ marginBottom: '4px' }}>
                    <PlatformBadge platform={modalInvoice.platform} hideStatus />
                  </div>
                )}
                <div className="modal-title-row">
                  <span>Issue Credit Note</span>
                  {modalInvoice && (
                    <span className="order-id-badge num-target">
                      {modalInvoice.document_number || `#${modalInvoice.id}`}
                    </span>
                  )}
                </div>
                {modalInvoice?.platform_order_id && (
                  <p className="modal-subtitle">
                    Order: <span className="num-target">{modalInvoice.platform_order_id}</span>
                    {modalInvoice.store_id !== undefined && modalInvoice.store_id !== null && (
                      <>
                        {' '}
                        &middot; Store <span className="num-target">{modalInvoice.store_id}</span>
                      </>
                    )}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowIssueModal(false)}
                disabled={isSubmitting}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={handleSubmitCreditNote}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
            >
              <div className="modal-body" style={{ overflowY: 'auto', gap: '14px' }}>
                {selectedCandidate?.explanation && (
                  <div>
                    <div className="section-title">Why this invoice is on the work list</div>
                    <div className="meta-box">
                      <div className="meta-col">
                        <span className="meta-lbl">What happened</span>
                        <span className="meta-val">{selectedCandidate.explanation}</span>
                      </div>
                      <div className="meta-col">
                        <span className="meta-lbl">Suggested</span>
                        <span className="meta-val">
                          {SUGGESTED_ACTIONS[selectedCandidate.suggested_action] || selectedCandidate.suggested_action}
                        </span>
                      </div>
                      <div className="meta-col">
                        <span className="meta-lbl">Still open</span>
                        <span className="meta-val num-target">{formatMoney(selectedCandidate.open_amount)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Invoice (typed only when not opened from the work list or the balance check) */}
                {!selectedCandidate && (
                  <div className="cn-form-group">
                    <label className="cn-form-label">
                      <span>Invoice</span>
                      <span className="cn-form-hint">Invoice number, order id or waybill</span>
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="e.g. SI-00000001"
                        className="cn-form-input"
                        value={modalInvoiceInput}
                        onChange={(e) => setModalInvoiceInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleModalFindInvoice();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ borderRadius: 4, whiteSpace: 'nowrap' }}
                        onClick={handleModalFindInvoice}
                        disabled={fetchingLines || !modalInvoiceInput.trim()}
                      >
                        {fetchingLines ? <span className="spinner" /> : <Search size={14} />}
                        <span>Find Invoice</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Correction code */}
                <div className="cn-form-group">
                  <label className="cn-form-label">
                    <span>Correction Code</span>
                    {selectedCandidate?.suggested_correction_code && (
                      <span className="cn-form-hint">Suggested: {selectedCandidate.suggested_correction_code}</span>
                    )}
                  </label>
                  <select className="cn-form-select" value={modalCode} onChange={(e) => setModalCode(e.target.value)}>
                    <option value="">Choose a code…</option>
                    {CORRECTION_CODES.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.code} — {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reference (source_ref) */}
                <div className="cn-form-group">
                  <label className="cn-form-label">
                    <span>Reference</span>
                    <span className="cn-form-hint">Names this adjustment, e.g. cancel, return:123, refund:456</span>
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    className="cn-form-input"
                    placeholder="e.g. cancel"
                    value={modalSourceRef}
                    onChange={(e) => setModalSourceRef(e.target.value)}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                    The same reference on the same order always gives back the credit note already issued for it. Use a new
                    reference for a new adjustment.
                  </span>
                </div>

                {/* Reason */}
                <div className="cn-form-group">
                  <label className="cn-form-label">
                    <span>Reason</span>
                    <span className="cn-form-hint">Required · {modalReason.length}/500</span>
                  </label>
                  <textarea
                    rows={3}
                    maxLength={500}
                    className="cn-form-textarea"
                    placeholder="e.g. Buyer cancelled the order on Shopee after packing"
                    value={modalReason}
                    onChange={(e) => setModalReason(e.target.value)}
                  />
                </div>

                {/* What to credit */}
                <div className="cn-form-group">
                  <label className="cn-form-label">
                    <span>What to credit</span>
                  </label>
                  <select className="cn-form-select" value={modalMode} onChange={(e) => setModalMode(e.target.value)}>
                    {CREDIT_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Lines */}
                <div>
                  <div className="section-title">Invoice Lines ({modalLines.length})</div>

                  {fetchingLines ? (
                    <div style={{ padding: '12px', fontSize: '0.78rem', color: '#64748b' }}>
                      <span className="spinner" /> Loading what is still open…
                    </div>
                  ) : modalLinesError ? (
                    <div
                      style={{
                        padding: '12px',
                        background: '#fff1f2',
                        border: '1px solid #fecdd3',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        color: '#be123c'
                      }}
                    >
                      {modalLinesError}
                      {modalInvoice?.id && (
                        <div style={{ marginTop: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '3px 8px', fontSize: '0.7rem', borderRadius: 4 }}
                            onClick={() => loadModalLines(modalInvoice.id, selectedCandidate?.suggested_lines)}
                          >
                            Try again
                          </button>
                        </div>
                      )}
                    </div>
                  ) : modalLines.length === 0 ? (
                    <div
                      style={{
                        padding: '12px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        color: '#64748b'
                      }}
                    >
                      Find the invoice first to see its lines.
                    </div>
                  ) : (
                    modalLines.map((line, idx) => (
                      <div key={line.line_no} className="item-card" style={idx > 0 ? { marginTop: '8px' } : undefined}>
                        <div className="item-name">
                          {line.line_no}. {line.description || 'Line'}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            marginTop: '4px'
                          }}
                        >
                          <div className="sku-pill">
                            Still open: <span className="num-target">{formatQty(line.remaining_quantity)} unit(s)</span> ·{' '}
                            <span className="num-target">{formatMoney(line.remaining_amount)}</span>
                          </div>
                          {modalMode !== 'all' && (
                            <button
                              type="button"
                              className="btn btn-outline"
                              style={{ padding: '3px 8px', fontSize: '0.7rem', borderRadius: 4 }}
                              onClick={() => fillLineRemaining(idx)}
                            >
                              All open
                            </button>
                          )}
                        </div>
                        {modalMode !== 'all' && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              marginTop: '6px'
                            }}
                          >
                            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b' }}>
                              {modalMode === 'quantity' ? 'Units returned' : 'Amount refunded (PHP)'}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '140px' }}>
                              {modalMode === 'amount' && <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>₱</span>}
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0"
                                className="cn-form-input num-target"
                                style={{ padding: '5px 8px', fontSize: '0.82rem', textAlign: 'right' }}
                                value={modalMode === 'quantity' ? line.qty : line.amount}
                                onChange={(e) => updateLine(idx, modalMode === 'quantity' ? 'qty' : 'amount', e.target.value)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Total */}
                {modalLines.length > 0 && (
                  <div>
                    <div className="section-title">Credit Note Total</div>
                    <div className="totals-box">
                      <div className="totals-row grand-total">
                        <span>
                          {modalMode === 'all'
                            ? 'Everything still open'
                            : modalMode === 'amount'
                              ? 'Amounts entered'
                              : 'Returned units'}
                        </span>
                        <span className="total-amount-display num-target">
                          {modalMode === 'all'
                            ? `-${centsToMoney(openTotalCents)}`
                            : modalMode === 'amount'
                              ? `-${centsToMoney(enteredAmountCents)}`
                              : 'worked out by the server'}
                        </span>
                      </div>
                      <div className="totals-row">
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                          The exact amounts and VAT are calculated by the database when the credit note is issued.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {modalSubmitError && (
                  <div
                    role="alert"
                    style={{
                      padding: '10px 12px',
                      background: '#fff1f2',
                      border: '1px solid #fecdd3',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      color: '#be123c',
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'flex-start'
                    }}
                  >
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span>{modalSubmitError}</span>
                  </div>
                )}
              </div>

              {/* Sticky Footer */}
              <div className="modal-footer">
                <button
                  type="button"
                  className="modal-btn modal-btn-secondary"
                  style={{ borderRadius: 4 }}
                  onClick={() => setShowIssueModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn modal-btn-primary"
                  style={{ borderRadius: 4 }}
                  disabled={isSubmitting || fetchingLines || !modalInvoice || modalLines.length === 0}
                >
                  {isSubmitting ? 'Issuing…' : 'Issue Credit Note'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {/* MODAL 2: BIR JSON PREVIEW (from the server; not sent to BIR) */}
      {preview && (
        <div className="order-drawer-backdrop no-print" onClick={() => setPreview(null)}>
          <aside className="order-right-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ marginBottom: '4px' }}>
                  <PlatformBadge platform={preview.doc.platform} hideStatus />
                </div>
                <div className="modal-title-row">
                  <span>Credit Note</span>
                  <span className="order-id-badge num-target">{preview.doc.document_number}</span>
                </div>
                <p className="modal-subtitle">
                  Original invoice: <span className="num-target">{preview.doc.original_document_number || '—'}</span> &middot;
                  Issued <span className="num-target">{formatDateTime(preview.doc.issued_at)}</span>
                </p>
              </div>
              <button type="button" className="btn-close" onClick={() => setPreview(null)} aria-label="Close preview">
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ overflowY: 'auto' }}>
              <div>
                <div className="section-title">Credit Note Details</div>
                <div className="meta-box">
                  <div className="meta-col">
                    <span className="meta-lbl">Issued Date</span>
                    <span className="meta-val num-target">{formatDateTime(preview.doc.issued_at)}</span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Correction Code</span>
                    <span className="meta-val">
                      Code {preview.doc.correction_code || '—'} &middot; {codeLabel(preview.doc.correction_code)}
                    </span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Reason</span>
                    <span className="meta-val">{preview.doc.correction_reason || '—'}</span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">BIR &amp; Print Status</span>
                    <span className="meta-val">
                      Not sent to BIR yet &middot;{' '}
                      {preview.doc.print_count > 0 ? `Printed ${preview.doc.print_count}×` : 'Not printed'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="section-title">Amounts</div>
                <div className="totals-box">
                  <div className="totals-row">
                    <span>VATable sales</span>
                    <span className="num-target">{formatMoney(preview.doc.vatable_sales)}</span>
                  </div>
                  <div className="totals-row">
                    <span>VAT</span>
                    <span className="num-target">VAT {formatMoney(preview.doc.vat_amount)}</span>
                  </div>
                  <div className="totals-row grand-total">
                    <span>Total credited</span>
                    <span className="total-amount-display num-target">-{formatMoney(preview.doc.total_amount)}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="section-title">BIR JSON Preview (not sent to BIR yet)</div>
                {preview.loading ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span className="spinner" /> Loading…
                  </div>
                ) : preview.error ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent-rose)' }}>{preview.error}</div>
                ) : preview.results.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>The server returned no preview for this document.</div>
                ) : (
                  preview.results.map((row) => {
                    // payload_json is the exact text BIR would receive: shown as is, never re-parsed
                    // (JSON.parse would turn "840.00" into 840).
                    const payload = row.payload_json ?? row.payload ?? null;
                    const issues = Array.isArray(row.issues) ? row.issues : [];
                    return (
                      <div key={`${row.document_id}-${row.trans_class}`} style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                          Tax class {row.trans_class || '—'}
                        </div>
                        {issues.length > 0 && (
                          <div
                            style={{
                              padding: '8px 10px',
                              background: '#fff1f2',
                              border: '1px solid #fecdd3',
                              borderRadius: '8px',
                              fontSize: '0.76rem',
                              color: '#be123c',
                              marginBottom: '6px'
                            }}
                          >
                            BIR would reject this as it is: {issues.join('; ')}
                          </div>
                        )}
                        <pre
                          style={{
                            background: '#0b1220',
                            color: '#86efac',
                            padding: '12px',
                            borderRadius: '8px',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '0.74rem',
                            lineHeight: 1.45,
                            maxHeight: '280px',
                            overflowY: 'auto',
                            margin: 0
                          }}
                        >
                          {typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}
                        </pre>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="modal-btn modal-btn-secondary" style={{ borderRadius: 4 }} onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
