import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag,
  Search,
  RefreshCw,
  FileText,
  Printer,
  Package,
  Calendar,
  Download,
  CheckCircle2,
  Copy,
  Check,
  X
} from 'lucide-react';
import {
  fetchActiveUnprintedOrders,
  fetchDocumentDetails,
  fetchOrderDraft,
  issueMissedScanOrder,
  logInvoicePrint,
  normalizeDocumentRecord,
  savePrintedInvoiceRecord,
  getExportDownloadUrl
} from '../services/scanService';
import WaybillTicket from '../components/WaybillTicket';
import './pages.css';

const FILTER_TABS = ['All Unprinted', "Today's Orders", 'TikTok', 'Shopee', 'Lazada'];
const ITEMS_PER_PAGE = 10;

function getPlatformBadge(platform) {
  const p = String(platform || '').toLowerCase();
  if (p.includes('tiktok')) return 'badge-primary';
  if (p.includes('shopee')) return 'badge-amber';
  if (p.includes('lazada')) return 'badge-emerald';
  return 'badge-primary';
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

export default function OrdersPage() {
  const [activeFilter, setActiveFilter] = useState('All Unprinted');
  const [queryInput, setQueryInput] = useState('');
  const [orders, setOrders] = useState([]);
  const [printedTrackerCount, setPrintedTrackerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [actionToast, setActionToast] = useState('');
  const [copiedTracking, setCopiedTracking] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

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

  const loadUnprintedOrders = useCallback(async (searchTerm = '') => {
    setLoading(true);
    setErrorMsg(null);

    const res = await fetchActiveUnprintedOrders(searchTerm);
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
      const res = await fetchActiveUnprintedOrders('');
      if (!active) return;
      setOrders(res.unprintedOrders || []);
      setPrintedTrackerCount(res.printedCount || 0);
      if (!res.ok && res.errorMessage) {
        setErrorMsg(res.errorMessage);
      }
      setLoading(false);
    }

    init();

    const handlePrintedUpdate = () => {
      loadUnprintedOrders(queryInput);
    };

    window.addEventListener('bir-printed-invoices-updated', handlePrintedUpdate);
    return () => {
      active = false;
      window.removeEventListener('bir-printed-invoices-updated', handlePrintedUpdate);
    };
  }, [loadUnprintedOrders, queryInput]);

  const hydrateOrderDetails = useCallback(async (ord) => {
    if (!ord) return ord;
    let updated = { ...ord };

    if (ord.id) {
      const docRes = await fetchDocumentDetails(ord.id);
      if (docRes.ok && docRes.data) {
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
    }

    if (
      (!updated.lines || updated.lines.length === 0) &&
      updated.platform &&
      updated.storeId &&
      updated.orderId &&
      updated.orderId !== '—'
    ) {
      const draftRes = await fetchOrderDraft(
        updated.platform,
        updated.storeId,
        updated.orderId
      );
      if (draftRes.ok && draftRes.data) {
        const draftNorm = normalizeDocumentRecord({
          ...draftRes.data,
          order: updated.raw || updated
        });
        if (draftNorm) {
          updated = {
            ...updated,
            lines: draftNorm.lines?.length ? draftNorm.lines : updated.lines,
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
          <h1 className="page-title">Daily Orders Queue (Unprinted)</h1>
          <p className="page-subtitle">
            Live marketplace orders from TikTok, Shopee, and Lazada waiting to be scanned & printed. Once scanned and printed, the order automatically moves to the Invoices Tracker.
          </p>
        </div>
        <div className="page-actions">
          <a
            href={getExportDownloadUrl('/api/documents', { printed: 0 }, 'csv')}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline"
            style={{ textDecoration: 'none' }}
          >
            <Download size={15} /> CSV Export
          </a>
          <a
            href={getExportDownloadUrl('/api/documents', { printed: 0 }, 'xlsx')}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline"
            style={{ textDecoration: 'none' }}
          >
            <Download size={15} /> Excel Export
          </a>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => loadUnprintedOrders(queryInput)}
            disabled={loading}
          >
            <RefreshCw size={15} /> Refresh Orders
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
            <span className="badge badge-amber">Waiting for Waybill Scan</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Printed & Moved to Tracker</span>
            <div
              className="stat-card-icon-wrap"
              style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}
            >
              <Printer size={20} />
            </div>
          </div>
          <div className="stat-card-value">{printedTrackerCount}</div>
          <div className="stat-card-footer">
            <span className="badge badge-emerald">In Invoices Tracker</span>
          </div>
        </div>
      </div>

      <div className="orders-toolbar no-print">
        <div className="filter-tabs" style={{ margin: 0 }}>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`filter-tab ${activeFilter === tab ? 'active' : ''}`}
              onClick={() => {
                setActiveFilter(tab);
                setCurrentPage(1);
              }}
            >
              {tab}
            </button>
          ))}
        </div>

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

      {errorMsg && (
        <div className="card-section scan-alert-card scan-alert-red no-print">
          <div>{errorMsg}</div>
        </div>
      )}

      <div className="card-section no-print">
        <div className="card-section-header">
          <div>
            <h2 className="card-section-title">
              <Calendar size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
              Active Unprinted Orders List
            </h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Scan the order&apos;s waybill barcode in Packing Scan Station (or click Print Waybill) to print the E-Invoice and automatically move it to the Invoices Tracker.
            </div>
          </div>
          <span className="badge badge-primary">Live API Sync</span>
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
                    Loading live marketplace orders from server...
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
                            fontFamily: 'monospace',
                            fontSize: '0.9rem',
                            color: 'var(--primary)'
                          }}
                        >
                          {ord.orderId !== '—' ? ord.orderId : ord.documentNumber}
                        </strong>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {ord.documentNumber && ord.documentNumber !== '—'
                            ? `Doc: ${ord.documentNumber}`
                            : `State: ${String(ord.invoiceState || 'due').toUpperCase()}`}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
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
                        <span className={`badge ${getPlatformBadge(ord.platform)}`}>
                          {ord.platform}
                        </span>
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
                          className={`badge ${
                            ord.holdReason ? 'badge-amber' : 'badge-emerald'
                          }`}
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
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                            onClick={() => handlePrintAndMoveToTracker(ord)}
                            title="Print E-Invoice Waybill & Move to Invoices Tracker"
                          >
                            <Printer size={13} /> Print Waybill
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                            onClick={() => openOrderModal(ord)}
                          >
                            Details
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
              ? 'Showing 0 of 0 unprinted orders (10 per page)'
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

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                className={`btn pagination-btn ${
                  pageNum === safePage ? 'btn-primary' : 'btn-outline'
                }`}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </button>
            ))}

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

      {/* Order Details Modal */}
      {selectedOrder && (
        <div
          className="scan-modal-backdrop no-print"
          onClick={() => setSelectedOrder(null)}
        >
          <div className="doc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="doc-modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`badge ${getPlatformBadge(selectedOrder.platform)}`}>
                    {selectedOrder.platform}
                  </span>
                  <span className="badge badge-emerald">{selectedOrder.status}</span>
                </div>
                <h2
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    marginTop: '8px',
                    fontFamily: 'monospace'
                  }}
                >
                  Order #{selectedOrder.orderId !== '—' ? selectedOrder.orderId : selectedOrder.documentNumber}
                </h2>
                <div className="page-subtitle">
                  Waybill: {selectedOrder.tracking} · Date: {selectedOrder.orderDate !== '—' ? selectedOrder.orderDate : selectedOrder.issuedAt}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  onClick={() => handlePrintAndMoveToTracker(selectedOrder)}
                >
                  <Printer size={14} /> Print E-Invoice & Move to Tracker
                </button>
                <button
                  type="button"
                  className="scan-modal-close"
                  style={{ position: 'static' }}
                  onClick={() => setSelectedOrder(null)}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {detailLoading && (
              <p className="page-subtitle" style={{ marginBottom: '12px' }}>
                Loading complete order draft & product items...
              </p>
            )}

            {detailError && (
              <p style={{ color: '#e11d48', marginBottom: '12px', fontSize: '0.85rem' }}>
                {detailError}
              </p>
            )}

            <div className="order-summary-grid">
              <div>
                <div className="order-field-label">Store</div>
                <div className="order-field-val">
                  {selectedOrder.platform} · {selectedOrder.storeName}
                </div>
              </div>
              <div>
                <div className="order-field-label">Order ID</div>
                <div className="order-field-val" style={{ fontFamily: 'monospace' }}>
                  {selectedOrder.orderId}
                </div>
              </div>
              <div>
                <div className="order-field-label">Waybill Tracking</div>
                <div className="order-field-val" style={{ fontFamily: 'monospace' }}>
                  {selectedOrder.tracking}
                </div>
              </div>
              <div>
                <div className="order-field-label">Buyer</div>
                <div className="order-field-val">{selectedOrder.buyerName}</div>
              </div>
              <div>
                <div className="order-field-label">Discount / Voucher</div>
                <div className="order-field-val">-₱{selectedOrder.discountAmount || '0.00'}</div>
              </div>
              <div>
                <div className="order-field-label">VATable Sales (Net)</div>
                <div className="order-field-val">₱{selectedOrder.vatableSales}</div>
              </div>
              <div>
                <div className="order-field-label">12% VAT Amount</div>
                <div className="order-field-val" style={{ color: 'var(--accent-emerald)' }}>
                  ₱{selectedOrder.vatAmount}
                </div>
              </div>
              <div>
                <div className="order-field-label">Total Amount (VAT Inc.)</div>
                <div className="order-field-val" style={{ color: 'var(--primary)' }}>
                  ₱{selectedOrder.totalAmount}
                </div>
              </div>
            </div>

            <div className="doc-section-block">
              <div className="doc-section-heading">
                <Package size={15} /> Product Ordered by Customer ({getDisplayLines(selectedOrder).length})
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product / SKU</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>12% VAT</th>
                      <th>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getDisplayLines(selectedOrder).map((line, i) => (
                      <tr key={line.id || i}>
                        <td>
                          <strong>{line.productName}</strong>
                          {line.sku && (
                            <div
                              style={{
                                fontSize: '0.72rem',
                                color: 'var(--text-muted)',
                                fontFamily: 'monospace'
                              }}
                            >
                              SKU: {line.sku}
                            </div>
                          )}
                        </td>
                        <td>{line.qty}</td>
                        <td>₱{line.unitPrice}</td>
                        <td>₱{line.vatAmount}</td>
                        <td style={{ fontWeight: 700 }}>₱{line.lineTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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
