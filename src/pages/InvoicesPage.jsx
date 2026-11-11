import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Printer,
  Download,
  Search,
  RefreshCw,
  CheckCircle2,
  FileText,
  X,
  Package,
  Receipt,
  FileCheck,
  AlertCircle,
  Eye,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/apiClient';
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
import PlatformBadge from '../components/PlatformBadge';
import './pages.css';

const FILTER_TABS = ['All Documents', 'Shopee', 'Lazada', 'TikTok', 'Pre-Pack Orders', 'Reprinted'];
const STATUS_FILTER_OPTIONS = [
  'All Status',
  'BIR Stamped',
  'PAID',
  'HOLD',
  'DUE',
  'WAITING',
  'UNPAID',
  'CANCELLED',
  'RETURNED'
];
const PAGE_SIZE_OPTIONS = [5, 10, 20];

function getStatusBadge(status, holdReason = null) {
  const s = String(status || '').trim().toUpperCase();
  if (s === 'DUE' || s.includes('CANCEL') || s.includes('RETURN') || s.includes('BLOCK')) {
    return 'badge-rose';
  }
  if (s === 'HOLD' || s.includes('HOLD') || s.includes('UNPAID') || holdReason) {
    return 'badge-amber';
  }
  if (s === 'WAITING' || s.includes('WAIT') || s.includes('PENDING') || s.includes('QUEUE')) {
    return 'badge-info';
  }
  return 'badge-emerald';
}

