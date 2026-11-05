import React, { useState, useEffect, useCallback } from 'react';
import {
  Printer,
  Download,
  Search,
  RefreshCw,
  CheckCircle2,
  FileText,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchPrintedInvoices,
  fetchDocumentsRegister,
  searchDocuments,
  fetchDocumentDetails,
  fetchOrderDraft,
  logInvoicePrint,
  extractDocumentList,
  normalizeDocumentRecord,
  normalizeReprintReasons,
  getPrintedInvoiceRecords,
  savePrintedInvoiceRecord,
  downloadWaybillSoftCopy,
  getExportDownloadUrl
} from '../services/scanService';
import WaybillTicket from '../components/WaybillTicket';
import './pages.css';

const FILTER_TABS = ['All', 'TikTok', 'Shopee', 'Lazada', 'Reprinted'];
const ITEMS_PER_PAGE = 10;

function getPlatformBadge(platform) {
  const p = String(platform || '').toLowerCase();
  if (p.includes('tiktok')) return 'badge-primary';
  if (p.includes('shopee')) return 'badge-amber';
  if (p.includes('lazada')) return 'badge-emerald';
  return 'badge-primary';
}

function mergePrintedAndApiDocs(localPrinted, apiDocs) {
  const map = new Map();

  for (const item of localPrinted) {
    if (!item) continue;
    const key = String(item.id || item.documentNumber || item.orderId || Math.random());
    map.set(key, {
      ...item,
      printCount: Number(item.printCount || item.prints?.length || 1),
      isReprint: Boolean(item.isReprint || (item.printCount || item.prints?.length || 0) > 1)
    });
  }

  for (const doc of apiDocs) {
    if (!doc) continue;
    const matchKey =
      Array.from(map.keys()).find((k) => {
        const existing = map.get(k);
        return (
          (doc.id && existing.id && String(doc.id) === String(existing.id)) ||
          (doc.documentNumber &&
            doc.documentNumber !== '—' &&
            existing.documentNumber === doc.documentNumber)
        );
      }) || String(doc.id || doc.documentNumber || doc.orderId);

    const existing = map.get(matchKey);
    const apiPrintCount = Math.max(
      Number(doc.printCount || 0),
      Array.isArray(doc.prints) ? doc.prints.length : 0
    );

    if (existing) {
      const mergedCount = Math.max(Number(existing.printCount || 1), apiPrintCount, 1);
      map.set(matchKey, {
        ...doc,
        ...existing,
        lines: existing.lines?.length ? existing.lines : doc.lines,
        prints: doc.prints?.length ? doc.prints : existing.prints,
        printCount: mergedCount,
        reprintCount: Math.max(Number(doc.reprintCount || 0), mergedCount - 1, 0),
        isReprint: Boolean(doc.isReprint || existing.isReprint || mergedCount > 1),
        lastPrintedAt:
          doc.lastPrintedAt ||
          existing.lastPrintedAt ||
          doc.prints?.[0]?.printed_at ||
          doc.issuedAt ||
          '—',
        lastReprintReason: doc.lastReprintReason || existing.lastReprintReason || null
      });
    } else {
      map.set(matchKey, {
        ...doc,
        lastPrintedAt:
          doc.lastPrintedAt ||
          doc.prints?.[0]?.printed_at ||
          doc.prints?.[0]?.created_at ||
          doc.issuedAt ||
          '—',
        printCount: Math.max(apiPrintCount, 1),
        reprintCount: Math.max(Number(doc.reprintCount || 0), apiPrintCount - 1, 0),
        isReprint: Boolean(doc.isReprint || apiPrintCount > 1)
      });
    }
  }

  return Array.from(map.values());
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const reprintReasons = normalizeReprintReasons(user?.reprintReasons);

  const [invoices, setInvoices] = useState(() => getPrintedInvoiceRecords());
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [notificationMsg, setNotificationMsg] = useState('');

  const [reprintModalDoc, setReprintModalDoc] = useState(null);
  const [selectedReason, setSelectedReason] = useState(
    reprintReasons[0]?.code || 'damaged'
  );
  const [reprintNote, setReprintNote] = useState('');
  const [reprintLoading, setReprintLoading] = useState(false);

  const [printableDoc, setPrintableDoc] = useState(null);

  const showToast = useCallback((msg) => {
    setNotificationMsg(msg);
    setTimeout(() => {
      setNotificationMsg((prev) => (prev === msg ? '' : prev));
    }, 4500);
  }, []);

  const hydrateFullDoc = useCallback(async (doc) => {
    if (!doc) return doc;
    let updated = { ...doc };

    if (doc.id) {
      const detailRes = await fetchDocumentDetails(doc.id);
      if (detailRes.ok && detailRes.data) {
        const norm = normalizeDocumentRecord(detailRes.data);
        if (norm) {
          updated = {
            ...updated,
            ...norm,
            tracking:
              norm.tracking && norm.tracking !== '—' ? norm.tracking : updated.tracking,
            lines: norm.lines?.length ? norm.lines : updated.lines
          };
        }
      }
    }

    if ((!updated.lines || updated.lines.length === 0) && updated.platform && updated.storeId && updated.orderId && updated.orderId !== '—') {
      const draftRes = await fetchOrderDraft(updated.platform, updated.storeId, updated.orderId);
      if (draftRes.ok && draftRes.data) {
        const draftNorm = normalizeDocumentRecord(draftRes.data);
        if (draftNorm && draftNorm.lines?.length) {
          updated = {
            ...updated,
            lines: draftNorm.lines,
            productSummary:
              updated.productSummary !== '—' ? updated.productSummary : draftNorm.productSummary,
            discountAmount:
              updated.discountAmount !== '0.00' ? updated.discountAmount : draftNorm.discountAmount,
            vatableSales:
              updated.vatableSales !== '0.00' ? updated.vatableSales : draftNorm.vatableSales,
            vatAmount:
              updated.vatAmount !== '0.00' ? updated.vatAmount : draftNorm.vatAmount
          };
        }
      }
    }

    return updated;
  }, []);

  const loadPrintedInvoices = useCallback(async (q = '') => {
    setLoading(true);
    const localList = getPrintedInvoiceRecords();
    const trimmed = q.trim();

    let apiNormalized = [];
    const printsRes = await fetchPrintedInvoices(trimmed ? { q: trimmed } : {});
    if (printsRes.ok && printsRes.data) {
      const rawList = extractDocumentList(printsRes.data);
      apiNormalized = rawList.map(normalizeDocumentRecord).filter(Boolean);
    }

    if (apiNormalized.length === 0) {
      const fallbackRes = trimmed
        ? await searchDocuments(trimmed)
        : await fetchDocumentsRegister({ printed: 1 });
      if (fallbackRes.ok && fallbackRes.data) {
        const rawList = extractDocumentList(fallbackRes.data);
        apiNormalized = rawList.map(normalizeDocumentRecord).filter(Boolean);
      }
    }

    const merged = mergePrintedAndApiDocs(
      trimmed
        ? localList.filter((item) => {
            const term = trimmed.toLowerCase();
            return (
              String(item.documentNumber || '').toLowerCase().includes(term) ||
              String(item.orderId || '').toLowerCase().includes(term) ||
              String(item.tracking || '').toLowerCase().includes(term) ||
              String(item.buyerName || '').toLowerCase().includes(term)
            );
          })
        : localList,
      apiNormalized
    );

    setInvoices(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    async function init() {
      const localList = getPrintedInvoiceRecords();
      let apiNormalized = [];

      const printsRes = await fetchPrintedInvoices({});
      if (!active) return;

      if (printsRes.ok && printsRes.data) {
        const rawList = extractDocumentList(printsRes.data);
        apiNormalized = rawList.map(normalizeDocumentRecord).filter(Boolean);
      }

      if (apiNormalized.length === 0) {
        const regRes = await fetchDocumentsRegister({ printed: 1 });
        if (!active) return;
        if (regRes.ok && regRes.data) {
          const rawList = extractDocumentList(regRes.data);
          apiNormalized = rawList.map(normalizeDocumentRecord).filter(Boolean);
        }
      }

      const merged = mergePrintedAndApiDocs(localList, apiNormalized);
      setInvoices(merged);
      setLoading(false);
    }

    init();

    const handlePrintedUpdate = () => {
      setInvoices((prev) => mergePrintedAndApiDocs(getPrintedInvoiceRecords(), prev));
    };

    window.addEventListener('bir-printed-invoices-updated', handlePrintedUpdate);
    return () => {
      active = false;
      window.removeEventListener('bir-printed-invoices-updated', handlePrintedUpdate);
    };
  }, []);

  const openReprintModal = async (inv) => {
    setSelectedReason(reprintReasons[0]?.code || 'damaged');
    setReprintNote('');
    setReprintModalDoc(inv);

    const hydrated = await hydrateFullDoc(inv);
    if (hydrated) {
      setReprintModalDoc(hydrated);
    }
  };

  const handleConfirmReprint = async () => {
    if (!reprintModalDoc) return;
    setReprintLoading(true);

    const hydrated = await hydrateFullDoc(reprintModalDoc);
    const targetDoc = hydrated || reprintModalDoc;
    const docId = targetDoc.id || targetDoc.documentNumber;

    if (docId && docId !== '—') {
      await logInvoicePrint(docId, {
        reason: selectedReason,
        note: reprintNote.trim() || 'Reprinted from E-Invoice Management Portal'
      });
    }

    const updatedLocal = savePrintedInvoiceRecord(targetDoc, {
      tracking: targetDoc.tracking,
      isReprint: true,
      reprintReason: selectedReason
    });

    setInvoices((prev) => mergePrintedAndApiDocs(updatedLocal, prev));
    setPrintableDoc({
      ...targetDoc,
      isReprint: true
    });
    setReprintLoading(false);
    setReprintModalDoc(null);

    showToast(
      `Reprinting E-Invoice ${targetDoc.documentNumber} (Reason: ${selectedReason.replace(/_/g, ' ')})...`
    );

    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleDownloadSoftCopy = async (inv) => {
    const hydrated = await hydrateFullDoc(inv);
    const targetDoc = hydrated || inv;
    downloadWaybillSoftCopy(targetDoc);
    showToast(`Downloaded soft copy for E-Invoice ${targetDoc.documentNumber}.`);
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesTab =
      activeFilter === 'All'
        ? true
        : activeFilter === 'Reprinted'
          ? Boolean(inv.isReprint || (inv.printCount || 0) > 1)
          : String(inv.platform || '').toLowerCase() === activeFilter.toLowerCase();

    if (!matchesTab) return false;

    const term = searchQuery.trim().toLowerCase();
    if (!term) return true;

    return (
      String(inv.documentNumber || '').toLowerCase().includes(term) ||
      String(inv.orderId || '').toLowerCase().includes(term) ||
      String(inv.tracking || '').toLowerCase().includes(term) ||
      String(inv.buyerName || '').toLowerCase().includes(term) ||
      String(inv.productSummary || '').toLowerCase().includes(term)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedInvoices = filteredInvoices.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const totalPrintedValue = filteredInvoices.reduce((sum, inv) => {
    const num = parseFloat(String(inv.totalAmount || '0').replace(/[^0-9.-]+/g, ''));
    return sum + (Number.isFinite(num) ? num : 0);
  }, 0);

  const totalVatValue = filteredInvoices.reduce((sum, inv) => {
    const num = parseFloat(String(inv.vatAmount || '0').replace(/[^0-9.-]+/g, ''));
    return sum + (Number.isFinite(num) ? num : 0);
  }, 0);

  const reprintedCount = filteredInvoices.filter(
    (inv) => inv.isReprint || (inv.printCount || 0) > 1
  ).length;

  const getDisplayLines = (doc) => {
    if (!doc) return [];
    if (Array.isArray(doc.lines) && doc.lines.length > 0) return doc.lines;
    return [
      {
        id: 1,
        productName:
          doc.productSummary && doc.productSummary !== '—'
            ? doc.productSummary
            : `${doc.platform || 'Marketplace'} Order #${doc.orderId || '—'}`,
        sku: '',
        qty: 1,
        unitPrice: doc.totalAmount || '0.00',
        vatAmount: doc.vatAmount || '0.00',
        lineTotal: doc.totalAmount || '0.00'
      }
    ];
  };

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">E-Invoice Management Portal</h1>
          <p className="page-subtitle">
            List of scanned and printed BIR E-Invoices with options to reprint waybills or download soft copies.
          </p>
        </div>
        <div className="page-actions">
          <a
            href={getExportDownloadUrl('/api/documents', { printed: 1 }, 'csv')}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline"
            style={{ textDecoration: 'none' }}
          >
            <Download size={15} /> CSV Export
          </a>
          <a
            href={getExportDownloadUrl('/api/documents', { printed: 1 }, 'xlsx')}
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
            onClick={() => loadPrintedInvoices(searchQuery)}
            disabled={loading}
          >
            <RefreshCw size={15} /> Refresh List
          </button>
        </div>
      </div>

      {notificationMsg && (
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
          <span>{notificationMsg}</span>
        </div>
      )}

      <div className="stats-grid no-print">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total E-Invoices Printed</span>
            <div
              className="stat-card-icon-wrap"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}
            >
              <Printer size={20} />
            </div>
          </div>
          <div className="stat-card-value">
            ₱{totalPrintedValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-card-footer">
            <span className="badge badge-primary">{filteredInvoices.length} Printed</span>
            <span className="trend-description">from Packing Scan Station</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">12% Output VAT Total</span>
            <div
              className="stat-card-icon-wrap"
              style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}
            >
              <FileText size={20} />
            </div>
          </div>
          <div className="stat-card-value">
            ₱{totalVatValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-card-footer">
            <span className="badge badge-emerald">12% VAT Included</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Reprinted E-Invoices</span>
            <div
              className="stat-card-icon-wrap"
              style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}
            >
              <RefreshCw size={20} />
            </div>
          </div>
          <div className="stat-card-value">{reprintedCount}</div>
          <div className="stat-card-footer">
            <span className="trend-description">Audited reprint logs</span>
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

        <form
          className="orders-search-form"
          onSubmit={(e) => {
            e.preventDefault();
            setCurrentPage(1);
            loadPrintedInvoices(searchQuery);
          }}
        >
          <div className="orders-search-input-wrap">
            <Search size={15} className="orders-search-icon" />
            <input
              type="text"
              className="search-input"
              style={{ paddingLeft: '34px', width: '100%' }}
              placeholder="Search invoice #, order ID, waybill..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            Search
          </button>
        </form>
      </div>

      <div className="card-section no-print">
        <div className="card-section-header">
          <div>
            <h2 className="card-section-title">Printed E-Invoices Tracker</h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              All E-Invoices printed after waybill scan. Use Print Again if a thermal print was damaged or jammed, or download a Soft Copy.
            </div>
          </div>
          <span className="badge badge-emerald">100×150mm Waybill Ready</span>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Platform & Store</th>
                <th>Order ID / Waybill</th>
                <th>Buyer & Product Ordered</th>
                <th>Date Printed</th>
                <th>Discount & 12% VAT</th>
                <th>Amount (PHP)</th>
                <th>Print Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    Loading printed E-Invoices...
                  </td>
                </tr>
              ) : paginatedInvoices.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No printed E-Invoices found. Scan and print a waybill in Packing Scan Station to see it here.
                  </td>
                </tr>
              ) : (
                paginatedInvoices.map((inv, idx) => (
                  <tr key={inv.id || inv.documentNumber || idx}>
                    <td>
                      <strong style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>
                        {inv.documentNumber}
                      </strong>
                      {inv.id && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Doc #{inv.id}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${getPlatformBadge(inv.platform)}`}>
                        {inv.platform || 'Marketplace'}
                      </span>
                      <div style={{ fontSize: '0.76rem', marginTop: '4px', fontWeight: 600 }}>
                        {inv.storeName || 'Official Store'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {inv.orderId || '—'}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        WB: {inv.tracking || '—'}
                      </div>
                    </td>
                    <td style={{ maxWidth: '230px' }}>
                      <strong>{inv.buyerName || 'Marketplace Buyer'}</strong>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {inv.productSummary && inv.productSummary !== '—'
                          ? inv.productSummary
                          : inv.lines?.length > 0
                            ? inv.lines.map((l) => `${l.productName} (x${l.qty})`).join(', ')
                            : `${inv.platform || 'Marketplace'} Order Item`}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <div>{inv.lastPrintedAt || inv.issuedAt || '—'}</div>
                      {inv.lastStationCode && inv.lastStationCode !== '—' && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Station: {inv.lastStationCode}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>
                      <div>
                        Disc: <strong>-₱{inv.discountAmount || '0.00'}</strong>
                      </div>
                      <div style={{ color: 'var(--accent-emerald)' }}>
                        VAT: <strong>₱{inv.vatAmount || '0.00'}</strong>
                      </div>
                    </td>
                    <td style={{ fontWeight: 800, fontSize: '0.925rem' }}>
                      ₱{inv.totalAmount || '0.00'}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          inv.isReprint || (inv.printCount || 1) > 1
                            ? 'badge-amber'
                            : 'badge-emerald'
                        }`}
                      >
                        {inv.isReprint || (inv.printCount || 1) > 1 ? 'REPRINTED' : 'ORIGINAL'}
                      </span>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                        {inv.printCount || 1}x Printed
                      </div>
                      {inv.lastReprintReason && (
                        <div style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: '2px' }}>
                          Reason: {inv.lastReprintReason}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                          onClick={() => openReprintModal(inv)}
                          title="Print E-Invoice Waybill Again"
                        >
                          <Printer size={13} /> Print Again
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                          onClick={() => handleDownloadSoftCopy(inv)}
                          title="Download Waybill Soft Copy (PNG)"
                        >
                          <Download size={13} /> Soft Copy
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="modal-pagination-bar">
          <span className="page-subtitle">
            {filteredInvoices.length === 0
              ? 'Showing 0 of 0 E-Invoices (10 per page)'
              : `Showing ${startIdx + 1}–${Math.min(startIdx + ITEMS_PER_PAGE, filteredInvoices.length)} of ${filteredInvoices.length} E-Invoices`}
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

      {/* Reprint & Preview Modal */}
      {reprintModalDoc && (
        <div
          className="scan-modal-backdrop no-print"
          onClick={() => !reprintLoading && setReprintModalDoc(null)}
        >
          <div
            className="doc-modal-card"
            style={{ maxWidth: '820px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="doc-modal-header">
              <div>
                <h2 className="card-section-title" style={{ fontSize: '1.15rem' }}>
                  <Printer size={17} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                  Reprint E-Invoice Waybill ({reprintModalDoc.documentNumber})
                </h2>
                <p className="page-subtitle">
                  Preview the 100×150mm waybill layout and select a reason before reprinting or downloading a soft copy.
                </p>
              </div>
              <button
                type="button"
                className="scan-modal-close"
                style={{ position: 'static' }}
                onClick={() => setReprintModalDoc(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="cards-grid-2" style={{ alignItems: 'start', marginBottom: 0 }}>
              <div>
                <WaybillTicket
                  platform={reprintModalDoc.platform || 'Marketplace'}
                  storeName={reprintModalDoc.storeName || 'Official Store'}
                  copyTag="REPRINT"
                  invoiceNumber={reprintModalDoc.documentNumber}
                  issuedAt={reprintModalDoc.issuedAt || reprintModalDoc.lastPrintedAt || ''}
                  orderId={reprintModalDoc.orderId || '—'}
                  buyerName={reprintModalDoc.buyerName || 'Marketplace Buyer'}
                  buyerTin={reprintModalDoc.buyerTin || '—'}
                  orderStatus={reprintModalDoc.status || 'PAID'}
                  lines={getDisplayLines(reprintModalDoc)}
                  discountAmount={reprintModalDoc.discountAmount || '0.00'}
                  vatableSales={reprintModalDoc.vatableSales || '0.00'}
                  vatAmount={reprintModalDoc.vatAmount || '0.00'}
                  vatExemptSales={reprintModalDoc.vatExemptSales || '0.00'}
                  zeroRatedSales={reprintModalDoc.zeroRatedSales || '0.00'}
                  totalAmount={reprintModalDoc.totalAmount || '0.00'}
                />
              </div>

              <div className="card-section" style={{ marginBottom: 0 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px' }}>
                  Reprint Options
                </h3>

                <div style={{ marginBottom: '14px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      marginBottom: '6px'
                    }}
                  >
                    Reason for Reprinting *
                  </label>
                  <select
                    value={selectedReason}
                    onChange={(e) => setSelectedReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-app)',
                      color: 'var(--text-main)',
                      fontWeight: 600
                    }}
                  >
                    {reprintReasons.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      marginBottom: '6px'
                    }}
                  >
                    Additional Note (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Thermal paper jammed during scan..."
                    value={reprintNote}
                    onChange={(e) => setReprintNote(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-app)',
                      color: 'var(--text-main)'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}
                    disabled={reprintLoading}
                    onClick={handleConfirmReprint}
                  >
                    <Printer size={16} />
                    {reprintLoading ? 'Preparing Printout...' : 'Print E-Invoice Now'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}
                    onClick={() => handleDownloadSoftCopy(reprintModalDoc)}
                  >
                    <Download size={16} /> Download Soft Copy (PNG)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden 100x150mm Thermal Waybill Slip for window.print() */}
      {printableDoc && (
        <div id="bir-printable-invoice-slip" className="print-only-slip">
          <WaybillTicket
            platform={printableDoc.platform || 'Marketplace'}
            storeName={printableDoc.storeName || 'Official Store'}
            copyTag={printableDoc.isReprint ? 'REPRINT' : 'ORIGINAL'}
            invoiceNumber={printableDoc.documentNumber}
            issuedAt={printableDoc.issuedAt || printableDoc.lastPrintedAt || ''}
            orderId={printableDoc.orderId || '—'}
            buyerName={printableDoc.buyerName || 'Marketplace Buyer'}
            buyerTin={printableDoc.buyerTin || '—'}
            orderStatus={printableDoc.status || 'PAID'}
            lines={getDisplayLines(printableDoc)}
            discountAmount={printableDoc.discountAmount || '0.00'}
            vatableSales={printableDoc.vatableSales || '0.00'}
            vatAmount={printableDoc.vatAmount || '0.00'}
            vatExemptSales={printableDoc.vatExemptSales || '0.00'}
            zeroRatedSales={printableDoc.zeroRatedSales || '0.00'}
            totalAmount={printableDoc.totalAmount || '0.00'}
          />
        </div>
      )}
    </div>
  );
}
