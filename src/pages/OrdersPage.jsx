import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingBag,
  Search,
  RefreshCw,
  FileText,
  Printer,
  Calendar,
  Download,
  CheckCircle2,
  Copy,
  Check,
  Eye,
  ChevronDown,
  Gauge
} from 'lucide-react';
import {
  fetchActiveUnprintedOrders,
  fetchDocumentDetails,
  fetchOrderDraft,
  issueMissedScanOrder,
  logInvoicePrint,
  normalizeDocumentRecord,
  savePrintedInvoiceRecord,
  downloadWaybillSoftCopy,
  getExportDownloadUrl
} from '../services/scanService';
import WaybillTicket from '../components/WaybillTicket';
import PlatformBadge from '../components/PlatformBadge';
import './pages.css';

const FILTER_TABS = ['All Unprinted', "Today's Orders", 'TikTok', 'Shopee', 'Lazada'];
const ITEMS_PER_PAGE = 5;
const MAX_VISIBLE_PAGES = 5;

function getStatusBadge(status, holdReason = null) {
  const s = String(status || '').trim().toUpperCase();
  if (s === 'DUE' || s.includes('CANCEL') || s.includes('RETURN') || s.includes('BLOCK')) {
    return 'badge-rose';
  }
  if (s === 'HOLD' || s.includes('HOLD') || s.includes('UNPAID') || holdReason) {
    return 'badge-amber';
  }
  if (s === 'WAITING' || s.includes('WAIT') || s.includes('PENDING')) {
    return 'badge-info';
  }
  return 'badge-emerald';
}

function getManilaDateKey(dateValue) {
  if (!dateValue || dateValue === '—') return '';
  try {
    const str = String(dateValue).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10);
    }
    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  } catch {
    return '';
  }
}

