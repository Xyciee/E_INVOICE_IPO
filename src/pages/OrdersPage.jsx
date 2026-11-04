import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag,
  Search,
  RefreshCw,
  FileText,
  Printer,
  Package,
  ArrowLeftRight,
  X
} from 'lucide-react';
import {
  searchDocuments,
  fetchDocumentDetails,
  extractDocumentList,
  normalizeDocumentRecord
} from '../services/scanService';
import './pages.css';

const PLATFORM_TABS = ['All', 'TikTok', 'Shopee', 'Lazada'];

function getPlatformBadge(platform) {
  const p = String(platform || '').toLowerCase();
  if (p.includes('tiktok')) return 'badge-primary';
  if (p.includes('shopee')) return 'badge-amber';
  if (p.includes('lazada')) return 'badge-emerald';
  return 'badge-primary';
}

export default function OrdersPage() {
  const [platformFilter, setPlatformFilter] = useState('All');
  const [queryInput, setQueryInput] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [selectedDoc, setSelectedDoc] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const runSearch = useCallback(async (searchTerm = '') => {
    setLoading(true);
    setErrorMsg(null);

    const trimmed = searchTerm.trim();
    const res = await searchDocuments(trimmed);

    if (res.ok && res.data) {
      const rawList = extractDocumentList(res.data);
      const normalized = rawList.map(normalizeDocumentRecord).filter(Boolean);

      if (normalized.length > 0) {
        setDocuments(normalized);
        setLoading(false);
        return;
      }
    }

    if (/^#?\d+$/.test(trimmed)) {
      const numericId = trimmed.replace('#', '');
      const singleRes = await fetchDocumentDetails(numericId);
      if (singleRes.ok && singleRes.data) {
        const doc = normalizeDocumentRecord(singleRes.data);
        setDocuments(doc ? [doc] : []);
        setLoading(false);
        return;
      }
    }

    if (!res.ok) {
      setErrorMsg(
        res.data?.detail ||
          res.data?.message ||
          `Unable to load orders (${res.status}).`
      );
    } else {
      setDocuments([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialOrders() {
      const res = await searchDocuments('');
      if (!active) return;

      if (res.ok && res.data) {
        const rawList = extractDocumentList(res.data);
        setDocuments(rawList.map(normalizeDocumentRecord).filter(Boolean));
      } else if (!res.ok) {
        setErrorMsg(
          res.data?.detail ||
            res.data?.message ||
            `Unable to load orders (${res.status}).`
        );
      }
      setLoading(false);
    }

    loadInitialOrders();
    return () => {
      active = false;
    };
  }, []);

  const openDocumentModal = async (docOrId) => {
    const id = typeof docOrId === 'object' ? docOrId.id : docOrId;
    if (typeof docOrId === 'object') {
      setSelectedDoc(docOrId);
    }

    if (!id) return;

    setDetailLoading(true);
    setDetailError(null);

    const res = await fetchDocumentDetails(id);
    setDetailLoading(false);

    if (!res.ok) {
      setDetailError(
        res.data?.detail || `Failed to load document #${id} (${res.status}).`
      );
      return;
    }

    const fullDoc = normalizeDocumentRecord(res.data);
    if (fullDoc) {
      setSelectedDoc(fullDoc);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    runSearch(queryInput);
  };

  const filteredDocs = documents.filter((doc) => {
    if (platformFilter === 'All') return true;
    return doc.platform.toLowerCase() === platformFilter.toLowerCase();
  });

  const totalAmountSum = filteredDocs.reduce((acc, doc) => {
    const num = parseFloat(String(doc.totalAmount).replace(/[^0-9.-]+/g, ''));
    return acc + (Number.isFinite(num) ? num : 0);
  }, 0);

  const countByPlatform = (name) =>
    documents.filter((d) => d.platform.toLowerCase() === name.toLowerCase()).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Marketplace Orders & Documents</h1>
          <p className="page-subtitle">
            Search and inspect TikTok, Shopee, and Lazada orders by document number, order ID, or waybill tracking.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => runSearch(queryInput)}
            disabled={loading}
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Orders Loaded</span>
            <div className="stat-card-icon-wrap">
              <ShoppingBag size={20} />
            </div>
          </div>
          <div className="stat-card-value">{filteredDocs.length}</div>
          <div className="stat-card-footer">
            <span className="trend-description">
              TikTok: {countByPlatform('TikTok')} · Shopee: {countByPlatform('Shopee')} · Lazada: {countByPlatform('Lazada')}
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Billed Value</span>
            <div className="stat-card-icon-wrap">
              <FileText size={20} />
            </div>
          </div>
          <div className="stat-card-value">
            ₱{totalAmountSum.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-card-footer">
            <span className="badge badge-emerald">Live API Data</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Print Logs</span>
            <div className="stat-card-icon-wrap">
              <Printer size={20} />
            </div>
          </div>
          <div className="stat-card-value">
            {filteredDocs.reduce((sum, d) => sum + (d.prints?.length || 0), 0)}
          </div>
          <div className="stat-card-footer">
            <span className="trend-description">Audited physical prints</span>
          </div>
        </div>
      </div>

      <div className="orders-toolbar">
        <div className="filter-tabs" style={{ margin: 0 }}>
          {PLATFORM_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`filter-tab ${platformFilter === tab ? 'active' : ''}`}
              onClick={() => setPlatformFilter(tab)}
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
              placeholder="Search document #, order ID, or tracking..."
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
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
                runSearch('');
              }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {errorMsg && (
        <div className="card-section scan-alert-card scan-alert-red">
          <div>{errorMsg}</div>
        </div>
      )}

      <div className="card-section">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Document No.</th>
                <th>Platform & Store</th>
                <th>Order ID / Waybill</th>
                <th>Buyer</th>
                <th>Product Ordered</th>
                <th>12% VAT</th>
                <th>Total (PHP)</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    Loading marketplace orders...
                  </td>
                </tr>
              ) : filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No matching orders or documents found. Try searching by tracking number, order ID, or document number.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc, idx) => (
                  <tr key={doc.id || doc.documentNumber || idx}>
                    <td>
                      <strong style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>
                        {doc.documentNumber}
                      </strong>
                      {doc.id && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          ID #{doc.id}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${getPlatformBadge(doc.platform)}`}>
                        {doc.platform}
                      </span>
                      <div style={{ fontSize: '0.78rem', marginTop: '4px', fontWeight: 600 }}>
                        {doc.storeName}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {doc.orderId}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        WB: {doc.tracking}
                      </div>
                    </td>
                    <td>{doc.buyerName}</td>
                    <td style={{ maxWidth: '220px', fontSize: '0.82rem' }}>
                      {doc.productSummary !== '—'
                        ? doc.productSummary
                        : doc.lines?.length > 0
                          ? doc.lines.map((l) => `${l.productName} (x${l.qty})`).join(', ')
                          : `${doc.platform} Order Item`}
                    </td>
                    <td style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>
                      ₱{doc.vatAmount}
                    </td>
                    <td style={{ fontWeight: 700 }}>₱{doc.totalAmount}</td>
                    <td>
                      <span
                        className={`badge ${
                          doc.replacedBy ? 'badge-rose' : 'badge-emerald'
                        }`}
                      >
                        {doc.replacedBy ? 'REPLACED' : doc.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                        onClick={() => openDocumentModal(doc)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDoc && (
        <div
          className="scan-modal-backdrop"
          onClick={() => setSelectedDoc(null)}
        >
          <div className="doc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="doc-modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`badge ${getPlatformBadge(selectedDoc.platform)}`}>
                    {selectedDoc.platform}
                  </span>
                  <span className="badge badge-emerald">{selectedDoc.status}</span>
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '8px', fontFamily: 'monospace' }}>
                  {selectedDoc.documentNumber}
                </h2>
                <div className="page-subtitle">
                  Document ID: {selectedDoc.id || '—'} · Issued: {selectedDoc.issuedAt}
                </div>
              </div>

              <button
                type="button"
                className="scan-modal-close"
                style={{ position: 'static' }}
                onClick={() => setSelectedDoc(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {detailLoading && (
              <p className="page-subtitle" style={{ marginBottom: '12px' }}>
                Loading complete document details...
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
                  {selectedDoc.platform} · {selectedDoc.storeName}
                </div>
              </div>
              <div>
                <div className="order-field-label">Order ID</div>
                <div className="order-field-val" style={{ fontFamily: 'monospace' }}>
                  {selectedDoc.orderId}
                </div>
              </div>
              <div>
                <div className="order-field-label">Waybill Tracking</div>
                <div className="order-field-val" style={{ fontFamily: 'monospace' }}>
                  {selectedDoc.tracking}
                </div>
              </div>
              <div>
                <div className="order-field-label">Buyer</div>
                <div className="order-field-val">{selectedDoc.buyerName}</div>
              </div>
              <div>
                <div className="order-field-label">TIN</div>
                <div className="order-field-val">{selectedDoc.buyerTin}</div>
              </div>
              <div>
                <div className="order-field-label">VATable Sales (Net)</div>
                <div className="order-field-val">₱{selectedDoc.vatableSales}</div>
              </div>
              <div>
                <div className="order-field-label">12% VAT Amount</div>
                <div className="order-field-val" style={{ color: 'var(--accent-emerald)' }}>
                  ₱{selectedDoc.vatAmount}
                </div>
              </div>
              <div>
                <div className="order-field-label">Total Amount (VAT Inc.)</div>
                <div className="order-field-val" style={{ color: 'var(--primary)' }}>
                  ₱{selectedDoc.totalAmount}
                </div>
              </div>
            </div>

            {(selectedDoc.replaces || selectedDoc.replacedBy) && (
              <div className="doc-section-block">
                <div className="doc-section-heading">
                  <ArrowLeftRight size={15} /> Document Replacement Lineage
                </div>
                <div className="doc-lineage-row">
                  {selectedDoc.replaces && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        const target =
                          typeof selectedDoc.replaces === 'object'
                            ? selectedDoc.replaces.id
                            : selectedDoc.replaces;
                        if (target) openDocumentModal(target);
                      }}
                    >
                      Replaces:{' '}
                      {typeof selectedDoc.replaces === 'object'
                        ? selectedDoc.replaces.document_number || `#${selectedDoc.replaces.id}`
                        : selectedDoc.replaces}
                    </button>
                  )}
                  {selectedDoc.replacedBy && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        const target =
                          typeof selectedDoc.replacedBy === 'object'
                            ? selectedDoc.replacedBy.id
                            : selectedDoc.replacedBy;
                        if (target) openDocumentModal(target);
                      }}
                    >
                      Replaced By:{' '}
                      {typeof selectedDoc.replacedBy === 'object'
                        ? selectedDoc.replacedBy.document_number || `#${selectedDoc.replacedBy.id}`
                        : selectedDoc.replacedBy}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="doc-section-block">
              <div className="doc-section-heading">
                <Package size={15} /> Product Ordered by Customer ({selectedDoc.lines?.length || 1})
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
                    {(selectedDoc.lines && selectedDoc.lines.length > 0
                      ? selectedDoc.lines
                      : [
                          {
                            id: 1,
                            productName:
                              selectedDoc.productSummary !== '—'
                                ? selectedDoc.productSummary
                                : `${selectedDoc.platform} Order #${selectedDoc.orderId}`,
                            sku: '',
                            qty: 1,
                            unitPrice: selectedDoc.totalAmount,
                            vatAmount: selectedDoc.vatAmount,
                            lineTotal: selectedDoc.totalAmount
                          }
                        ]
                    ).map((line, i) => (
                      <tr key={line.id || i}>
                        <td>
                          <strong>{line.productName}</strong>
                          {line.sku && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
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

            <div className="doc-section-block">
              <div className="doc-section-heading">
                <Printer size={15} /> Print History ({selectedDoc.prints?.length || 0})
              </div>
              {!selectedDoc.prints || selectedDoc.prints.length === 0 ? (
                <p className="page-subtitle">No print records logged yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Printed At</th>
                        <th>Station</th>
                        <th>User</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDoc.prints.map((pr, i) => (
                        <tr key={pr.id || i}>
                          <td>{pr.printed_at || pr.created_at || '—'}</td>
                          <td>{pr.station_code || pr.station || '—'}</td>
                          <td>{pr.printed_by || pr.user || '—'}</td>
                          <td>{pr.reason || pr.reprint_reason || 'Original Print'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedDoc.creditNotes && selectedDoc.creditNotes.length > 0 && (
              <div className="doc-section-block">
                <div className="doc-section-heading">
                  <FileText size={15} /> Credit Notes ({selectedDoc.creditNotes.length})
                </div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Credit Note #</th>
                        <th>Reason</th>
                        <th>Amount</th>
                        <th>Issued At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDoc.creditNotes.map((cn, i) => (
                        <tr key={cn.id || i}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                            {cn.document_number || cn.number || `CN-${cn.id || i + 1}`}
                          </td>
                          <td>{cn.reason || cn.note || 'Return / Refund'}</td>
                          <td>₱{cn.total_amount || cn.amount || '0.00'}</td>
                          <td>{cn.issued_at || cn.created_at || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