function mergePrintedAndApiDocs(localPrinted, apiDocs) {
  const map = new Map();
  const prependedLocal = [];

  // 1. Add all live API documents from /api/documents
  for (let i = 0; i < apiDocs.length; i++) {
    const doc = apiDocs[i];
    if (!doc) continue;
    const validDocNum =
      doc.documentNumber && doc.documentNumber !== '—' ? doc.documentNumber : null;
    const validOrderId =
      doc.orderId && doc.orderId !== '—' ? `${doc.platform || ''}:${doc.orderId}` : null;
    const key = String(doc.id || validDocNum || validOrderId || `doc-${i}`);
    const apiPrintCount = Math.max(
      Number(doc.printCount || 0),
      Array.isArray(doc.prints) ? doc.prints.length : 0
    );
    map.set(key, {
      ...doc,
      isFromApi: true,
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

  // 2. Merge & prepend local confirmed / printed records
  for (const item of localPrinted) {
    if (!item) continue;
    const matchKey = Array.from(map.keys()).find((k) => {
      const existing = map.get(k);
      return (
        (item.id && existing.id && String(item.id) === String(existing.id)) ||
        (item.documentNumber &&
          item.documentNumber !== '—' &&
          existing.documentNumber === item.documentNumber) ||
        (item.orderId &&
          item.orderId !== '—' &&
          existing.orderId === item.orderId) ||
        (item.tracking &&
          item.tracking !== '—' &&
          existing.tracking === item.tracking)
      );
    });

    if (matchKey) {
      const existing = map.get(matchKey);
      const mergedCount = Math.max(Number(item.printCount || 1), Number(existing.printCount || 1));
      const mergedEntry = {
        ...existing,
        ...item,
        lines: item.lines?.length ? item.lines : existing.lines,
        prints: existing.prints?.length ? existing.prints : item.prints,
        printCount: mergedCount,
        reprintCount: Math.max(Number(existing.reprintCount || 0), mergedCount - 1, 0),
        isReprint: Boolean(item.isReprint || existing.isReprint || mergedCount > 1),
        lastPrintedAt:
          item.lastPrintedAt ||
          existing.lastPrintedAt ||
          existing.issuedAt ||
          '—',
        lastReprintReason: item.lastReprintReason || existing.lastReprintReason || null
      };
      map.delete(matchKey);
      prependedLocal.push(mergedEntry);
    } else {
      const count = Number(item.printCount || 1);
      prependedLocal.push({
        ...item,
        printCount: count,
        reprintCount: Math.max(count - 1, 0),
        isReprint: Boolean(item.isReprint || count > 1)
      });
    }
  }

  return [...prependedLocal, ...Array.from(map.values())];
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const reprintReasons = normalizeReprintReasons(user?.reprintReasons);

  const [invoices, setInvoices] = useState([]);
  const [prepackOrders, setPrepackOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All Documents');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [notificationMsg, setNotificationMsg] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Reprint / Print Side Modal
  const [reprintModalDoc, setReprintModalDoc] = useState(null);
  const [selectedReason, setSelectedReason] = useState(
    reprintReasons[0]?.code || 'damaged'
  );
  const [reprintNote, setReprintNote] = useState('');
  const [reprintLoading, setReprintLoading] = useState(false);

  // Document Details Side Modal
  const [inspectDoc, setInspectDoc] = useState(null);
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

    const canFetchDoc = Boolean(doc.id);
    const canFetchDraft =
      (!doc.lines || doc.lines.length === 0) &&
      Boolean(doc.platform && doc.storeId && doc.orderId && doc.orderId !== '—');

    const [detailRes, draftRes] = await Promise.all([
      canFetchDoc ? fetchDocumentDetails(doc.id) : Promise.resolve(null),
      canFetchDraft
        ? fetchOrderDraft(doc.platform, doc.storeId, doc.orderId)
        : Promise.resolve(null)
    ]);

    if (detailRes?.ok && detailRes.data) {
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

    if (draftRes?.ok && draftRes.data) {
      const draftNorm = normalizeDocumentRecord(draftRes.data);
      if (draftNorm && draftNorm.lines?.length) {
        updated = {
          ...updated,
          lines: updated.lines?.length ? updated.lines : draftNorm.lines,
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

    return updated;
  }, []);

  // Fetch all documents from einvoice.ipolymersolutionscorp.com/api/documents
  const loadAllDocuments = useCallback(async (q = '', forceRefresh = false) => {
    setLoading(true);
    setApiError(null);
    const localList = getPrintedInvoiceRecords();
    const trimmed = q.trim();

    try {
      let rawDocs = [];
      let nextUrl = null;

      // 1. Primary query to /api/documents and /api/prepack in parallel (aligned with Dashboard & Orders cache keys)
      const queryObj = trimmed ? { q: trimmed, limit: 200 } : { limit: 200 };
      const [docsRes, preRes] = await Promise.all([
        api.get('/api/documents', queryObj, { forceRefresh }),
        api.get('/api/prepack', { problems_only: 0, limit: 200 }, { forceRefresh })
      ]);

      if (docsRes.ok && docsRes.data) {
        rawDocs.push(...extractDocumentList(docsRes.data));
        nextUrl = docsRes.data?.next || null;
      } else {
        // Fallback to fetchPrintedInvoices / fetchDocumentsRegister
        const printsRes = await fetchPrintedInvoices(trimmed ? { q: trimmed } : {}, { forceRefresh });
        if (printsRes.ok && printsRes.data) {
          rawDocs.push(...extractDocumentList(printsRes.data));
          nextUrl = printsRes.data?.next || null;
        } else {
          const fallbackRes = trimmed
            ? await searchDocuments(trimmed, { forceRefresh })
            : await fetchDocumentsRegister({ printed: 1 }, { forceRefresh });
          if (fallbackRes.ok && fallbackRes.data) {
            rawDocs.push(...extractDocumentList(fallbackRes.data));
            nextUrl = fallbackRes.data?.next || null;
          } else if (!docsRes.ok) {
            setApiError({
              status: docsRes.status || fallbackRes.status || 0,
              message:
                docsRes.data?.detail ||
                docsRes.statusText ||
                'Unable to fetch documents from einvoice.ipolymersolutionscorp.com/api/documents'
            });
          }
        }
      }

      // Follow pagination if present to list all documents
      let page = 1;
      while (nextUrl && page < 20) {
        page++;
        try {
          const u = new URL(nextUrl, 'https://einvoice.ipolymersolutionscorp.com');
          const pageRes = await api.get(`/api/documents?${u.searchParams.toString()}`, {}, { forceRefresh });
          if (pageRes.ok && pageRes.data) {
            const pageDocs = extractDocumentList(pageRes.data);
            if (pageDocs.length === 0) break;
            rawDocs.push(...pageDocs);
            nextUrl = pageRes.data?.next || null;
          } else {
            break;
          }
        } catch {
          break;
        }
      }

      const apiNormalized = rawDocs.map(normalizeDocumentRecord).filter(Boolean);
      const filteredLocal = trimmed
        ? localList.filter((item) => {
          const term = trimmed.toLowerCase();
          return (
            String(item.documentNumber || '').toLowerCase().includes(term) ||
            String(item.orderId || '').toLowerCase().includes(term) ||
            String(item.tracking || '').toLowerCase().includes(term) ||
            String(item.buyerName || '').toLowerCase().includes(term)
          );
        })
        : localList;

      const merged = mergePrintedAndApiDocs(filteredLocal, apiNormalized);
      setInvoices(merged);

      // 2. Populate Pre-Pack queue from parallel request
      if (preRes.ok && preRes.data) {
        const list = extractDocumentList(preRes.data);
        setPrepackOrders(list);
      }
    } catch (err) {
      console.warn('Error fetching all /api/documents:', err);
      setApiError({
        status: 0,
        message: err.message || 'Network error communicating with einvoice.ipolymersolutionscorp.com'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllDocuments('');

    const handlePrintedUpdate = () => {
      setInvoices((prev) => mergePrintedAndApiDocs(getPrintedInvoiceRecords(), prev));
    };

    window.addEventListener('bir-printed-invoices-updated', handlePrintedUpdate);
    return () => {
      window.removeEventListener('bir-printed-invoices-updated', handlePrintedUpdate);
    };
  }, [loadAllDocuments]);

  // Open Document Inspection Side Modal
  const openInspectModal = async (inv) => {
    setInspectDoc(inv);

    const hydrated = await hydrateFullDoc(inv);
    if (hydrated) {
      setInspectDoc(hydrated);
    }
  };

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

  // Prepack orders converted to unified row format for 'Pre-Pack Orders' tab
  const normalizedPrepackRows = useMemo(() => {
    if (!Array.isArray(prepackOrders)) return [];
    return prepackOrders.map((po, idx) => {
      const orderId = po.order_id || po.id || `ORD-${idx + 1}`;
      const tracking = po.tracking || po.tracking_number || po.waybill || '—';
      const storeName = po.store_name || po.store || po.shop_name || 'Official Store';
      const platform = po.platform || 'Marketplace';
      const buyerName = po.recipient_name || po.customer_name || po.buyer_name || 'Marketplace Buyer';
      const totalAmount = parseFloat(po.total_amount || po.amount || 0).toFixed(2);
      const state = String(po.state || '').toLowerCase();
      const statusLabel = state === 'ready' ? 'Ready to Pack' : (po.state || 'Pre-Pack Queue');

      return {
        id: po.id,
        isPrepack: true,
        documentNumber: `PRE-${orderId}`,
        orderId,
        tracking,
        platform,
        storeName,
        buyerName,
        issuedAt: po.created_at || 'Pending Scan',
        discountAmount: '0.00',
        vatAmount: ((parseFloat(totalAmount) * 0.12) / 1.12).toFixed(2),
        totalAmount,
        status: statusLabel,
        printCount: 0,
        isReprint: false,
        productSummary: po.items?.length
          ? po.items.map((i) => `${i.product_name || i.name} (x${i.qty || 1})`).join(', ')
          : `${platform} Order #${orderId}`,
        lines: po.items || []
      };
    });
  }, [prepackOrders]);

  // Combine or filter rows based on active filter
  const displayRows = useMemo(() => {
    if (activeFilter === 'Pre-Pack Orders') {
      return normalizedPrepackRows;
    }
    return invoices;
  }, [activeFilter, invoices, normalizedPrepackRows]);

  const filteredInvoices = useMemo(() => {
    return displayRows.filter((inv) => {
      const matchesTab =
        activeFilter === 'All Documents' || activeFilter === 'Pre-Pack Orders'
          ? true
          : activeFilter === 'Reprinted'
            ? Boolean(inv.isReprint || (inv.printCount || 0) > 1)
            : String(inv.platform || '').toLowerCase().includes(activeFilter.toLowerCase());

      if (!matchesTab) return false;

      if (statusFilter !== 'All Status') {
        const invStatus = String(inv.status || 'BIR Stamped').trim().toUpperCase();
        const invState = String(inv.invoiceState || '').trim().toUpperCase();
        const targetStatus = statusFilter.toUpperCase();
        const matchesHold =
          targetStatus === 'HOLD' &&
          (invState === 'HOLD' || invStatus.includes('HOLD') || Boolean(inv.holdReason));
        const matchesCancel =
          targetStatus === 'CANCELLED' &&
          (invStatus.includes('CANCEL') || invState.includes('CANCEL'));
        const matchesReturn =
          targetStatus === 'RETURNED' &&
          (invStatus.includes('RETURN') || invState.includes('RETURN'));
        if (
          invStatus !== targetStatus &&
          invState !== targetStatus &&
          !matchesHold &&
          !matchesCancel &&
          !matchesReturn
        ) {
          return false;
        }
      }

      const term = searchQuery.trim().toLowerCase();
      if (!term) return true;

      return (
        String(inv.documentNumber || '').toLowerCase().includes(term) ||
        String(inv.orderId || '').toLowerCase().includes(term) ||
        String(inv.tracking || '').toLowerCase().includes(term) ||
        String(inv.buyerName || '').toLowerCase().includes(term) ||
        String(inv.storeName || '').toLowerCase().includes(term) ||
        String(inv.productSummary || '').toLowerCase().includes(term)
      );
    });
  }, [displayRows, activeFilter, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * itemsPerPage;
  const paginatedInvoices = filteredInvoices.slice(startIdx, startIdx + itemsPerPage);

  const totalPrintedValue = filteredInvoices.reduce((sum, inv) => {
    const num = parseFloat(String(inv.totalAmount || '0').replace(/[^0-9.-]+/g, ''));
    return sum + (Number.isFinite(num) ? num : 0);
  }, 0);

  const totalVatValue = filteredInvoices.reduce((sum, inv) => {
    const num = parseFloat(String(inv.vatAmount || '0').replace(/[^0-9.-]+/g, ''));
    return sum + (Number.isFinite(num) ? num : 0);
  }, 0);

  const reprintedCount = invoices.filter(
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
    <div className="invoices-page" style={{ paddingBottom: '96px' }}>
      {/* Page Header */}
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">E-Invoice Documents & Ledger Tracker</h1>
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
                  href={getExportDownloadUrl('/api/documents', { printed: 1 }, 'csv')}
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
                  href={getExportDownloadUrl('/api/documents', { printed: 1 }, 'xlsx')}
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
            onClick={() => loadAllDocuments(searchQuery, true)}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spinner' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* API Error Notification */}
      {apiError && (
        <div
          className="no-print"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#ef4444',
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.875rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={18} />
            <span>
              <strong>API Error ({apiError.status}):</strong> {apiError.message}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => loadAllDocuments(searchQuery)}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Success Notification */}
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

      {/* Top Metric Cards */}
      <div className="stats-grid no-print">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Invoiced Amount</span>
            <div className="stat-card-icon-wrap">
              <Receipt size={20} />
            </div>
          </div>
          <div className="stat-card-value">
            ₱{totalPrintedValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-card-footer">
            <span className="trend-description">{invoices.length} Documents</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">12% Output VAT Total</span>
            <div className="stat-card-icon-wrap">
              <FileText size={20} />
            </div>
          </div>
          <div className="stat-card-value">
            ₱{totalVatValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-card-footer">
            <span className="trend-description">12% VAT Stamped</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Pre-Pack Queue</span>
            <div className="stat-card-icon-wrap">
              <Package size={20} />
            </div>
          </div>
          <div className="stat-card-value">{prepackOrders.length}</div>
          <div className="stat-card-footer">
            <span className="trend-description">Orders Ready to Scan</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Reprinted E-Invoices</span>
            <div className="stat-card-icon-wrap">
              <RefreshCw size={20} />
            </div>
          </div>
          <div className="stat-card-value">{reprintedCount}</div>
          <div className="stat-card-footer">
            <span className="trend-description">Audited reprint logs</span>
          </div>
        </div>
      </div>

      {/* Main Documents Table Card */}
      <div className="card-section no-print" style={{ position: 'relative', overflow: 'visible', marginBottom: '24px' }}>
        <div className="card-section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="card-section-title">
              {activeFilter === 'Pre-Pack Orders'
                ? 'Pre-Pack Fulfillment Queue (/api/prepack)'
                : 'E-Invoice Documents'}
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
              aria-label="Filter Documents"
            >
              {FILTER_TABS.map((tab) => {
                let label = tab;
                if (tab === 'All Documents' && invoices.length > 0) {
                  label = `${tab} (${invoices.length})`;
                } else if (tab === 'Pre-Pack Orders' && prepackOrders.length > 0) {
                  label = `${tab} (${prepackOrders.length})`;
                }
                return (
                  <option key={tab} value={tab}>
                    {label}
                  </option>
                );
              })}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
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
              aria-label="Filter by Status"
            >
              {STATUS_FILTER_OPTIONS.map((statusOpt) => (
                <option key={statusOpt} value={statusOpt}>
                  {statusOpt === 'All Status' ? 'All Status' : `${statusOpt}`}
                </option>
              ))}
            </select>

            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
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
              aria-label="Rows per page"
            >
              {PAGE_SIZE_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count} rows
                </option>
              ))}
            </select>

            <form
              className="orders-search-form"
              onSubmit={(e) => {
                e.preventDefault();
                setCurrentPage(1);
                loadAllDocuments(searchQuery);
              }}
            >
              <div className="orders-search-input-wrap">
                <Search size={15} className="orders-search-icon" />
                <input
                  type="text"
                  className="search-input"
                  style={{ paddingLeft: '34px', width: '100%' }}
                  placeholder="Search document #, order ID, waybill tracking, buyer..."
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
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Document / Invoice No.</th>
                <th>Platform & Store</th>
                <th>Order ID / Waybill</th>
                <th>Buyer & Item Summary</th>
                <th>Date & Time Issued</th>
                <th>Discount & 12% VAT</th>
                <th>Amount (PHP)</th>
                <th>Ledger Status</th>
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
              ) : paginatedInvoices.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <div className="empty-state-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                        <FileCheck size={28} />
                      </div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                        {invoices.length === 0 ? 'No Electronic Invoices Issued in Live Ledger Yet' : 'No matching documents found'}
                      </h3>
                      <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                        {invoices.length === 0
                          ? 'Per BIR RMC 98-2026, electronic invoices are permanently written to the ledger upon waybill barcode scan at the packing scan station (POST /api/scan/issue).'
                          : 'Try modifying your search query or switching to another filter tab.'}
                      </p>
                      {prepackOrders.length > 0 && invoices.length === 0 && (
                        <div style={{ display: 'flex', gap: '10px', marginTop: '6px', borderRadius: 0 }}>
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ fontSize: '0.8rem', borderRadius: 0 }}
                            onClick={() => setActiveFilter('Pre-Pack Orders')}
                          >
                            <Package size={14} /> View Pre-Pack Queue ({prepackOrders.length})
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedInvoices.map((inv, idx) => (
                  <tr key={inv.id || inv.documentNumber || idx}>
                    <td>
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                        onClick={() => openInspectModal(inv)}
                        title="Click to view full Document details & BIR EIS JSON"
                      >
                        <strong style={{ fontFamily: 'monospace', color: 'var(--primary)', fontSize: '0.88rem' }}>
                          {inv.documentNumber || `INV-${inv.id || idx + 1}`}
                        </strong>
                      </button>
                    </td>
                    <td>
                      <PlatformBadge
                        platform={inv.platform || 'Marketplace'}
                        printed={!inv.isPrepack}
                      />
                      <div style={{ fontSize: '0.76rem', marginTop: '4px', fontWeight: 600 }}>
                        {inv.storeName || 'Official Store'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {inv.orderId || '—'}
                      </div>
                    </td>
                    <td style={{ maxWidth: '230px' }}>
                      <strong>{inv.buyerName || 'Marketplace Buyer'}</strong>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {(() => {
                        const rawDate = inv.issuedAt && inv.issuedAt !== '—' ? inv.issuedAt : inv.lastPrintedAt;
                        if (!rawDate || rawDate === '—') return <div>—</div>;

                        const dateObj = new Date(rawDate);
                        if (isNaN(dateObj.getTime())) return <div>{rawDate}</div>;

                        return (
                          <div>
                            <div style={{ fontWeight: 600 }}>
                              {dateObj.toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </div>
                          </div>
                        );
                      })()}
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
                      ₱{parseFloat(inv.totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <span
                        className={`badge ${getStatusBadge(inv.status || 'BIR Stamped', inv.holdReason)}`}
                      >
                        {inv.status || 'BIR Stamped'}
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
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', borderRadius: 4 }}>
                        <button
                          type="button"
                          className="btn btn-info"
                          style={{ padding: '5px 8px', fontSize: '0.74rem', borderRadius: 4 }}
                          onClick={() => openInspectModal(inv)}
                          title="View Document Details & BIR EIS JSON"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '5px 10px', fontSize: '0.74rem', borderRadius: 4 }}
                          onClick={() => openReprintModal(inv)}
                          title="Print E-Invoice Waybill Ticket"
                        >
                          <Printer size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-success"
                          style={{ padding: '5px 10px', fontSize: '0.74rem', borderRadius: 4 }}
                          onClick={() => handleDownloadSoftCopy(inv)}
                          title="Download Waybill Soft Copy (PNG)"
                        >
                          <Download size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer Bar */}
        <div
          className="invoices-pagination-bar"
          style={{
            position: 'relative',
            inset: 'auto',
            zIndex: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '16px 18px',
            marginTop: '0',
            borderTop: '1px solid var(--border-light)',
            background: 'var(--bg-card)',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          <span className="page-subtitle">
            {filteredInvoices.length === 0
              ? `Showing 0 of 0 Documents (${itemsPerPage} per page)`
              : `Showing ${startIdx + 1}–${Math.min(startIdx + itemsPerPage, filteredInvoices.length)} of ${filteredInvoices.length} Records (${itemsPerPage} per page)`}
          </span>

          <div
            className="invoices-pagination-controls"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', maxWidth: '100%' }}
          >
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
                className={`btn pagination-btn ${pageNum === safePage ? 'btn-primary' : 'btn-outline'
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

      {/* Document Details Right Side Modal - Clean UI (Inter) like Orders Page */}
      {inspectDoc && (
        <div
          className="order-drawer-backdrop no-print"
          onClick={() => setInspectDoc(null)}
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
                    platform={inspectDoc.platform || 'Marketplace'}
                    printed={!inspectDoc.isPrepack}
                  />
                </div>
                <div className="modal-title-row">
                  <span>Document</span>
                  <span className="order-id-badge num-target">
                    #{inspectDoc.documentNumber && inspectDoc.documentNumber !== '—' ? inspectDoc.documentNumber : inspectDoc.orderId}
                  </span>
                </div>
                <p className="modal-subtitle">
                  Waybill: <span className="num-target">{inspectDoc.tracking || '—'}</span> &middot; Date:{' '}
                  <span className="num-target">
                    {inspectDoc.issuedAt && inspectDoc.issuedAt !== '—' ? inspectDoc.issuedAt : inspectDoc.lastPrintedAt || '—'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setInspectDoc(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="modal-body">
              {/* Metadata */}
              <div>
                <div className="section-title">Channel &amp; Buyer Information</div>
                <div className="meta-box">
                  <div className="meta-col">
                    <span className="meta-lbl">Store</span>
                    <span className="meta-val">
                      {inspectDoc.platform || 'Marketplace'} &middot; {inspectDoc.storeName || 'Official Store'}
                    </span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Buyer</span>
                    <span className="meta-val">{inspectDoc.buyerName || 'Marketplace Buyer'}</span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Order ID</span>
                    <span className="meta-val highlight num-target">{inspectDoc.orderId || '—'}</span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Waybill Tracking</span>
                    <span className="num-target meta-val">{inspectDoc.tracking || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Item Card */}
              <div>
                <div className="section-title">
                  Product Ordered by Customer ({getDisplayLines(inspectDoc).length})
                </div>
                {getDisplayLines(inspectDoc)
                  .slice(0, 2)
                  .map((line, i) => (
                    <div
                      key={line.id || i}
                      className="item-card"
                      style={i > 0 ? { marginTop: '8px' } : undefined}
                    >
                      <div className="item-name">
                        {line.productName || line.name || `Item #${i + 1}`}
                      </div>

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
                              {line.qty || line.quantity || 1}
                            </td>
                            <td className="num-target">
                              ₱{parseFloat(line.unitPrice || line.unit_price || 0).toFixed(2)}
                            </td>
                            <td className="num-target">
                              ₱{parseFloat(line.vatAmount || line.vat_amount || 0).toFixed(2)}
                            </td>
                            <td className="num-target" style={{ fontWeight: 700 }}>
                              ₱{parseFloat(line.lineTotal || line.line_total || line.total_amount || 0).toFixed(2)}
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
                    <span className="num-target">-₱{inspectDoc.discountAmount || '0.00'}</span>
                  </div>
                  <div className="totals-row">
                    <span>VATable Sales (Net of VAT)</span>
                    <span className="num-target">₱{inspectDoc.vatableSales || '0.00'}</span>
                  </div>
                  <div className="totals-row">
                    <span>12% VAT Amount</span>
                    <span className="num-target">₱{inspectDoc.vatAmount || '0.00'}</span>
                  </div>
                  <div className="totals-row grand-total">
                    <span>Total Amount (VAT Inc.)</span>
                    <span className="total-amount-display num-target">
                      ₱{parseFloat(inspectDoc.totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
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
                onClick={() => setInspectDoc(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                onClick={() => {
                  const target = inspectDoc;
                  setInspectDoc(null);
                  openReprintModal(target);
                }}
              >
                Print E-Invoice Waybill
              </button>
            </div>
          </aside>
        </div>
      )}

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
                <h2 className="card-section-title" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Printer size={17} color="var(--primary)" />
                  Print Waybill Ticket ({reprintModalDoc.documentNumber})
                </h2>
                <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>
                  Preview the 100×150mm waybill ticket and confirm print audit details.
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

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '20px',
                alignItems: 'start'
              }}
            >
              {/* Left: Print Configuration & Audit */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    backgroundColor: 'var(--bg-app)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px'
                  }}
                >
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px' }}>
                    Print & Audit Configuration
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
                      Reason for Printing / Reprinting *
                    </label>
                    <select
                      value={selectedReason}
                      onChange={(e) => setSelectedReason(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-surface)',
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

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        marginBottom: '6px'
                      }}
                    >
                      Audit Note / Explanation (Optional)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g. Thermal paper jammed, customer requested second slip..."
                      value={reprintNote}
                      onChange={(e) => setReprintNote(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-main)',
                        fontSize: '0.82rem',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
                    onClick={handleConfirmReprint}
                    disabled={reprintLoading}
                  >
                    <Printer size={15} />
                    {reprintLoading ? 'Logging & Printing...' : 'Confirm & Print Thermal Slip'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => handleDownloadSoftCopy(reprintModalDoc)}
                  >
                    <Download size={15} /> Download Soft Copy (PNG)
                  </button>
                </div>
              </div>

              {/* Right: Waybill Ticket Preview */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <WaybillTicket
                  platform={reprintModalDoc.platform || 'Marketplace'}
                  storeName={reprintModalDoc.storeName || 'Official Store'}
                  copyTag={reprintModalDoc.isReprint ? 'REPRINT' : 'ORIGINAL'}
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