function getTodayManilaKey() {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default function OrdersPage({ onNavigate }) {
  const [activeFilter, setActiveFilter] = useState('All Unprinted');
  const [queryInput, setQueryInput] = useState('');
  const [orders, setOrders] = useState([]);
  const [printedTrackerCount, setPrintedTrackerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchMs, setFetchMs] = useState(null);
  const [fetchCached, setFetchCached] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const queryInputRef = useRef('');
  queryInputRef.current = queryInput;
  const [actionToast, setActionToast] = useState('');
  const [copiedTracking, setCopiedTracking] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [printableOrder, setPrintableOrder] = useState(null);

  const todayKey = getTodayManilaKey();

  const showToast = useCallback((msg) => {
    setActionToast(msg);
    setTimeout(() => {
      setActionToast((prev) => (prev === msg ? '' : prev));
    }, 4500);
  }, []);

  const loadUnprintedOrders = useCallback(async (searchTerm = '', forceRefresh = false) => {
    setLoading(true);
    setErrorMsg(null);
    const start = performance.now();

    const res = await fetchActiveUnprintedOrders(searchTerm, { forceRefresh });
    setFetchMs(Math.round(performance.now() - start));
    setFetchCached(Boolean(res.cached));
    setOrders(res.unprintedOrders || []);
    setPrintedTrackerCount(res.printedCount || 0);

    if (!res.ok && res.errorMessage) {
      setErrorMsg(res.errorMessage);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    async function init() {
      const start = performance.now();
      const res = await fetchActiveUnprintedOrders('');
      if (!active) return;
      setFetchMs(Math.round(performance.now() - start));
      setFetchCached(Boolean(res.cached));
      setOrders(res.unprintedOrders || []);
      setPrintedTrackerCount(res.printedCount || 0);
      if (!res.ok && res.errorMessage) {
        setErrorMsg(res.errorMessage);
      }
      setLoading(false);
    }

    init();

    const handlePrintedUpdate = () => {
      loadUnprintedOrders(queryInputRef.current);
    };

    window.addEventListener('bir-printed-invoices-updated', handlePrintedUpdate);
    return () => {
      active = false;
      window.removeEventListener('bir-printed-invoices-updated', handlePrintedUpdate);
    };
  }, [loadUnprintedOrders]);

  const hydrateOrderDetails = useCallback(async (ord) => {
    if (!ord) return ord;
    let updated = { ...ord };

    const canFetchDoc = Boolean(ord.id && !ord.raw?._source_order_id);
    const lookupOrderId = ord.raw?._source_order_id || ord.orderId;
    const canFetchDraft =
      (!ord.lines || ord.lines.length === 0) &&
      Boolean(ord.platform && ord.storeId && lookupOrderId && lookupOrderId !== '—');

    const [docRes, draftRes] = await Promise.all([
      canFetchDoc ? fetchDocumentDetails(ord.id) : Promise.resolve(null),
      canFetchDraft
        ? fetchOrderDraft(ord.platform, ord.storeId, lookupOrderId)
        : Promise.resolve(null)
    ]);

    if (docRes?.ok && docRes.data) {
      const norm = normalizeDocumentRecord(docRes.data);
      if (norm) {
        updated = {
          ...updated,
          ...norm,
          orderId: norm.orderId !== '—' ? norm.orderId : updated.orderId,
          tracking: norm.tracking !== '—' ? norm.tracking : updated.tracking,
          lines: norm.lines?.length ? norm.lines : updated.lines
        };
      }
    }

    if (draftRes?.ok && draftRes.data) {
      const draftNorm = normalizeDocumentRecord({
        ...draftRes.data,
        order: updated.raw || updated
      });
      if (draftNorm) {
        updated = {
          ...updated,
          lines: updated.lines?.length ? updated.lines : draftNorm.lines,
          productSummary:
            draftNorm.productSummary !== '—'
              ? draftNorm.productSummary
              : updated.productSummary,
          discountAmount:
            draftNorm.discountAmount !== '0.00'
              ? draftNorm.discountAmount
              : updated.discountAmount,
          vatableSales:
            draftNorm.vatableSales !== '0.00'
              ? draftNorm.vatableSales
              : updated.vatableSales,
          vatAmount:
            draftNorm.vatAmount !== '0.00' ? draftNorm.vatAmount : updated.vatAmount,
          totalAmount:
            draftNorm.totalAmount !== '0.00'
              ? draftNorm.totalAmount
              : updated.totalAmount,
          invoiceState: draftNorm.invoiceState || updated.invoiceState,
          holdReason: draftNorm.holdReason || updated.holdReason
        };
      }
    }

    return updated;
  }, []);

  const openOrderModal = async (ord) => {
    setSelectedOrder(ord);
    setDetailError(null);
    setDetailLoading(true);

    const hydrated = await hydrateOrderDetails(ord);
    setDetailLoading(false);
    if (hydrated) {
      setSelectedOrder(hydrated);
    }
  };

  const handlePrintAndMoveToTracker = async (ord) => {
    if (!ord) return;
    const hydrated = await hydrateOrderDetails(ord);
    const target = hydrated || ord;

    let issuedDocNumber = target.documentNumber;
    let issuedDocId = target.id;

    if (
      (!issuedDocNumber || issuedDocNumber === '—') &&
      target.platform &&
      target.storeId &&
      target.orderId &&
      target.orderId !== '—'
    ) {
      const issueRes = await issueMissedScanOrder(
        target.platform,
        target.storeId,
        target.orderId
      );
      if (issueRes.ok && issueRes.data) {
        const issuedNorm = normalizeDocumentRecord(issueRes.data);
        if (issuedNorm) {
          issuedDocNumber = issuedNorm.documentNumber;
          issuedDocId = issuedNorm.id;
        }
      }
    }

    if (issuedDocId) {
      await logInvoicePrint(issuedDocId, {
        reason: null,
        note: 'Printed from Orders Module'
      });
    }

    const finalRecord = {
      ...target,
      id: issuedDocId || target.id,
      documentNumber:
        issuedDocNumber && issuedDocNumber !== '—'
          ? issuedDocNumber
          : `EINV-${target.orderId !== '—' ? target.orderId : Date.now()}`
    };

    savePrintedInvoiceRecord(finalRecord, {
      tracking: target.tracking,
      isReprint: false
    });

    setOrders((prev) =>
      prev.filter(
        (item) =>
          !(
            (target.orderId !== '—' && item.orderId === target.orderId) ||
            (target.tracking !== '—' && item.tracking === target.tracking) ||
            (target.id && item.id === target.id)
          )
      )
    );
    setPrintedTrackerCount((c) => c + 1);
    setSelectedOrder(null);
    setPrintableOrder(finalRecord);

    showToast(
      `Order #${target.orderId} printed and moved to Invoices Tracker (${finalRecord.documentNumber}).`
    );

    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleDownloadSoftCopy = async (ord) => {
    if (!ord) return;
    const hydrated = await hydrateOrderDetails(ord);
    const targetDoc = hydrated || ord;
    downloadWaybillSoftCopy(targetDoc);
    showToast(
      `Waybill soft copy downloaded (${targetDoc.documentNumber !== '—' ? targetDoc.documentNumber : targetDoc.orderId}-WAYBILL.png)`
    );
  };

  const handleCopyWaybill = (wb) => {
    if (!wb || wb === '—') return;
    navigator.clipboard?.writeText(wb);
    setCopiedTracking(wb);
    setTimeout(() => {
      setCopiedTracking((prev) => (prev === wb ? '' : prev));
    }, 1800);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    loadUnprintedOrders(queryInput);
  };

  // Determine the latest order date in the dataset in case staging DB uses a snapshot date
  const latestDatasetDateKey = orders.reduce((latest, ord) => {
    const key = getManilaDateKey(ord.orderDate || ord.issuedAt);
    return key > latest ? key : latest;
  }, '');

  const hasExactTodayOrders = orders.some(
    (ord) => getManilaDateKey(ord.orderDate || ord.issuedAt) === todayKey
  );
  const activeTodayMatchKey = hasExactTodayOrders ? todayKey : latestDatasetDateKey || todayKey;

  const filteredOrders = orders.filter((ord) => {
    if (activeFilter === "Today's Orders") {
      const ordDateKey = getManilaDateKey(ord.orderDate || ord.issuedAt);
      if (ordDateKey && ordDateKey !== activeTodayMatchKey) return false;
    } else if (activeFilter !== 'All Unprinted') {
      if (String(ord.platform || '').toLowerCase() !== activeFilter.toLowerCase()) {
        return false;
      }
    }

    const term = queryInput.trim().toLowerCase();
    if (!term) return true;

    return (
      String(ord.orderId || '').toLowerCase().includes(term) ||
      String(ord.tracking || '').toLowerCase().includes(term) ||
      String(ord.documentNumber || '').toLowerCase().includes(term) ||
      String(ord.buyerName || '').toLowerCase().includes(term) ||
      String(ord.storeName || '').toLowerCase().includes(term) ||
      String(ord.productSummary || '').toLowerCase().includes(term)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedOrders = filteredOrders.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const totalPendingAmount = filteredOrders.reduce((acc, ord) => {
    const num = parseFloat(String(ord.totalAmount || '0').replace(/[^0-9.-]+/g, ''));
    return acc + (Number.isFinite(num) ? num : 0);
  }, 0);

  const countByPlatform = (name) =>
    orders.filter((d) => String(d.platform || '').toLowerCase() === name.toLowerCase()).length;

  const getDisplayLines = (ord) => {
    if (!ord) return [];
    if (Array.isArray(ord.lines) && ord.lines.length > 0) return ord.lines;
    return [
      {
        id: 1,
        productName:
          ord.productSummary && ord.productSummary !== '—'
            ? ord.productSummary
            : `${ord.platform || 'Marketplace'} Order #${ord.orderId || '—'}`,
        sku: '',
        qty: 1,
        unitPrice: ord.totalAmount || '0.00',
        vatAmount: ord.vatAmount || '0.00',
        lineTotal: ord.totalAmount || '0.00'
      }
    ];
  };

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Daily Orders Queue</h1>
        </div>
        <div className="page-actions">
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowExportMenu((prev) => !prev)}
            >
              <Download size={15} /> Export <ChevronDown size={14} />
            </button>

            {showExportMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: '170px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '6px',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}
              >
                <a
                  href={getExportDownloadUrl('/api/documents', { printed: 0 }, 'csv')}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowExportMenu(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    textDecoration: 'none'
                  }}
                >
                  <FileText size={14} color="var(--primary)" /> CSV Export (.csv)
                </a>
                <a
                  href={getExportDownloadUrl('/api/documents', { printed: 0 }, 'xlsx')}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowExportMenu(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    textDecoration: 'none'
                  }}
                >
                  <Download size={14} color="var(--accent-emerald)" /> Excel Export (.xlsx)
                </a>
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => loadUnprintedOrders(queryInput, true)}
            disabled={loading}
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {actionToast && (
        <div
          className="no-print"
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: 'var(--accent-emerald)',
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 600,
            fontSize: '0.875rem'
          }}
        >
          <CheckCircle2 size={18} />
          <span>{actionToast}</span>
        </div>
      )}

      <div className="stats-grid no-print">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Unprinted Orders Queue</span>
            <div className="stat-card-icon-wrap">
              <ShoppingBag size={20} />
            </div>
          </div>
          <div className="stat-card-value">{filteredOrders.length}</div>
          <div className="stat-card-footer">
            <span className="trend-description">
              TikTok: {countByPlatform('TikTok')} · Shopee: {countByPlatform('Shopee')} · Lazada: {countByPlatform('Lazada')}
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Pending Orders Value</span>
            <div className="stat-card-icon-wrap">
              <FileText size={20} />
            </div>
          </div>
          <div className="stat-card-value">
            ₱{totalPendingAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-card-footer">
            <span className="trend-description">Waiting for Waybill Scan</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Printed & Moved to Tracker</span>
            <div className="stat-card-icon-wrap">
              <Printer size={20} />
            </div>
          </div>
          <div className="stat-card-value">{printedTrackerCount}</div>
          <div className="stat-card-footer">
            <span className="trend-description">In Invoices Tracker</span>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="card-section scan-alert-card scan-alert-red no-print">
          <div>{errorMsg}</div>
        </div>
      )}

      <div className="card-section no-print">
        <div className="card-section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 className="card-section-title">
              Active Unprinted Orders List
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
            <select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                height: '38px',
                padding: '0 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-app)',
                color: 'var(--text-main)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
              aria-label="Filter Orders"
            >
              {FILTER_TABS.map((tab) => (
                <option key={tab} value={tab}>
                  {tab}
                </option>
              ))}
            </select>

            <form className="orders-search-form" onSubmit={handleSearchSubmit}>
              <div className="orders-search-input-wrap">
                <Search size={15} className="orders-search-icon" />
                <input
                  type="text"
                  className="search-input"
                  style={{ paddingLeft: '34px', width: '100%' }}
                  placeholder="Search Order ID, waybill tracking, buyer..."
                  value={queryInput}
                  onChange={(e) => {
                    setQueryInput(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Search
              </button>
              {queryInput && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setQueryInput('');
                    setCurrentPage(1);
                    loadUnprintedOrders('');
                  }}
                >
                  Clear
                </button>
              )}
            </form>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Waybill / Tracking No.</th>
                <th>Platform & Store</th>
                <th>Order Date</th>
                <th>Buyer & Product Ordered</th>
                <th>12% VAT</th>
                <th>Total (PHP)</th>
                <th>Order Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                      <RefreshCw size={16} className="spinner" />
                      <span>Please wait... </span>
                    </div>
                  </td>
                </tr>
              ) : paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    All matching orders have been scanned & printed (check the Invoices Tracker module) or no unprinted orders match your filter.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((ord, idx) => {
                  const ordDateKey = getManilaDateKey(ord.orderDate || ord.issuedAt);
                  const isToday = ordDateKey === activeTodayMatchKey;

                  return (
                    <tr key={ord.id || `${ord.platform}-${ord.orderId}-${idx}`}>
                      <td>
                        <strong
                          style={{
                            fontSize: '0.88rem',
                            color: 'var(--primary)'
                          }}
                        >
                          {ord.orderId !== '—' ? ord.orderId : ord.documentNumber}
                        </strong>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {ord.documentNumber && ord.documentNumber !== '—' ? (
                            `Doc: ${ord.documentNumber}`
                          ) : (
                            <>
                              <span>State:</span>
                              <span
                                className={`badge ${getStatusBadge(ord.invoiceState || 'due', ord.holdReason)}`}
                                style={{ fontSize: '0.65rem', padding: '1px 6px' }}
                              >
                                {String(ord.invoiceState || 'due').toUpperCase()}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 700 }}>
                            {ord.tracking || '—'}
                          </span>
                          {ord.tracking && ord.tracking !== '—' && (
                            <button
                              type="button"
                              className="btn btn-outline"
                              style={{ padding: '2px 6px', fontSize: '0.68rem' }}
                              onClick={() => handleCopyWaybill(ord.tracking)}
                              title="Copy Waybill Tracking Number"
                            >
                              {copiedTracking === ord.tracking ? (
                                <Check size={11} />
                              ) : (
                                <Copy size={11} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      <td>
                        <PlatformBadge platform={ord.platform} />
                        <div style={{ fontSize: '0.76rem', marginTop: '4px', fontWeight: 600 }}>
                          {ord.storeName}
                        </div>
                      </td>

                      <td style={{ fontSize: '0.8rem' }}>
                        <div>{ord.orderDate !== '—' ? ord.orderDate : ord.issuedAt}</div>
                        {isToday && (
                          <span
                            className="badge badge-emerald"
                            style={{ fontSize: '0.65rem', padding: '1px 6px', marginTop: '3px' }}
                          >
                            TODAY
                          </span>
                        )}
                      </td>

                      <td style={{ maxWidth: '230px' }}>
                        <strong>{ord.buyerName}</strong>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {ord.productSummary !== '—'
                            ? ord.productSummary
                            : ord.lines?.length > 0
                              ? ord.lines.map((l) => `${l.productName} (x${l.qty})`).join(', ')
                              : `${ord.platform} Order Item`}
                        </div>
                      </td>

                      <td style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>
                        ₱{ord.vatAmount}
                      </td>

                      <td style={{ fontWeight: 800 }}>₱{ord.totalAmount}</td>

                      <td>
                        <span
                          className={`badge ${getStatusBadge(ord.status, ord.holdReason)}`}
                        >
                          {ord.status}
                        </span>
                        {ord.holdReason && (
                          <div
                            style={{
                              fontSize: '0.68rem',
                              color: '#d97706',
                              marginTop: '3px',
                              maxWidth: '140px'
                            }}
                          >
                            {ord.holdReason}
                          </div>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', borderRadius: 4 }}>
                          <button
                            type="button"
                            className="btn btn-info"
                            style={{ padding: '5px 8px', fontSize: '0.74rem', borderRadius: 4 }}
                            onClick={() => openOrderModal(ord)}
                            title="View Document Details & BIR EIS JSON"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '5px 10px', fontSize: '0.74rem', borderRadius: 4 }}
                            onClick={() => handlePrintAndMoveToTracker(ord)}
                            title="Print E-Invoice Waybill Ticket"
                          >
                            <Printer size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-success"
                            style={{ padding: '5px 10px', fontSize: '0.74rem', borderRadius: 4 }}
                            onClick={() => handleDownloadSoftCopy(ord)}
                            title="Download Waybill Soft Copy (PNG)"
                          >
                            <Download size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="modal-pagination-bar">
          <span className="page-subtitle">
            {filteredOrders.length === 0
              ? 'Showing 0 of 0 unprinted orders (5 per page)'
              : `Showing ${startIdx + 1}–${Math.min(startIdx + ITEMS_PER_PAGE, filteredOrders.length)} of ${filteredOrders.length} unprinted orders`}
          </span>

          <div className="modal-pagination-controls">
            <button
              type="button"
              className="btn btn-outline pagination-btn"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>

            {(() => {
              const pageGroupStart =
                Math.floor((safePage - 1) / MAX_VISIBLE_PAGES) * MAX_VISIBLE_PAGES + 1;
              const pageGroupEnd = Math.min(totalPages, pageGroupStart + MAX_VISIBLE_PAGES - 1);
              const visiblePages = Array.from(
                { length: pageGroupEnd - pageGroupStart + 1 },
                (_, i) => pageGroupStart + i
              );

              return visiblePages.map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  className={`btn pagination-btn ${pageNum === safePage ? 'btn-primary' : 'btn-outline'
                    }`}
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </button>
              ));
            })()}

            <button
              type="button"
              className="btn btn-outline pagination-btn"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Order Details Right Side Modal - Clean UI (Inter) */}
      {selectedOrder && (
        <div
          className="order-drawer-backdrop no-print"
          onClick={() => setSelectedOrder(null)}
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
                  <PlatformBadge platform={selectedOrder.platform} />
                </div>
                <div className="modal-title-row">
                  <span>Order</span>
                  <span className="order-id-badge num-target">
                    #{selectedOrder.orderId !== '—' ? selectedOrder.orderId : selectedOrder.documentNumber}
                  </span>
                </div>
                <p className="modal-subtitle">
                  Waybill: <span className="num-target">{selectedOrder.tracking}</span> &middot; Date:{' '}
                  <span className="num-target">
                    {selectedOrder.orderDate !== '—' ? selectedOrder.orderDate : selectedOrder.issuedAt}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setSelectedOrder(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="modal-body">
              {detailLoading && (
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                  Loading complete order draft & product items...
                </p>
              )}

              {detailError && (
                <p style={{ color: '#e11d48', margin: 0, fontSize: '0.75rem' }}>
                  {detailError}
                </p>
              )}

              {/* Metadata */}
              <div>
                <div className="section-title">Channel &amp; Buyer Information</div>
                <div className="meta-box">
                  <div className="meta-col">
                    <span className="meta-lbl">Store</span>
                    <span className="meta-val">
                      {selectedOrder.platform} &middot; {selectedOrder.storeName}
                    </span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Buyer</span>
                    <span className="meta-val">{selectedOrder.buyerName}</span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Order ID</span>
                    <span className="meta-val highlight num-target">{selectedOrder.orderId}</span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Waybill Tracking</span>
                    <span className="meta-val num-target">{selectedOrder.tracking}</span>
                  </div>
                </div>
              </div>

              {/* Item Card */}
              <div>
                <div className="section-title">
                  Product Ordered by Customer ({getDisplayLines(selectedOrder).length})
                </div>
                {getDisplayLines(selectedOrder).map((line, i) => (
                  <div
                    key={line.id || i}
                    className="item-card"
                    style={i > 0 ? { marginTop: '8px' } : undefined}
                  >
                    <div className="item-name">{line.productName}</div>

                    {line.sku && (
                      <div>
                        <div className="sku-pill">
                          SKU: <span className="num-target">{line.sku}</span>
                        </div>
                      </div>
                    )}

                    <table className="item-table">
                      <thead>
                        <tr>
                          <th style={{ width: '15%' }}>Qty</th>
                          <th>Unit Price</th>
                          <th>12% VAT</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="num-target" style={{ fontWeight: 700 }}>
                            {line.qty}
                          </td>
                          <td className="num-target">₱{line.unitPrice}</td>
                          <td className="num-target">₱{line.vatAmount}</td>
                          <td className="num-target" style={{ fontWeight: 700 }}>
                            ₱{line.lineTotal}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              {/* Financial Tax Breakdown */}
              <div>
                <div className="section-title">Tax Valuation &amp; Settlement</div>
                <div className="totals-box">
                  <div className="totals-row discount">
                    <span>Discount / Voucher</span>
                    <span className="num-target">-₱{selectedOrder.discountAmount || '0.00'}</span>
                  </div>
                  <div className="totals-row">
                    <span>VATable Sales (Net of VAT)</span>
                    <span className="num-target">₱{selectedOrder.vatableSales}</span>
                  </div>
                  <div className="totals-row">
                    <span>12% VAT Amount</span>
                    <span className="num-target">₱{selectedOrder.vatAmount}</span>
                  </div>
                  <div className="totals-row grand-total">
                    <span>Total Amount (VAT Inc.)</span>
                    <span className="total-amount-display num-target">
                      ₱{selectedOrder.totalAmount}
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
                onClick={() => setSelectedOrder(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                onClick={() => handlePrintAndMoveToTracker(selectedOrder)}
              >
                Print E-Invoice &amp; Move to Tracker
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Hidden Printable 100x150mm Waybill Slip */}
      {printableOrder && (
        <div id="bir-printable-invoice-slip" className="print-only-slip">
          <WaybillTicket
            platform={printableOrder.platform || 'Marketplace'}
            storeName={printableOrder.storeName || 'Official Store'}
            copyTag="ORIGINAL"
            invoiceNumber={printableOrder.documentNumber || 'PENDING'}
            issuedAt={printableOrder.issuedAt || printableOrder.orderDate || ''}
            orderId={printableOrder.orderId || '—'}
            buyerName={printableOrder.buyerName || 'Marketplace Buyer'}
            buyerTin={printableOrder.buyerTin || '—'}
            orderStatus={printableOrder.status || 'PAID'}
            lines={getDisplayLines(printableOrder)}
            discountAmount={printableOrder.discountAmount || '0.00'}
            vatableSales={printableOrder.vatableSales || '0.00'}
            vatAmount={printableOrder.vatAmount || '0.00'}
            vatExemptSales={printableOrder.vatExemptSales || '0.00'}
            zeroRatedSales={printableOrder.zeroRatedSales || '0.00'}
            totalAmount={printableOrder.totalAmount || '0.00'}
          />
        </div>
      )}
    </div>
  );
}
