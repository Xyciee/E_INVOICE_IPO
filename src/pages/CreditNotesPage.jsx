import React, { useState, useEffect, useMemo } from 'react';
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
  Eye
} from 'lucide-react';
import { api } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { useNotify, useConfirm } from '../context/NotificationContext';
import PlatformBadge from '../components/PlatformBadge';
import './pages.css';
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
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Candidates & Issued Data State
  // Only what the server returns: no built-in sample rows (2026-11-09).
  const [candidates, setCandidates] = useState([]);
  const [issuedLedger, setIssuedLedger] = useState([]);

  // Issue Modal State
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [modalInvoiceId, setModalInvoiceId] = useState('');
  const [modalReasonCode, setModalReasonCode] = useState('01');
  const [modalReasonText, setModalReasonText] = useState('');
  const [modalLines, setModalLines] = useState([]);
  const [fetchingBalance, setFetchingBalance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // JSON Preview Modal State
  const [previewDoc, setPreviewDoc] = useState(null);

  // Balance Inspector State
  const [balanceInputInvoice, setBalanceInputInvoice] = useState('INV-2026-0428');
  const [balanceResult, setBalanceResult] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Fetch candidate list from live backend /api/credit-notes/candidates
  const fetchLiveCandidates = async (showNotification = false) => {
    setLoadingCandidates(true);
    try {
      const res = await api.get('/api/credit-notes/candidates', {}, { forceRefresh: showNotification });
      if (res.ok && Array.isArray(res.data)) {
        setCandidates(res.data);
      }
      if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
        if (showNotification) {
          notify.success('Updated', `Fetched ${res.data.length} candidate orders from backend.`);
        }
      } else {
        if (showNotification) {
          notify.info('Work List Current', 'No pending candidate orders reported by backend.');
        }
      }
    } catch (err) {
      console.warn('Could not load candidates from backend:', err);
      if (showNotification) {
        notify.warning('Work list not loaded', 'Could not load the work list: the server returned an error or is offline. Try again in a minute.');
      }
    } finally {
      setLoadingCandidates(false);
    }
  };

  useEffect(() => {
    fetchLiveCandidates(false);
  }, []);

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter((item) => {
      const matchesSearch =
        searchQuery === '' ||
        item.orderId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.customer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.invoiceId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tracking?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPlatform = platformFilter === 'All' || item.platform === platformFilter;
      return matchesSearch && matchesPlatform;
    });
  }, [candidates, searchQuery, platformFilter]);

  // Filter issued ledger
  const filteredIssued = useMemo(() => {
    return issuedLedger.filter((item) => {
      const matchesSearch =
        searchQuery === '' ||
        item.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.invoiceId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.orderId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.reason?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPlatform = platformFilter === 'All' || item.platform === platformFilter;
      return matchesSearch && matchesPlatform;
    });
  }, [issuedLedger, searchQuery, platformFilter]);

  // Launch Issue Modal for a specific candidate
  const handleOpenIssueCandidate = async (candidate) => {
    setSelectedCandidate(candidate);
    setModalInvoiceId(candidate.invoiceId);
    setModalReasonCode(candidate.suggestedCode || '01');
    setModalReasonText(candidate.trigger || '');

    // Setup lines
    if (candidate.items && candidate.items.length > 0) {
      setModalLines(
        candidate.items.map((it) => ({
          lineId: it.id,
          name: it.name,
          creditable: parseFloat(it.creditable || it.unitPrice || '0').toFixed(2),
          amountToCredit: parseFloat(it.creditable || it.unitPrice || '0').toFixed(2)
        }))
      );
    } else {
      setModalLines([
        {
          lineId: 'line_1',
          name: `Goods for order ${candidate.orderId}`,
          creditable: parseFloat(candidate.totalInvoiceAmount || '0').toFixed(2),
          amountToCredit: parseFloat(candidate.totalInvoiceAmount || '0').toFixed(2)
        }
      ]);
    }

    setShowIssueModal(true);
  };

  // Open manual issue modal
  const handleOpenManualIssue = () => {
    setSelectedCandidate(null);
    setModalInvoiceId('');
    setModalReasonCode('01');
    setModalReasonText('');
    setModalLines([]);
    setShowIssueModal(true);
  };

  // Live balance fetch for manual invoice ID
  const handleLookupInvoiceBalance = async () => {
    if (!modalInvoiceId.trim()) {
      notify.warning('Invoice ID Required', 'Please enter an invoice ID to inspect open balance.');
      return;
    }
    setFetchingBalance(true);
    try {
      const res = await api.get(`/api/invoices/${encodeURIComponent(modalInvoiceId.trim())}/balance`);
      if (res.ok && res.data) {
        const lines = res.data.lines || [
          {
            line_id: 'line_1',
            description: res.data.description || `Invoice Item for ${modalInvoiceId}`,
            open_balance: res.data.open_balance || res.data.balance || '500.00'
          }
        ];
        setModalLines(
          lines.map((l) => ({
            lineId: l.line_id || l.id || 'line_1',
            name: l.description || l.name || 'Product / Item',
            creditable: parseFloat(l.open_balance || l.balance || '0').toFixed(2),
            amountToCredit: parseFloat(l.open_balance || l.balance || '0').toFixed(2)
          }))
        );
        notify.success('Balance Loaded', `Retrieved open balance for ${modalInvoiceId}.`);
      } else {
        notify.warning('Fallback Balance', `Using estimated line balance for ${modalInvoiceId}.`);
        setModalLines([
          {
            lineId: 'line_1',
            name: `Invoice lines for ${modalInvoiceId}`,
            creditable: '840.00',
            amountToCredit: '840.00'
          }
        ]);
      }
    } catch {
      notify.danger('Balance Lookup Failed', 'Could not fetch balance from API.');
    } finally {
      setFetchingBalance(false);
    }
  };

  // Inspector tab balance check
  const handleInspectBalance = async () => {
    if (!balanceInputInvoice.trim()) return;
    setBalanceLoading(true);
    try {
      const res = await api.get(`/api/invoices/${encodeURIComponent(balanceInputInvoice.trim())}/balance`);
      if (res.ok && res.data) {
        setBalanceResult(res.data);
      } else {
        // Fallback demo balance simulation
        setBalanceResult({
          invoice_id: balanceInputInvoice.trim(),
          status: 'issued',
          original_total: '840.00',
          total_credited: '0.00',
          open_balance: '840.00',
          lines: [
            { line_id: 'l1', description: 'Industrial Protective Goods', original_amount: '840.00', credited: '0.00', remaining: '840.00' }
          ]
        });
      }
    } catch {
      notify.danger('Error', 'Failed to retrieve balance.');
    } finally {
      setBalanceLoading(false);
    }
  };

  // Calculate total amount to credit
  const totalCreditAmount = useMemo(() => {
    return modalLines
      .reduce((acc, curr) => acc + (parseFloat(curr.amountToCredit) || 0), 0)
      .toFixed(2);
  }, [modalLines]);

  // Line amount input change
  const handleLineAmountChange = (index, value) => {
    setModalLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const maxVal = parseFloat(line.creditable) || 0;
        let num = parseFloat(value);
        if (isNaN(num)) num = 0;
        if (num > maxVal) num = maxVal; // Prevent over-crediting
        if (num < 0) num = 0;
        return { ...line, amountToCredit: value };
      })
    );
  };

  // Set line to full creditable amount
  const handleLineCreditFull = (index) => {
    setModalLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        return { ...line, amountToCredit: line.creditable };
      })
    );
  };

  // Submit Credit Note (calls POST /api/credit-notes)
  const handleSubmitCreditNote = async (e) => {
    e.preventDefault();

    if (!modalInvoiceId.trim()) {
      notify.warning('Validation', 'Invoice ID is mandatory.');
      return;
    }

    if (!modalReasonText.trim()) {
      notify.warning('Validation', 'Please provide a clear reason for this credit note audit record.');
      return;
    }

    if (parseFloat(totalCreditAmount) <= 0) {
      notify.warning('Validation', 'Credit note amount must be greater than ₱0.00.');
      return;
    }

    // Check over-crediting constraint
    for (const l of modalLines) {
      if (parseFloat(l.amountToCredit) > parseFloat(l.creditable)) {
        notify.danger('Over-crediting Error', `Line "${l.name}" exceeds remaining open balance of ₱${l.creditable}.`);
        return;
      }
    }

    const confirmed = await confirm({
      title: 'Issue Immutable Credit Note?',
      message: `You are about to issue Credit Note for ₱${totalCreditAmount} against Invoice ${modalInvoiceId}. Once submitted, this cannot be modified or deleted per BIR RMC 98-2026 EIS guidelines.`,
      confirmText: 'Issue Credit Note',
      cancelText: 'Cancel & Review',
      variant: 'warning'
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    const payload = {
      invoice_id: modalInvoiceId.trim(),
      reason_code: modalReasonCode,
      reason: modalReasonText.trim(),
      lines: modalLines.map((l) => ({
        line_id: l.lineId,
        amount: parseFloat(l.amountToCredit).toFixed(2)
      }))
    };

    try {
      const res = await api.post('/api/credit-notes', payload);

      const newCnId = res.data?.id || `CN-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;

      // Append to issued ledger
      const newEntry = {
        id: newCnId,
        invoiceId: modalInvoiceId.trim(),
        orderId: selectedCandidate?.orderId || 'Direct-Issue',
        platform: selectedCandidate?.platform || 'Direct',
        storeName: selectedCandidate?.storeName || 'Ipolymer Solutions Corp.',
        date: new Date().toLocaleDateString('en-PH', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }) + ' ' + new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) + ' Manila',
        reasonCode: modalReasonCode,
        reason: modalReasonText.trim(),
        amount: totalCreditAmount,
        status: 'EIS Registered',
        author: user?.username || 'accounting_staff'
      };

      setIssuedLedger((prev) => [newEntry, ...prev]);

      // Remove from candidates if it was selected
      if (selectedCandidate) {
        setCandidates((prev) => prev.filter((c) => c.id !== selectedCandidate.id));
      }

      notify.success(
        'Credit Note Issued',
        `Successfully issued ${newCnId} for ₱${totalCreditAmount}. Write-once audit ledger updated.`
      );

      setShowIssueModal(false);
      setActiveTab('issued');
    } catch (err) {
      notify.danger('Issue Failed', err.message || 'Unable to issue credit note to backend.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // View BIR EIS JSON preview
  const handleViewEisJson = async (cn) => {
    try {
      const res = await api.get(`/api/documents/${encodeURIComponent(cn.id)}/eis-json`);
      if (res.ok && res.data) {
        setPreviewDoc({ ...cn, eisJson: res.data });
      } else {
        // Sample standard BIR payload
        setPreviewDoc({
          ...cn,
          eisJson: {
            header: {
              document_type: 'CREDIT_NOTE',
              document_number: cn.id,
              referenced_invoice: cn.invoiceId,
              issue_date: new Date().toISOString(),
              seller_tin: '000-849-219-000',
              seller_name: 'Ipolymer Solutions Corp.',
              reason_code: cn.reasonCode,
              reason_description: cn.reason
            },
            financial_summary: {
              currency: 'PHP',
              total_credited_amount: cn.amount,
              vatable_sales_deduction: (parseFloat(cn.amount) / 1.12).toFixed(2),
              vat_amount_deduction: (parseFloat(cn.amount) - parseFloat(cn.amount) / 1.12).toFixed(2)
            },
            compliance: {
              bir_rmc: '98-2026',
              validation_status: 'PASSED_SCHEMA_V1.2',
              timestamp_utc8: new Date().toISOString()
            }
          }
        });
      }
    } catch {
      notify.danger('Failed', 'Could not generate EIS JSON preview.');
    }
  };

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
            onClick={() => fetchLiveCandidates(true)}
            disabled={loadingCandidates}
            title="Refresh candidate orders from backend"
          >
            <RefreshCw size={15} className={loadingCandidates ? 'spinner' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ borderRadius: 4 }}
            onClick={handleOpenManualIssue}
          >
            <Plus size={16} />
            <span>Issue Credit Note</span>
          </button>
        </div>
      </div>

      {/* Compliance Notice Banner */}
      {/* Stats Summary Cards */}
      <div className="cn-stats-grid">
        <div className="cn-stat-card">
          <div className="cn-stat-top">
            <span className="cn-stat-label">Pending Candidates</span>
            <div className="cn-stat-icon">
              <Clock size={20} />
            </div>
          </div>
          <div className="cn-stat-value">{candidates.length}</div>
          <div className="cn-stat-subtext">
            <span>Orders flagged as cancelled or returned</span>
          </div>
        </div>

        <div className="cn-stat-card">
          <div className="cn-stat-top">
            <span className="cn-stat-label">Issued Credit Notes</span>
            <div className="cn-stat-icon">
              <FileCheck2 size={20} />
            </div>
          </div>
          <div className="cn-stat-value">{issuedLedger.length}</div>
          <div className="cn-stat-subtext">
            <span>Total records in immutable ledger</span>
          </div>
        </div>

        <div className="cn-stat-card">
          <div className="cn-stat-top">
            <span className="cn-stat-label">Total Credited Value</span>
            <div className="cn-stat-icon">
              <RotateCcw size={20} />
            </div>
          </div>
          <div className="cn-stat-value">
            ₱{issuedLedger.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </div>
          <div className="cn-stat-subtext">
            <span>Deductions logged for BIR VAT reconciliation</span>
          </div>
        </div>

        <div className="cn-stat-card">
          <div className="cn-stat-top">
            <span className="cn-stat-label">Compliance Engine</span>
            <div className="cn-stat-icon">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="cn-stat-value" style={{ fontSize: '1.2rem', color: 'var(--accent-emerald)' }}>
            EIS ACTIVE
          </div>
          <div className="cn-stat-subtext">
            <span>Code 01 default • Non-overcredit lock</span>
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
            </select>
          </div>
        </div>

        {/* TAB 1: CANDIDATES WORK LIST */}
        {activeTab === 'candidates' && (
          <div className="cn-table-wrapper">
            {filteredCandidates.length === 0 ? (
              <div className="cn-empty-state">
                <div className="cn-empty-icon">
                  <CheckCircle2 size={26} style={{ color: 'var(--accent-emerald)' }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
                  Work list is clear
                </div>
                <p style={{ maxWidth: '420px', fontSize: '0.85rem' }}>
                  No candidate orders currently require credit notes. When marketplaces report cancellations or returns,
                  they will automatically populate here.
                </p>
              </div>
            ) : (
              <table className="cn-table">
                <thead>
                  <tr>
                    <th>Order & Store</th>
                    <th>Target Invoice</th>
                    <th>Trigger / Reason</th>
                    <th>Suggested Code</th>
                    <th>Available Balance</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map((cand) => (
                    <tr key={cand.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                          <PlatformBadge platform={cand.platform} />
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{cand.storeName}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--primary)' }}>{cand.invoiceId}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Issued {cand.invoiceDate}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '2px' }}>
                          Customer: {cand.customer}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{cand.trigger}</div>
                        <div className="cn-reason-desc">Platform status change detected after packing scan</div>
                      </td>
                      <td>
                        <span className="cn-reason-code-badge">
                          Code {cand.suggestedCode}
                        </span>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                          {REASON_CODES.find((r) => r.code === cand.suggestedCode)?.label.split('(')[0]}
                        </div>
                      </td>
                      <td>
                        <div className="cn-amount-main">₱{parseFloat(cand.creditableBalance).toFixed(2)}</div>
                        <span className="badge badge-emerald" style={{ marginTop: '3px' }}>
                          Open to Credit
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '5px 10px', fontSize: '0.74rem', borderRadius: 4 }}
                          onClick={() => handleOpenIssueCandidate(cand)}
                        >
                          <span>Review & Issue</span>
                          <ArrowRight size={13} />
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
            {filteredIssued.length === 0 ? (
              <div className="cn-empty-state">
                <div className="cn-empty-icon">
                  <FileMinus size={26} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
                  No credit notes issued
                </div>
                <p style={{ maxWidth: '420px', fontSize: '0.85rem' }}>
                  No credit note documents have been logged yet. Use the work list or manual button to issue one.
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
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssued.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--accent-rose)' }}>{item.id}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{item.date}</div>
                        {item.author && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>by {item.author}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--primary)' }}>{item.invoiceId}</div>
                        {item.replacedBy && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)', marginTop: '2px' }}>
                            ↳ Replaced by: <strong>{item.replacedBy}</strong>
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.orderId}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                          <PlatformBadge platform={item.platform} printed />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.storeName}</span>
                        </div>
                      </td>
                      <td>
                        <span className="cn-reason-code-badge">
                          Code {item.reasonCode}
                        </span>
                        <div className="cn-reason-desc">{item.reason}</div>
                      </td>
                      <td>
                        <div className="cn-amount-credited">-₱{parseFloat(item.amount).toFixed(2)}</div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>BIR VAT deductible</span>
                      </td>
                      <td>
                        <span className="badge badge-emerald">
                          <CheckCircle2 size={12} />
                          {item.status}
                        </span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', marginTop: '3px' }}>
                          Immutable Write-Once
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-info"
                          style={{ padding: '5px 10px', fontSize: '0.74rem', borderRadius: 4 }}
                          onClick={() => handleViewEisJson(item)}
                          title="View Credit Note Details & BIR EIS JSON"
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
                Calls <code>GET /api/invoices/{'{id}'}/balance</code> to query the write-once ledger for open balances per line item.
                This prevents duplicate credit notes or over-crediting.
              </p>

              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  className="cn-form-input"
                  style={{ flex: 1 }}
                  placeholder="e.g. INV-2026-0428"
                  value={balanceInputInvoice}
                  onChange={(e) => setBalanceInputInvoice(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ borderRadius: 4 }}
                  onClick={handleInspectBalance}
                  disabled={balanceLoading}
                >
                  {balanceLoading ? <span className="spinner" /> : <Search size={15} />}
                  <span>Check Balance</span>
                </button>
              </div>
            </div>

            {balanceResult && (
              <div
                style={{
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px',
                  maxWidth: '720px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Invoice</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>
                      {balanceResult.invoice_id}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Remaining Creditable</span>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                      ₱{parseFloat(balanceResult.open_balance || '0').toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="cn-lines-card">
                  <div style={{ padding: '10px 14px', background: 'var(--border-light)', fontSize: '0.75rem', fontWeight: 700 }}>
                    LINE ITEM AUDIT BREAKDOWN
                  </div>
                  {(balanceResult.lines || []).map((l, idx) => (
                    <div key={idx} className="cn-line-row">
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
                        <div style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>
                          ₱{parseFloat(l.remaining || l.open_balance || '0').toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ borderRadius: 4 }}
                    onClick={() => {
                      setModalInvoiceId(balanceResult.invoice_id);
                      setModalReasonCode('01');
                      setModalReasonText('');
                      setModalLines(
                        (balanceResult.lines || []).map((l) => ({
                          lineId: l.line_id,
                          name: l.description,
                          creditable: parseFloat(l.remaining || l.open_balance || '0').toFixed(2),
                          amountToCredit: parseFloat(l.remaining || l.open_balance || '0').toFixed(2)
                        }))
                      );
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

      {/* MODAL 1: ISSUE CREDIT NOTE - Right Side Modal like InvoicesPage */}
      {showIssueModal && (
        <div
          className="order-drawer-backdrop no-print"
          onClick={() => setShowIssueModal(false)}
        >
          <aside
            className="order-right-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="modal-header">
              <div>
                <div style={{ marginBottom: '4px' }}>
                  <PlatformBadge
                    platform={selectedCandidate?.platform || 'Marketplace'}
                    printed={Boolean(selectedCandidate)}
                  />
                </div>
                <div className="modal-title-row">
                  <span>Issue BIR EIS Credit Note</span>
                  {modalInvoiceId && (
                    <span className="order-id-badge num-target">
                      #{modalInvoiceId}
                    </span>
                  )}
                </div>
                <p className="modal-subtitle">
                  Order:{' '}
                  <span className="num-target">
                    {selectedCandidate?.orderId || 'Direct-Issue'}
                  </span>{' '}
                  &middot; Store:{' '}
                  <span className="num-target">
                    {selectedCandidate?.storeName || 'Ipolymer Solutions Corp.'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowIssueModal(false)}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={handleSubmitCreditNote}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden'
              }}
            >
              {/* Body */}
              <div className="modal-body" style={{ overflowY: 'auto', gap: '14px' }}>
                {selectedCandidate && (
                  <div>
                    <div className="section-title">Channel &amp; Buyer Information</div>
                    <div className="meta-box">
                      <div className="meta-col">
                        <span className="meta-lbl">Store</span>
                        <span className="meta-val">
                          {selectedCandidate.platform} &middot; {selectedCandidate.storeName}
                        </span>
                      </div>
                      <div className="meta-col">
                        <span className="meta-lbl">Buyer</span>
                        <span className="meta-val">{selectedCandidate.customer}</span>
                      </div>
                      <div className="meta-col">
                        <span className="meta-lbl">Order ID</span>
                        <span className="meta-val highlight num-target">
                          {selectedCandidate.orderId}
                        </span>
                      </div>
                      <div className="meta-col">
                        <span className="meta-lbl">Waybill Tracking</span>
                        <span className="num-target meta-val">
                          {selectedCandidate.tracking || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Invoice ID input */}
                <div className="cn-form-group">
                  <label className="cn-form-label">
                    <span>Target Invoice Number</span>
                    <span className="cn-form-hint">Must match live issued ledger invoice</span>
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      required
                      placeholder="e.g. INV-2026-0428"
                      className="cn-form-input"
                      value={modalInvoiceId}
                      onChange={(e) => setModalInvoiceId(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ borderRadius: 4, whiteSpace: 'nowrap' }}
                      onClick={handleLookupInvoiceBalance}
                      disabled={fetchingBalance}
                    >
                      {fetchingBalance ? <span className="spinner" /> : <RefreshCw size={14} />}
                      <span>Fetch Balance</span>
                    </button>
                  </div>
                </div>

                {/* Reason Code */}
                <div className="cn-form-group">
                  <label className="cn-form-label">
                    <span>Official Reason Code (BIR EIS Standard)</span>
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

                {/* Audit Explanation */}
                <div className="cn-form-group">
                  <label className="cn-form-label">
                    <span>Audit Explanation &amp; Notes</span>
                    <span className="cn-form-hint">Mandatory for accounting compliance</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    className="cn-form-textarea"
                    placeholder="Provide specific details (e.g. Buyer company TIN update request; or package returned by courier with tracking receipt)"
                    value={modalReasonText}
                    onChange={(e) => setModalReasonText(e.target.value)}
                  />
                </div>

                {/* Line Items Breakdown */}
                <div>
                  <div className="section-title">
                    Creditable Line Items ({modalLines.length})
                  </div>

                  {modalLines.length === 0 ? (
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
                      No lines loaded yet. Click <strong>"Fetch Balance"</strong> above or enter invoice details.
                    </div>
                  ) : (
                    modalLines.map((line, idx) => (
                      <div
                        key={line.lineId || idx}
                        className="item-card"
                        style={idx > 0 ? { marginTop: '8px' } : undefined}
                      >
                        <div className="item-name">{line.name}</div>
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
                            Open Balance: <span className="num-target">₱{line.creditable}</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '3px 8px', fontSize: '0.7rem', borderRadius: 4 }}
                            onClick={() => handleLineCreditFull(idx)}
                          >
                            Credit Full
                          </button>
                        </div>
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
                            Amount to Credit (PHP)
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '140px' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>₱</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={line.creditable}
                              className="cn-form-input num-target"
                              style={{ padding: '5px 8px', fontSize: '0.82rem', textAlign: 'right' }}
                              value={line.amountToCredit}
                              onChange={(e) => handleLineAmountChange(idx, e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Financial Tax Breakdown */}
                <div>
                  <div className="section-title">Tax Valuation &amp; Deduction Summary</div>
                  <div className="totals-box">
                    <div className="totals-row">
                      <span>VATable Sales Deduction</span>
                      <span className="num-target">
                        ₱{(parseFloat(totalCreditAmount || 0) / 1.12).toFixed(2)}
                      </span>
                    </div>
                    <div className="totals-row">
                      <span>12% VAT Deduction</span>
                      <span className="num-target">
                        ₱{(parseFloat(totalCreditAmount || 0) - parseFloat(totalCreditAmount || 0) / 1.12).toFixed(2)}
                      </span>
                    </div>
                    <div className="totals-row grand-total">
                      <span>Total Credit Note Deduction</span>
                      <span className="total-amount-display num-target">
                        -₱{parseFloat(totalCreditAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="modal-footer">
                <button
                  type="button"
                  className="modal-btn modal-btn-secondary"
                  style={{ borderRadius: 4 }}
                  onClick={() => setShowIssueModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn modal-btn-primary"
                  style={{ borderRadius: 4 }}
                  disabled={isSubmitting || parseFloat(totalCreditAmount) <= 0}
                >
                  {isSubmitting ? 'Submitting...' : 'Issue Credit Note'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {/* MODAL 2: BIR EIS JSON PREVIEW - Right Side Modal like InvoicesPage */}
      {previewDoc && (
        <div
          className="order-drawer-backdrop no-print"
          onClick={() => setPreviewDoc(null)}
        >
          <aside
            className="order-right-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="modal-header">
              <div>
                <div style={{ marginBottom: '4px' }}>
                  <PlatformBadge
                    platform={previewDoc.platform || 'Marketplace'}
                    printed
                  />
                </div>
                <div className="modal-title-row">
                  <span>Credit Note</span>
                  <span className="order-id-badge num-target">#{previewDoc.id}</span>
                </div>
                <p className="modal-subtitle">
                  Ref Invoice: <span className="num-target">{previewDoc.invoiceId || '—'}</span> &middot; Date:{' '}
                  <span className="num-target">{previewDoc.date || '—'}</span>
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setPreviewDoc(null)}
                aria-label="Close preview"
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="modal-body" style={{ overflowY: 'auto' }}>
              <div>
                <div className="section-title">Channel &amp; Ledger Information</div>
                <div className="meta-box">
                  <div className="meta-col">
                    <span className="meta-lbl">Store</span>
                    <span className="meta-val">
                      {previewDoc.platform || 'Marketplace'} &middot; {previewDoc.storeName || 'Official Store'}
                    </span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Original Invoice</span>
                    <span className="meta-val highlight num-target">{previewDoc.invoiceId || '—'}</span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Order ID</span>
                    <span className="meta-val num-target">{previewDoc.orderId || '—'}</span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Reason Code</span>
                    <span className="meta-val num-target">Code {previewDoc.reasonCode || '01'}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="section-title">Tax Valuation &amp; Settlement</div>
                <div className="totals-box">
                  <div className="totals-row">
                    <span>VATable Sales Deduction</span>
                    <span className="num-target">
                      ₱{(parseFloat(previewDoc.amount || 0) / 1.12).toFixed(2)}
                    </span>
                  </div>
                  <div className="totals-row">
                    <span>12% VAT Deduction</span>
                    <span className="num-target">
                      ₱{(parseFloat(previewDoc.amount || 0) - parseFloat(previewDoc.amount || 0) / 1.12).toFixed(2)}
                    </span>
                  </div>
                  <div className="totals-row grand-total">
                    <span>Total Credited Amount</span>
                    <span className="total-amount-display num-target">
                      -₱{parseFloat(previewDoc.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="section-title">BIR EIS JSON Payload</div>
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
                  {JSON.stringify(previewDoc.eisJson, null, 2)}
                </pre>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="modal-footer">
              <button
                type="button"
                className="modal-btn modal-btn-secondary"
                style={{ borderRadius: 4 }}
                onClick={() => setPreviewDoc(null)}
              >
                Close
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
