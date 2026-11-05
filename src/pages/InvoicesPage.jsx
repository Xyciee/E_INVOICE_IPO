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
  Layers,
  ExternalLink,
  Receipt,
  FileCheck,
  AlertCircle,
  Eye,
  Copy,
  Check,
  Building2,
  Hash,
  Clock,
  ShieldCheck,
  Tag
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/apiClient';
import {
  searchDocuments,
  fetchDocumentDetails,
  fetchOrderDraft,
  logInvoicePrint,
  extractDocumentList,
  normalizeDocumentRecord,
  normalizeReprintReasons,
  getPrintedInvoiceRecords,
  savePrintedInvoiceRecord,
  downloadWaybillSoftCopy
} from '../services/scanService';
import WaybillTicket from '../components/WaybillTicket';
import './pages.css';

const FILTER_TABS = ['All Documents', 'Shopee', 'Lazada', 'TikTok', 'Pre-Pack Orders', 'Reprinted'];
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

  // 1. Add all live API documents from /api/documents
  for (const doc of apiDocs) {
    if (!doc) continue;
    const key = String(doc.id || doc.documentNumber || doc.orderId || Math.random());
    const apiPrintCount = Array.isArray(doc.prints) ? doc.prints.length : (doc.printCount || 0);
    map.set(key, {
      ...doc,
      isFromApi: true,
      lastPrintedAt:
        doc.prints?.[0]?.printed_at ||
        doc.prints?.[0]?.created_at ||
        doc.issuedAt ||
        '—',
      printCount: Math.max(apiPrintCount, doc.printCount || 1),
      isReprint: apiPrintCount > 1 || Boolean(doc.isReprint)
    });
  }

  // 2. Enhance with local print history (thermal station reprints)
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
          existing.orderId === item.orderId)
      );
    });

    if (matchKey) {
      const existing = map.get(matchKey);
      map.set(matchKey, {
        ...existing,
        ...item,
        lines: item.lines?.length ? item.lines : existing.lines,
        printCount: Math.max(Number(item.printCount || 1), Number(existing.printCount || 1)),
        isReprint: Boolean(item.isReprint || existing.isReprint)
      });
    } else if (apiDocs.length === 0) {
      // If backend API documents are empty or unavailable, show local station records as fallback
      const key = String(item.id || item.documentNumber || item.orderId || Math.random());
      map.set(key, {
        ...item,
        printCount: Number(item.printCount || 1),
        isReprint: Boolean(item.isReprint)
      });
    }
  }

  return Array.from(map.values());
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const reprintReasons = normalizeReprintReasons(user?.reprintReasons);

  const [invoices, setInvoices] = useState([]);
  const [prepackOrders, setPrepackOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All Documents');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [notificationMsg, setNotificationMsg] = useState('');

  // Reprint / Print Modal
  const [reprintModalDoc, setReprintModalDoc] = useState(null);
  const [selectedReason, setSelectedReason] = useState(
    reprintReasons[0]?.code || 'damaged'
  );
  const [reprintNote, setReprintNote] = useState('');
  const [reprintLoading, setReprintLoading] = useState(false);

  // Document Details & EIS JSON Modal
  const [inspectDoc, setInspectDoc] = useState(null);
  const [inspectTab, setInspectTab] = useState('details'); // 'details' | 'eis'
  const [eisJsonLoading, setEisJsonLoading] = useState(false);
  const [eisJsonData, setEisJsonData] = useState(null);
  const [copiedEis, setCopiedEis] = useState(false);

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

    if (
      (!updated.lines || updated.lines.length === 0) &&
      updated.platform &&
      updated.storeId &&
      updated.orderId &&
      updated.orderId !== '—'
    ) {
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

  // Fetch all documents from einvoice.ipolymersolutionscorp.com/api/documents
  const loadAllDocuments = useCallback(async (q = '') => {
    setLoading(true);
    setApiError(null);
    const cleanQuery = q.trim();

    try {
      let rawDocs = [];
      let nextUrl = null;

      // 1. Fetch from /api/documents (backend einvoice.ipolymersolutionscorp.com/api/documents)
      const queryObj = cleanQuery ? { q: cleanQuery } : {};
      const docsRes = await api.get('/api/documents', queryObj);

      if (docsRes.ok && docsRes.data) {
        const batch = extractDocumentList(docsRes.data);
        rawDocs.push(...batch);
        nextUrl = docsRes.data?.next || null;
      } else if (!docsRes.ok) {
        // Fallback with searchDocuments helper
        const scanRes = await searchDocuments(cleanQuery);
        if (scanRes.ok && scanRes.data) {
          rawDocs.push(...extractDocumentList(scanRes.data));
          nextUrl = scanRes.data?.next || null;
        } else {
          setApiError({
            status: docsRes.status || scanRes.status || 0,
            message: docsRes.data?.detail || docsRes.statusText || 'Unable to fetch documents from einvoice.ipolymersolutionscorp.com/api/documents'
          });
        }
      }

      // If paginated by Django REST Framework, compile subsequent pages to list ALL documents
      let page = 1;
      while (nextUrl && page < 20) {
        page++;
        try {
          const u = new URL(nextUrl, 'https://einvoice.ipolymersolutionscorp.com');
          const pageRes = await api.get(`/api/documents?${u.searchParams.toString()}`);
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

      const normalizedApi = rawDocs.map(normalizeDocumentRecord).filter(Boolean);
      const localList = getPrintedInvoiceRecords();
      const merged = mergePrintedAndApiDocs(localList, normalizedApi);

      setInvoices(merged);

      // 2. Fetch Pre-Pack queue for staging reference
      const preRes = await api.get('/api/prepack');
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
  }, [loadAllDocuments]);

  // Open Document Inspection Modal
  const openInspectModal = async (inv) => {
    setInspectDoc(inv);
    setInspectTab('details');
    setEisJsonData(null);
    setCopiedEis(false);

    const hydrated = await hydrateFullDoc(inv);
    if (hydrated) {
      setInspectDoc(hydrated);
    }
  };

  // Fetch EIS JSON on demand
  const loadEisJson = async (docId) => {
    if (!docId) return;
    setEisJsonLoading(true);
    try {
      const res = await api.get(`/api/documents/${encodeURIComponent(docId)}/eis-json`);
      if (res.ok && res.data) {
        setEisJsonData(res.data);
      } else {
        setEisJsonData({ error: 'No EIS JSON payload generated for this record.' });
      }
    } catch (err) {
      setEisJsonData({ error: err.message });
    } finally {
      setEisJsonLoading(false);
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
  }, [displayRows, activeFilter, searchQuery]);

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
    <div className="invoices-page" style={{ paddingBottom: "96px" }}>
      {/* Page Header */}
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">E-Invoice Documents & Ledger Tracker</h1>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => loadAllDocuments(searchQuery)}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spinner' : ''} /> Refresh Documents
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
            <div
              className="stat-card-icon-wrap"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}
            >
              <Receipt size={20} />
            </div>
          </div>
          <div className="stat-card-value">
            ₱{totalPrintedValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-card-footer">
            <span className="badge badge-primary">{invoices.length} Documents</span>
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
            <span className="badge badge-emerald">12% VAT Stamped</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Pre-Pack Queue</span>
            <div
              className="stat-card-icon-wrap"
              style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}
            >
              <Package size={20} />
            </div>
          </div>
          <div className="stat-card-value">{prepackOrders.length}</div>
          <div className="stat-card-footer">
            <span className="badge badge-purple">Orders Ready to Scan</span>
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

      {/* Filter Tabs & Search Bar */}
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
              {tab === 'Pre-Pack Orders' && prepackOrders.length > 0 && (
                <span className="badge badge-purple" style={{ marginLeft: '6px', fontSize: '0.68rem', padding: '1px 6px' }}>
                  {prepackOrders.length}
                </span>
              )}
              {tab === 'All Documents' && invoices.length > 0 && (
                <span className="badge badge-primary" style={{ marginLeft: '6px', fontSize: '0.68rem', padding: '1px 6px' }}>
                  {invoices.length}
                </span>
              )}
            </button>
          ))}
        </div>

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

      {/* Main Documents Table Card */}
      <div className="card-section no-print" style={{ position: "relative", overflow: "visible", marginBottom: "24px" }}>
        <div className="card-section-header">
          <div>
            <h2 className="card-section-title">
              {activeFilter === 'Pre-Pack Orders'
                ? 'Pre-Pack Fulfillment Queue (/api/prepack)'
                : 'E-Invoice Documents'}
            </h2>
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
                <th>Date Issued</th>
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
                        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ fontSize: '0.8rem' }}
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
                            {dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                        className={`badge ${inv.isPrepack
                          ? 'badge-purple'
                          : inv.status === 'PAID' || inv.status === 'BIR STAMPED' || inv.status === 'ISSUED'
                            ? 'badge-emerald'
                            : 'badge-primary'
                          }`}
                      >
                        {inv.status || 'BIR Stamped'}
                      </span>
                      {inv.isReprint && (
                        <span className="badge badge-amber" style={{ marginLeft: '4px', fontSize: '0.68rem' }}>

                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-info"
                          style={{ padding: '5px 8px', fontSize: '0.74rem' }}
                          onClick={() => openInspectModal(inv)}
                          title="View Document Details & BIR EIS JSON"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                          onClick={() => openReprintModal(inv)}
                          title="Print E-Invoice Waybill Ticket"
                        >
                          <Printer size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-success"
                          style={{ padding: '5px 10px', fontSize: '0.74rem' }}
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
        <div className="invoices-pagination-bar"
          style={{ position: "relative", inset: "auto", zIndex: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", padding: "16px 18px", marginTop: "0", borderTop: "1px solid var(--border-light)", background: "var(--bg-card)", width: "100%", boxSizing: "border-box" }}>
          <span className="page-subtitle">
            {filteredInvoices.length === 0
              ? 'Showing 0 of 0 Documents'
              : `Showing ${startIdx + 1}–${Math.min(startIdx + ITEMS_PER_PAGE, filteredInvoices.length)} of ${filteredInvoices.length} Records`}
          </span>

          <div className="invoices-pagination-controls"
            style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", maxWidth: "100%" }}>
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

      {/* Document Inspection & BIR EIS JSON Modal */}
      {inspectDoc && (
        <div
          className="scan-modal-backdrop no-print"
          onClick={() => setInspectDoc(null)}
        >
          <div
            className="doc-modal-card"
            style={{ maxWidth: '860px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="doc-modal-header">
              <div>
                <h2 className="card-section-title" style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="var(--primary)" />
                  Document #{inspectDoc.documentNumber || inspectDoc.id}
                  <span className={`badge ${getPlatformBadge(inspectDoc.platform)}`}>
                    {inspectDoc.platform || 'Marketplace'}
                  </span>
                  <span className="badge badge-emerald">
                    {inspectDoc.status || 'ISSUED'}
                  </span>
                </h2>
                <p className="page-subtitle">
                  Live backend write-once ledger record from <code>/api/documents/{inspectDoc.id || ''}</code>
                </p>
              </div>
              <button
                type="button"
                className="scan-modal-close"
                style={{ position: 'static' }}
                onClick={() => setInspectDoc(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Tabs: Document Details vs BIR EIS JSON */}
            <div className="filter-tabs" style={{ marginBottom: '16px' }}>
              <button
                type="button"
                className={`filter-tab ${inspectTab === 'details' ? 'active' : ''}`}
                onClick={() => setInspectTab('details')}
              >
                <FileText size={14} style={{ marginRight: '5px' }} /> Document Details & Lines
              </button>
              <button
                type="button"
                className={`filter-tab ${inspectTab === 'eis' ? 'active' : ''}`}
                onClick={() => {
                  setInspectTab('eis');
                  if (!eisJsonData && inspectDoc.id) {
                    loadEisJson(inspectDoc.id);
                  }
                }}
              >
                <ShieldCheck size={14} style={{ marginRight: '5px' }} /> BIR EIS JSON Preview (/api/documents/{inspectDoc.id || ''}/eis-json)
              </button>
            </div>

            {inspectTab === 'details' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Meta details grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-app)',
                    border: '1px solid var(--border-light)'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Store / Channel
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {inspectDoc.storeName || 'Official Store'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Order ID
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'monospace' }}>
                      {inspectDoc.orderId || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Waybill / Tracking
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'monospace' }}>
                      {inspectDoc.tracking || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Buyer Name / TIN
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {inspectDoc.buyerName || 'Marketplace Buyer'} {inspectDoc.buyerTin && inspectDoc.buyerTin !== '—' ? `(TIN: ${inspectDoc.buyerTin})` : ''}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Date Issued
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {inspectDoc.issuedAt || inspectDoc.lastPrintedAt || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Station Code
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {inspectDoc.lastStationCode || 'PACK-01'}
                    </div>
                  </div>
                </div>

                {/* Line Items Table */}
                <div>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>
                    Itemized Line Items
                  </h3>
                  <div className="table-responsive" style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
                    <table className="data-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Item Name</th>
                          <th>SKU</th>
                          <th>Qty</th>
                          <th>Unit Price</th>
                          <th>12% VAT</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getDisplayLines(inspectDoc).map((line, lIdx) => (
                          <tr key={line.id || lIdx}>
                            <td><strong>{line.productName || line.name || `Item #${lIdx + 1}`}</strong></td>
                            <td style={{ fontFamily: 'monospace' }}>{line.sku || '—'}</td>
                            <td>{line.qty || line.quantity || 1}</td>
                            <td>₱{parseFloat(line.unitPrice || line.unit_price || 0).toFixed(2)}</td>
                            <td>₱{parseFloat(line.vatAmount || line.vat_amount || 0).toFixed(2)}</td>
                            <td style={{ fontWeight: 700 }}>₱{parseFloat(line.lineTotal || line.line_total || line.total_amount || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tax Breakdown Totals */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '10px',
                    padding: '12px',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vatable Sales:</span>
                    <div style={{ fontWeight: 700 }}>₱{inspectDoc.vatableSales || '0.00'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>12% Output VAT:</span>
                    <div style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>₱{inspectDoc.vatAmount || '0.00'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Discount:</span>
                    <div style={{ fontWeight: 700 }}>-₱{inspectDoc.discountAmount || '0.00'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Invoiced:</span>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--primary)' }}>
                      ₱{parseFloat(inspectDoc.totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleDownloadSoftCopy(inspectDoc)}
                  >
                    <Download size={14} /> Soft Copy
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setInspectDoc(null);
                      openReprintModal(inspectDoc);
                    }}
                  >
                    <Printer size={14} /> Print Waybill
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Payload submitted for BIR EIS verification compliance:
                  </span>
                  {eisJsonData && !eisJsonData.error && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                      onClick={() => {
                        navigator.clipboard?.writeText(JSON.stringify(eisJsonData, null, 2));
                        setCopiedEis(true);
                        setTimeout(() => setCopiedEis(false), 2000);
                      }}
                    >
                      {copiedEis ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                      {copiedEis ? 'Copied' : 'Copy JSON'}
                    </button>
                  )}
                </div>

                {eisJsonLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={20} className="spinner" style={{ marginBottom: '8px' }} />
                    <div>Loading BIR EIS JSON preview...</div>
                  </div>
                ) : (
                  <pre
                    style={{
                      backgroundColor: '#0f172a',
                      color: '#38bdf8',
                      padding: '14px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.78rem',
                      fontFamily: 'monospace',
                      maxHeight: '380px',
                      overflow: 'auto',
                      border: '1px solid var(--border-light)'
                    }}
                  >
                    {JSON.stringify(eisJsonData || inspectDoc.raw || inspectDoc, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
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

              <div className="card-section" style={{ marginBottom: 0 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px' }}>
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

                <div style={{ marginBottom: '16px' }}>
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
                      background: 'var(--bg-app)',
                      color: 'var(--text-main)',
                      fontSize: '0.82rem',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={handleConfirmReprint}
                    disabled={reprintLoading}
                  >
                    <Printer size={15} />
                    {reprintLoading ? 'Logging & Printing...' : 'Confirm & Print Thermal Slip'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleDownloadSoftCopy(reprintModalDoc)}
                  >
                    <Download size={15} /> PNG
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
