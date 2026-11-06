import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileMinus,
  Search,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  ShieldAlert,
  ArrowRight,
  RotateCcw,
  X,
  FileCheck2,
  Eye,
  AlertCircle,
  Copy,
  Check,
  Building2,
  Hash,
  ExternalLink
} from 'lucide-react';
import { api } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { useNotify, useConfirm } from '../context/NotificationContext';
import './creditNotes.css';

// Standard BIR RMC 98-2026 Reason Codes
const REASON_CODES = [
  { code: '01', label: 'Cancel & Reissue (Buyer TIN / Business Name)', default: true },
  { code: '02', label: 'Goods Returned / Defective Merchandise' },
  { code: '03', label: 'Order Cancelled by Customer / Platform' },
  { code: '04', label: 'Post-Sale Platform Discount / Rebate Discrepancy' },
  { code: '05', label: 'Other Commercial Adjustment / Correction' }
];

export default function CreditNotesPage() {
  const { user } = useAuth();
  const notify = useNotify();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState('candidates'); // 'candidates' | 'issued' | 'balance'
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('All');

  // Live Data States
  const [candidates, setCandidates] = useState([]);
  const [issuedLedger, setIssuedLedger] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Issue Modal State
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [modalInvoiceId, setModalInvoiceId] = useState('');
  const [modalReasonCode, setModalReasonCode] = useState('01');
  const [modalReasonText, setModalReasonText] = useState('');
  const [modalLines, setModalLines] = useState([]);
  const [fetchingBalance, setFetchingBalance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // BIR EIS JSON Modal State
  const [previewDoc, setPreviewDoc] = useState(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [loadingJson, setLoadingJson] = useState(false);

  // Balance Inspector State
  const [balanceInputInvoice, setBalanceInputInvoice] = useState('');
  const [balanceResult, setBalanceResult] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // 1. Fetch live pending candidate orders
  const fetchLiveCandidates = useCallback(async (showNotification = false) => {
    setLoadingCandidates(true);
    try {
      const res = await api.get('/api/credit-notes/candidates');
      if (res.ok && Array.isArray(res.data)) {
        setCandidates(res.data);
        if (showNotification) {
          notify.success('Updated', `Fetched ${res.data.length} candidate record(s).`);
        }
      } else {
        setCandidates([]);
        if (showNotification) {
          notify.info('Work List Current', 'No pending credit note candidates found.');
        }
      }
    } catch (err) {
      notify.danger('Candidates Error', err.message || 'Unable to load candidates from backend.');
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  }, [notify]);

  // 2. Fetch live issued credit notes ledger
  const fetchIssuedLedger = useCallback(async (showNotification = false) => {
    setLoadingLedger(true);
    try {
      const res = await api.get('/api/credit-notes');
      if (res.ok && Array.isArray(res.data)) {
        setIssuedLedger(res.data);
        if (showNotification) {
          notify.success('Ledger Refreshed', `Loaded ${res.data.length} credit note(s).`);
        }
      } else {
        setIssuedLedger([]);
      }
    } catch (err) {
      notify.danger('Ledger Error', err.message || 'Unable to load issued credit notes.');
      setIssuedLedger([]);
    } finally {
      setLoadingLedger(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchLiveCandidates(false);
    fetchIssuedLedger(false);
  }, [fetchLiveCandidates, fetchIssuedLedger]);

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return candidates.filter((item) => {
      const matchesSearch =
        !q ||
        item.orderId?.toLowerCase().includes(q) ||
        item.customer?.toLowerCase().includes(q) ||
        item.invoiceId?.toLowerCase().includes(q) ||
        item.tracking?.toLowerCase().includes(q) ||
        item.storeName?.toLowerCase().includes(q);
      const matchesPlatform = platformFilter === 'All' || item.platform === platformFilter;
      return matchesSearch && matchesPlatform;
    });
  }, [candidates, searchQuery, platformFilter]);

  // Filter issued ledger
  const filteredIssued = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return issuedLedger.filter((item) => {
      const matchesSearch =
        !q ||
        item.id?.toLowerCase().includes(q) ||
        item.invoiceId?.toLowerCase().includes(q) ||
        item.orderId?.toLowerCase().includes(q) ||
        item.reason?.toLowerCase().includes(q) ||
        item.storeName?.toLowerCase().includes(q);
      const matchesPlatform = platformFilter === 'All' || item.platform === platformFilter;
      return matchesSearch && matchesPlatform;
    });
  }, [issuedLedger, searchQuery, platformFilter]);

  // Total Credited Sum
  const totalCreditedValue = useMemo(() => {
    return issuedLedger.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
  }, [issuedLedger]);

  // Launch Issue Modal pre-populated from a candidate
  const handleOpenIssueCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setModalInvoiceId(candidate.invoiceId || '');
    setModalReasonCode(candidate.suggestedCode || '01');
    setModalReasonText(candidate.trigger || '');

    if (Array.isArray(candidate.items) && candidate.items.length > 0) {
      setModalLines(
        candidate.items.map((it) => ({
          lineId: it.id || it.line_id,
          name: it.name || it.description || 'Product Line',
          creditable: parseFloat(it.creditable || it.unitPrice || '0').toFixed(2),
          amountToCredit: parseFloat(it.creditable || it.unitPrice || '0').toFixed(2)
        }))
      );
    } else {
      const amount = parseFloat(candidate.creditableBalance || candidate.totalInvoiceAmount || '0').toFixed(2);
      setModalLines([
        {
          lineId: 'line_1',
          name: `Goods for order ${candidate.orderId || candidate.invoiceId}`,
          creditable: amount,
          amountToCredit: amount
        }
      ]);
    }

    setShowIssueModal(true);
  };

  // Open blank manual issue modal
  const handleOpenManualIssue = () => {
    setSelectedCandidate(null);
    setModalInvoiceId('');
    setModalReasonCode('01');
    setModalReasonText('');
    setModalLines([]);
    setShowIssueModal(true);
  };

  // Live balance lookup for manual modal entry
  const handleLookupInvoiceBalance = async () => {
    const target = modalInvoiceId.trim();
    if (!target) {
      notify.warning('Invoice Required', 'Please enter an invoice ID to query balance.');
      return;
    }
    setFetchingBalance(true);
    try {
      const res = await api.get(`/api/invoices/${encodeURIComponent(target)}/balance`);
      if (res.ok && res.data) {
        const lines = res.data.lines || [];
        if (lines.length > 0) {
          setModalLines(
            lines.map((l) => ({
              lineId: l.line_id || l.id,
              name: l.description || l.name || 'Line Item',
              creditable: parseFloat(l.open_balance ?? l.remaining ?? '0').toFixed(2),
              amountToCredit: parseFloat(l.open_balance ?? l.remaining ?? '0').toFixed(2)
            }))
          );
        } else {
          const bal = parseFloat(res.data.open_balance ?? res.data.balance ?? '0').toFixed(2);
          setModalLines([
            {
              lineId: 'line_1',
              name: `Invoice ${target} Total Balance`,
              creditable: bal,
              amountToCredit: bal
            }
          ]);
        }
        notify.success('Balance Loaded', `Retrieved open ledger balance for ${target}.`);
      } else {
        notify.warning('Not Found', `No open balance records returned for ${target}.`);
      }
    } catch (err) {
      notify.danger('Lookup Failed', err.message || 'Could not query invoice balance.');
    } finally {
      setFetchingBalance(false);
    }
  };

  // Inspector Tab balance check
  const handleInspectBalance = async () => {
    const target = balanceInputInvoice.trim();
    if (!target) return;
    setBalanceLoading(true);
    setBalanceResult(null);
    try {
      const res = await api.get(`/api/invoices/${encodeURIComponent(target)}/balance`);
      if (res.ok && res.data) {
        setBalanceResult(res.data);
      } else {
        notify.warning('No Records', `No active balance found for ${target}.`);
      }
    } catch (err) {
      notify.danger('Lookup Error', err.message || 'Failed to inspect invoice balance.');
    } finally {
      setBalanceLoading(false);
    }
  };

  // Calculated total amount to credit
  const totalCreditAmount = useMemo(() => {
    return modalLines
      .reduce((acc, curr) => acc + (parseFloat(curr.amountToCredit) || 0), 0)
      .toFixed(2);
  }, [modalLines]);

  const handleLineAmountChange = (index, value) => {
    setModalLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const maxVal = parseFloat(line.creditable) || 0;
        let num = parseFloat(value);
        if (isNaN(num)) num = 0;
        if (num > maxVal) num = maxVal;
        if (num < 0) num = 0;
        return { ...line, amountToCredit: value };
      })
    );
  };

  const handleLineCreditFull = (index) => {
    setModalLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        return { ...line, amountToCredit: line.creditable };
      })
    );
  };

  // Submit Credit Note (POST /api/credit-notes)
  const handleSubmitCreditNote = async (e) => {
    e.preventDefault();

    const inv = modalInvoiceId.trim();
    if (!inv) {
      notify.warning('Validation', 'Target invoice ID is required.');
      return;
    }
    if (!modalReasonText.trim()) {
      notify.warning('Validation', 'Please provide a reason description for BIR audit logging.');
      return;
    }
    if (parseFloat(totalCreditAmount) <= 0) {
      notify.warning('Validation', 'Credit Note amount must be greater than ₱0.00.');
      return;
    }

    for (const l of modalLines) {
      if (parseFloat(l.amountToCredit) > parseFloat(l.creditable)) {
        notify.danger('Over-crediting Error', `"${l.name}" exceeds remaining balance of ₱${l.creditable}.`);
        return;
      }
    }

    const confirmed = await confirm({
      title: 'Issue Immutable Credit Note?',
      message: `You are about to issue Credit Note for ₱${parseFloat(totalCreditAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} against Invoice ${inv}. Once registered, it cannot be modified or deleted under BIR RMC 98-2026 guidelines.`,
      confirmText: 'Issue Credit Note',
      cancelText: 'Cancel & Review',
      variant: 'warning'
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    const payload = {
      invoice_id: inv,
      reason_code: modalReasonCode,
      reason: modalReasonText.trim(),
      lines: modalLines.map((l) => ({
        line_id: l.lineId,
        amount: parseFloat(l.amountToCredit).toFixed(2)
      }))
    };

    try {
      const res = await api.post('/api/credit-notes', payload);
      if (res.ok && res.data) {
        notify.success('Issued', `Credit Note ${res.data.id || 'record'} registered successfully.`);
        if (selectedCandidate) {
          setCandidates((prev) => prev.filter((c) => c.id !== selectedCandidate.id));
        }
        setShowIssueModal(false);
        fetchIssuedLedger(false);
        setActiveTab('issued');
      } else {
        notify.danger('Submission Failed', res.message || 'Could not register credit note.');
      }
    } catch (err) {
      notify.danger('Issue Failed', err.message || 'Error communicating with backend.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // View Live BIR EIS JSON Payload
  const handleViewEisJson = async (cn) => {
    setLoadingJson(true);
    setCopiedJson(false);
    try {
      const res = await api.get(`/api/documents/${encodeURIComponent(cn.id)}/eis-json`);
      if (res.ok && res.data) {
        setPreviewDoc({ ...cn, eisJson: res.data });
      } else {
        notify.warning('EIS Schema', 'No generated EIS payload returned by backend for this record.');
      }
    } catch (err) {
      notify.danger('Failed', err.message || 'Could not retrieve EIS JSON data.');
    } finally {
      setLoadingJson(false);
    }
  };

  const handleCopyJson = () => {
    if (!previewDoc?.eisJson) return;
    navigator.clipboard.writeText(JSON.stringify(previewDoc.eisJson, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div className="cn-page animate-fade-in">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '18px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            Credit Notes & Adjustments
          </h1>
          <p className="page-subtitle">
            BIR EIS & PTI compliant write-once ledger adjustments for returns, order cancellations, and invoice reissues
          </p>
        </div>

        <div className="page-actions">
          <button
            className="btn btn-outline"
            onClick={() => {
              fetchLiveCandidates(true);
              fetchIssuedLedger(true);
            }}
            disabled={loadingCandidates || loadingLedger}
            title="Refresh records from backend"
          >
            <RefreshCw size={15} className={loadingCandidates || loadingLedger ? 'spinner' : ''} />
            <span>Refresh</span>
          </button>
          <button className="btn btn-primary" onClick={handleOpenManualIssue}>
            <Plus size={16} />
            <span>Issue Credit Note</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="cn-stats-grid">
        <div className="cn-stat-card">
          <div className="cn-stat-top">
            <span className="cn-stat-label">Pending Action Candidates</span>
            <div className="cn-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--accent-amber, #f59e0b)' }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="cn-stat-value">{loadingCandidates ? '...' : candidates.length}</div>
          <div className="cn-stat-subtext">
            <span>Marketplace cancellations and return scans</span>
          </div>
        </div>

        <div className="cn-stat-card">
          <div className="cn-stat-top">
            <span className="cn-stat-label">Issued Credit Notes</span>
            <div className="cn-stat-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: 'var(--primary, #3b82f6)' }}>
              <FileCheck2 size={18} />
            </div>
          </div>
          <div className="cn-stat-value">{loadingLedger ? '...' : issuedLedger.length}</div>
          <div className="cn-stat-subtext">
            <span>Total write-once audit records</span>
          </div>
        </div>

        <div className="cn-stat-card">
          <div className="cn-stat-top">
            <span className="cn-stat-label">Total Credited Value</span>
            <div className="cn-stat-icon" style={{ background: 'rgba(244, 63, 94, 0.12)', color: 'var(--accent-rose, #f43f5e)' }}>
              <RotateCcw size={18} />
            </div>
          </div>
          <div className="cn-stat-value">
            ₱{totalCreditedValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="cn-stat-subtext">
            <span>Deductions reconciled for VAT declaration</span>
          </div>
        </div>

        <div className="cn-stat-card">
          <div className="cn-stat-top">
            <span className="cn-stat-label">EIS Compliance Engine</span>
            <div className="cn-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-emerald, #10b981)' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="cn-stat-value" style={{ fontSize: '1.2rem', color: 'var(--accent-emerald, #10b981)' }}>
            ACTIVE
          </div>
          <div className="cn-stat-subtext">
            <span>Strict non-overcredit balance enforcement</span>
          </div>
        </div>
      </div>

      {/* Main Container Card */}
      <div className="cn-toolbar-card">
        {/* Navigation & Filter Bar */}
        <div className="cn-tabs-bar">
          <div className="cn-tabs-group">
            <button
              className={`cn-tab-btn ${activeTab === 'candidates' ? 'active' : ''}`}
              onClick={() => setActiveTab('candidates')}
            >
              <Clock size={16} />
              <span>Accounting Candidates</span>
              <span className="cn-tab-badge cn-tab-badge-amber">{candidates.length}</span>
            </button>

            <button
              className={`cn-tab-btn ${activeTab === 'issued' ? 'active' : ''}`}
              onClick={() => setActiveTab('issued')}
            >
              <FileCheck2 size={16} />
              <span>Issued Credit Notes Ledger</span>
              <span className="cn-tab-badge cn-tab-badge-neutral">{issuedLedger.length}</span>
            </button>

            <button
              className={`cn-tab-btn ${activeTab === 'balance' ? 'active' : ''}`}
              onClick={() => setActiveTab('balance')}
            >
              <Search size={16} />
              <span>Balance Inspector</span>
            </button>
          </div>

          <div className="cn-controls-group">
            <div className="cn-search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search orders, invoices, buyers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ color: 'var(--text-subtle)' }}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              className="cn-form-select"
              style={{ width: 'auto', padding: '7px 12px' }}
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
            >
              <option value="All">All Platforms</option>
              <option value="Shopee">Shopee</option>
              <option value="Lazada">Lazada</option>
              <option value="TikTok Shop">TikTok Shop</option>
              <option value="Direct">Direct / Offline</option>
            </select>
          </div>
        </div>

        {/* TAB 1: CANDIDATES WORK LIST */}
        {activeTab === 'candidates' && (
          <div className="cn-table-wrapper">
            {loadingCandidates ? (
              <div className="cn-empty-state">
                <div className="spinner" style={{ width: '28px', height: '28px', marginBottom: '12px' }} />
                <div>Fetching candidate orders from backend...</div>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="cn-empty-state">
                <div className="cn-empty-icon">
                  <CheckCircle2 size={26} style={{ color: 'var(--accent-emerald, #10b981)' }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
                  Work list is clear
                </div>
                <p style={{ maxWidth: '420px', fontSize: '0.85rem' }}>
                  No candidate orders currently require credit notes. Orders flagged as returned, cancelled, or
                  requesting re-issuance will populate here automatically.
                </p>
              </div>
            ) : (
              <table className="cn-table">
                <thead>
                  <tr>
                    <th>Order & Store</th>
                    <th>Target Invoice</th>
                    <th>Trigger / Audit Reason</th>
                    <th>Suggested Code</th>
                    <th>Available Creditable</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map((cand) => (
                    <tr key={cand.id || cand.orderId}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{cand.orderId}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                          <span className="cn-store-tag">{cand.platform || 'General'}</span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{cand.storeName}</span>
                        </div>
                        {cand.tracking && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '2px' }}>
                            Waybill: {cand.tracking}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--primary, #3b82f6)' }}>{cand.invoiceId}</div>
                        {cand.invoiceDate && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Issued {cand.invoiceDate}</div>
                        )}
                        {cand.customer && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '2px' }}>
                            {cand.customer}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{cand.trigger || 'Adjustment Request'}</div>
                        <div className="cn-reason-desc">{cand.notes || 'Platform status adjustment detected'}</div>
                      </td>
                      <td>
                        <span className="cn-reason-code-badge">Code {cand.suggestedCode || '01'}</span>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                          {REASON_CODES.find((r) => r.code === (cand.suggestedCode || '01'))?.label.split('(')[0]}
                        </div>
                      </td>
                      <td>
                        <div className="cn-amount-main">
                          ₱{parseFloat(cand.creditableBalance || cand.totalInvoiceAmount || '0').toFixed(2)}
                        </div>
                        <span className="badge badge-emerald" style={{ marginTop: '3px' }}>
                          Available
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                          onClick={() => handleOpenIssueCandidate(cand)}
                        >
                          <span>Review & Issue</span>
                          <ArrowRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 2: ISSUED CREDIT NOTES LEDGER */}
        {activeTab === 'issued' && (
          <div className="cn-table-wrapper">
            {loadingLedger ? (
              <div className="cn-empty-state">
                <div className="spinner" style={{ width: '28px', height: '28px', marginBottom: '12px' }} />
                <div>Loading immutable credit note records...</div>
              </div>
            ) : filteredIssued.length === 0 ? (
              <div className="cn-empty-state">
                <div className="cn-empty-icon">
                  <FileMinus size={26} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
                  No credit notes issued
                </div>
                <p style={{ maxWidth: '420px', fontSize: '0.85rem' }}>
                  No credit note documents have been registered to the write-once ledger yet.
                </p>
              </div>
            ) : (
              <table className="cn-table">
                <thead>
                  <tr>
                    <th>Credit Note #</th>
                    <th>Original Invoice</th>
                    <th>Order & Store</th>
                    <th>Reason Code & Notes</th>
                    <th>Credited Amount</th>
                    <th>Registration Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssued.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--accent-rose, #f43f5e)' }}>{item.id}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{item.date || item.created_at}</div>
                        {item.author && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>by {item.author}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--primary, #3b82f6)' }}>{item.invoiceId || item.invoice_id}</div>
                        {item.replacedBy && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--accent-emerald, #10b981)', marginTop: '2px' }}>
                            ↳ Replaced by: <strong>{item.replacedBy}</strong>
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.orderId || item.order_id || 'Direct'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                          <span className="cn-store-tag">{item.platform || 'Direct'}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.storeName}</span>
                        </div>
                      </td>
                      <td>
                        <span className="cn-reason-code-badge">Code {item.reasonCode || item.reason_code}</span>
                        <div className="cn-reason-desc">{item.reason || item.description}</div>
                      </td>
                      <td>
                        <div className="cn-amount-credited">-₱{parseFloat(item.amount || '0').toFixed(2)}</div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>BIR VAT deduction</span>
                      </td>
                      <td>
                        <span className="badge badge-emerald">
                          <CheckCircle2 size={12} />
                          {item.status || 'EIS Registered'}
                        </span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', marginTop: '3px' }}>
                          Immutable Write-Once
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-outline"
                          style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                          onClick={() => handleViewEisJson(item)}
                          disabled={loadingJson}
                          title="Inspect official BIR EIS JSON document"
                        >
                          <Eye size={13} />
                          <span>EIS JSON</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 3: INVOICE BALANCE INSPECTOR */}
        {activeTab === 'balance' && (
          <div style={{ padding: '24px' }}>
            <div style={{ maxWidth: '640px', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px' }}>
                Inspect Invoice Creditable Balance
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Queries <code>/api/invoices/:id/balance</code> directly against live database ledgers to verify uncredited
                line limits before executing adjustments.
              </p>

              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  className="cn-form-input"
                  style={{ flex: 1 }}
                  placeholder="Enter invoice number (e.g. INV-2026-0001)..."
                  value={balanceInputInvoice}
                  onChange={(e) => setBalanceInputInvoice(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInspectBalance()}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleInspectBalance}
                  disabled={balanceLoading || !balanceInputInvoice.trim()}
                >
                  {balanceLoading ? <span className="spinner" /> : <Search size={15} />}
                  <span>Check Balance</span>
                </button>
              </div>
            </div>

            {balanceResult && (
              <div
                style={{
                  background: 'var(--bg-app, #f8fafc)',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  borderRadius: 'var(--radius-lg, 10px)',
                  padding: '20px',
                  maxWidth: '720px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Invoice</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary, #3b82f6)' }}>
                      {balanceResult.invoice_id}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Remaining Creditable</span>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-emerald, #10b981)' }}>
                      ₱{parseFloat(balanceResult.open_balance || '0').toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="cn-lines-card">
                  <div style={{ padding: '10px 14px', background: 'var(--border-light, #e2e8f0)', fontSize: '0.75rem', fontWeight: 700 }}>
                    LINE ITEM AUDIT BREAKDOWN
                  </div>
                  {(balanceResult.lines || []).length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      No specific line-level segregation found. Total open balance: ₱{parseFloat(balanceResult.open_balance || '0').toFixed(2)}
                    </div>
                  ) : (
                    balanceResult.lines.map((l, idx) => (
                      <div key={l.line_id || idx} className="cn-line-row">
                        <div>
                          <div style={{ fontWeight: 600 }}>{l.description || 'Line Item'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {l.line_id}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Original Amount</div>
                          <div style={{ fontWeight: 600 }}>₱{parseFloat(l.original_amount || '0').toFixed(2)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Available to Credit</div>
                          <div style={{ fontWeight: 700, color: 'var(--accent-emerald, #10b981)' }}>
                            ₱{parseFloat(l.remaining ?? l.open_balance ?? '0').toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setModalInvoiceId(balanceResult.invoice_id);
                      setModalReasonCode('01');
                      setModalReasonText('');
                      const lines = balanceResult.lines || [];
                      if (lines.length > 0) {
                        setModalLines(
                          lines.map((l) => ({
                            lineId: l.line_id,
                            name: l.description,
                            creditable: parseFloat(l.remaining ?? l.open_balance ?? '0').toFixed(2),
                            amountToCredit: parseFloat(l.remaining ?? l.open_balance ?? '0').toFixed(2)
                          }))
                        );
                      } else {
                        const bal = parseFloat(balanceResult.open_balance || '0').toFixed(2);
                        setModalLines([
                          {
                            lineId: 'line_1',
                            name: `Invoice ${balanceResult.invoice_id} Balance`,
                            creditable: bal,
                            amountToCredit: bal
                          }
                        ]);
                      }
                      setShowIssueModal(true);
                    }}
                  >
                    <span>Issue Credit Note for this Invoice</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: ISSUE CREDIT NOTE */}
      {showIssueModal && (
        <div className="cn-modal-overlay" onMouseDown={() => setShowIssueModal(false)}>
          <div className="cn-modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="cn-modal-header">
              <div className="cn-modal-title">
                <FileMinus size={20} style={{ color: 'var(--accent-rose, #f43f5e)' }} />
                <span>Issue BIR EIS Credit Note</span>
              </div>
              <button
                className="api-icon-btn"
                onClick={() => setShowIssueModal(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitCreditNote}>
              <div className="cn-modal-body">
                {/* Target Invoice */}
                <div className="cn-form-group">
                  <label className="cn-form-label">
                    <span>Target Invoice Number</span>
                    <span className="cn-form-hint">Must exist in issued tax invoice ledger</span>
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      required
                      placeholder="e.g. INV-2026-0001"
                      className="cn-form-input"
                      value={modalInvoiceId}
                      onChange={(e) => setModalInvoiceId(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={handleLookupInvoiceBalance}
                      disabled={fetchingBalance}
                    >
                      {fetchingBalance ? <span className="spinner" /> : <RefreshCw size={14} />}
                      <span>Fetch Balance</span>
                    </button>
                  </div>
                </div>

                {/* BIR Reason Code */}
                <div className="cn-form-group">
                  <label className="cn-form-label">
                    <span>Official Reason Code (BIR EIS Specification)</span>
                  </label>
                  <select
                    className="cn-form-select"
                    value={modalReasonCode}
                    onChange={(e) => setModalReasonCode(e.target.value)}
                  >
                    {REASON_CODES.map((r) => (
                      <option key={r.code} value={r.code}>
                        Code {r.code} — {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Explanation */}
                <div className="cn-form-group">
                  <label className="cn-form-label">
                    <span>Audit Explanation & Justification</span>
                    <span className="cn-form-hint">Mandatory for BIR audit trail</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    className="cn-form-textarea"
                    placeholder="Enter audit remarks (e.g. Customer return approved under RMA #, or re-issuance to corporate buyer with registered TIN)..."
                    value={modalReasonText}
                    onChange={(e) => setModalReasonText(e.target.value)}
                  />
                </div>

                {/* Line Items Breakdown */}
                <div className="cn-form-group">
                  <label className="cn-form-label">
                    <span>Creditable Line Allocations</span>
                    <span className="cn-form-hint">Line credit cannot exceed remaining balance</span>
                  </label>

                  {modalLines.length === 0 ? (
                    <div style={{ padding: '14px', background: 'var(--bg-app)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      No lines loaded. Enter an invoice ID and click <strong>"Fetch Balance"</strong> above.
                    </div>
                  ) : (
                    <div className="cn-lines-card">
                      {modalLines.map((line, idx) => (
                        <div key={line.lineId || idx} className="cn-line-row">
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{line.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Open balance: <strong>₱{line.creditable}</strong>
                            </div>
                          </div>
                          <div>
                            <button
                              type="button"
                              className="api-link-btn"
                              style={{ fontSize: '0.72rem' }}
                              onClick={() => handleLineCreditFull(idx)}
                            >
                              Credit Full
                            </button>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>₱</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={line.creditable}
                                className="cn-form-input"
                                style={{ padding: '6px 8px', fontSize: '0.85rem', textAlign: 'right' }}
                                value={line.amountToCredit}
                                onChange={(e) => handleLineAmountChange(idx, e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Deduction Summary */}
                <div className="cn-credit-total-box">
                  <div className="cn-credit-total-label">Total Credit Note Deduction:</div>
                  <div className="cn-credit-total-num">₱{totalCreditAmount}</div>
                </div>
              </div>

              <div className="cn-modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowIssueModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting || parseFloat(totalCreditAmount) <= 0}
                >
                  {isSubmitting ? (
                    <span className="spinner" />
                  ) : (
                    <>
                      <FileCheck2 size={16} />
                      <span>Issue Credit Note</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: BIR EIS JSON PREVIEW */}
      {previewDoc && (
        <div className="cn-modal-overlay" onMouseDown={() => setPreviewDoc(null)}>
          <div className="cn-modal-card" style={{ maxWidth: '680px' }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="cn-modal-header">
              <div className="cn-modal-title">
                <FileCheck2 size={20} style={{ color: 'var(--accent-emerald, #10b981)' }} />
                <span>BIR EIS Document Payload — {previewDoc.id}</span>
              </div>
              <button
                className="api-icon-btn"
                onClick={() => setPreviewDoc(null)}
                aria-label="Close preview"
              >
                <X size={18} />
              </button>
            </div>
            <div className="cn-modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                  Live write-once schema submitted to BIR Electronic Invoicing System (EIS).
                </p>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', gap: '5px' }}
                  onClick={handleCopyJson}
                >
                  {copiedJson ? <Check size={13} style={{ color: 'var(--accent-emerald, #10b981)' }} /> : <Copy size={13} />}
                  <span>{copiedJson ? 'Copied' : 'Copy Payload'}</span>
                </button>
              </div>
              <pre
                style={{
                  background: '#090d16',
                  color: '#4ade80',
                  padding: '16px',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontFamily: 'JetBrains Mono, Consolas, monospace',
                  fontSize: '0.76rem',
                  lineHeight: 1.5,
                  maxHeight: '380px',
                  overflowY: 'auto'
                }}
              >
                {JSON.stringify(previewDoc.eisJson, null, 2)}
              </pre>
            </div>
            <div className="cn-modal-footer">
              <button className="btn btn-outline" onClick={() => setPreviewDoc(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}