import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Receipt,
  FileCheck,
  Clock,
  ShoppingCart,
  TrendingUp,
  Download,
  ArrowUpRight,
  MoreVertical,
  Activity,
  Send,
  RefreshCw,
  Package,
  Layers,
  ShieldCheck,
  Store,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { api } from '../services/apiClient';
import Pagination, { usePagination } from '../components/common/Pagination';
import './pages.css';

// The 9 live marketplace stores operated by Ipolymer Solutions Corp
const MARKETPLACE_STORES = [
  { id: 'qualisafe_shopee', name: 'Qualisafe Official Store', platform: 'Shopee', color: '#ee4d2d' },
  { id: 'first_protect_shopee', name: 'First Protect Shopee', platform: 'Shopee', color: '#ee4d2d' },
  { id: 'baby_bright_shopee', name: 'Baby Bright Shopee', platform: 'Shopee', color: '#ee4d2d' },
  { id: 'qualisafe_lazada', name: 'Qualisafe Lazada', platform: 'Lazada', color: '#0f146d' },
  { id: 'first_protect_lazada', name: 'First Protect PH', platform: 'Lazada', color: '#0f146d' },
  { id: 'baby_bright_lazada', name: 'Baby Bright Lazada', platform: 'Lazada', color: '#0f146d' },
  { id: 'qualisafe_tiktok', name: 'Qualisafe TikTok', platform: 'TikTok Shop', color: '#111827' },
  { id: 'first_protect_tiktok', name: 'First Protect TikTok', platform: 'TikTok Shop', color: '#111827' },
  { id: 'baby_bright_tiktok', name: 'Baby Bright Official', platform: 'TikTok Shop', color: '#111827' }
];

export default function DashboardPage({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [prepackOrders, setPrepackOrders] = useState([]);
  const [creditCandidates, setCreditCandidates] = useState([]);
  const [unresolvedScans, setUnresolvedScans] = useState([]);
  const [activePointIndex, setActivePointIndex] = useState(null);

  // Pagination for Recently Processed Invoices
  const {
    currentPage: docsPage,
    setCurrentPage: setDocsPage,
    pageSize: docsPageSize,
    setPageSize: setDocsPageSize,
    totalItems: totalDocs,
    paginatedItems: paginatedDocs
  } = usePagination(documents, 5);

  // Fetch live operational data from backend endpoints
  const loadDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [docsRes, prepackRes, candidatesRes, scansRes] = await Promise.allSettled([
        api.get('/api/documents?q='),
        api.get('/api/prepack'),
        api.get('/api/credit-notes/candidates'),
        api.get('/api/scans/unresolved')
      ]);

      // 1. Issued Invoices / Documents
      if (docsRes.status === 'fulfilled' && docsRes.value?.ok && docsRes.value.data) {
        const rawDocs = docsRes.value.data;
        const list = Array.isArray(rawDocs) ? rawDocs : (rawDocs.results || rawDocs.documents || []);
        setDocuments(list);
      } else {
        setDocuments([]);
      }

      // 2. Marketplace Pre-pack queue orders
      if (prepackRes.status === 'fulfilled' && prepackRes.value?.ok && prepackRes.value.data) {
        const rawOrders = prepackRes.value.data;
        const list = Array.isArray(rawOrders) ? rawOrders : (rawOrders.results || rawOrders.orders || []);
        setPrepackOrders(list);
      } else {
        setPrepackOrders([]);
      }

      // 3. Customer credit note / reissue requests
      if (candidatesRes.status === 'fulfilled' && candidatesRes.value?.ok && candidatesRes.value.data) {
        const rawCandidates = candidatesRes.value.data;
        const list = Array.isArray(rawCandidates) ? rawCandidates : (rawCandidates.results || rawCandidates.candidates || []);
        setCreditCandidates(list);
      } else {
        setCreditCandidates([]);
      }

      // 4. Unresolved scan exceptions
      if (scansRes.status === 'fulfilled' && scansRes.value?.ok && scansRes.value.data) {
        const rawScans = scansRes.value.data;
        const list = Array.isArray(rawScans) ? rawScans : (rawScans.results || rawScans.scans || []);
        setUnresolvedScans(list);
      } else {
        setUnresolvedScans([]);
      }
    } catch (err) {
      console.warn('Dashboard data fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Computed metrics from real data
  const totalRevenue = useMemo(() => {
    if (!Array.isArray(documents)) return 0;
    return documents.reduce((sum, doc) => {
      if (!doc) return sum;
      const val = parseFloat(doc.total_amount || doc.amount || doc.total || 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [documents]);

  const readyToPackCount = useMemo(() => {
    if (!Array.isArray(prepackOrders)) return 0;
    return prepackOrders.filter((order) => {
      if (!order) return false;
      const state = String(order.state || '').toLowerCase();
      const hasHold = Boolean(order.hold_reason);
      return state === 'ready' || (!hasHold && state !== 'blocked' && state !== 'before_start');
    }).length;
  }, [prepackOrders]);

  const exceptionsCount = useMemo(() => {
    if (!Array.isArray(prepackOrders)) return 0;
    return Math.max(0, prepackOrders.length - readyToPackCount);
  }, [prepackOrders, readyToPackCount]);

  const pendingActionsCount =
    (Array.isArray(creditCandidates) ? creditCandidates.length : 0) +
    (Array.isArray(unresolvedScans) ? unresolvedScans.length : 0);

  // Monthly Trajectory aggregated from real document records
  const monthlyData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonthIndex = new Date().getMonth();
    const activeMonths = months.slice(0, Math.max(currentMonthIndex + 1, 10));

    const aggregates = activeMonths.map((m) => ({
      month: m,
      val: 0,
      invoices: 0
    }));

    if (documents.length > 0) {
      documents.forEach((doc) => {
        const dateStr = doc.created_at || doc.issue_date || doc.date;
        if (dateStr) {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) {
            const mIdx = d.getMonth();
            if (aggregates[mIdx]) {
              aggregates[mIdx].val += parseFloat(doc.total_amount || doc.amount || 0) || 0;
              aggregates[mIdx].invoices += 1;
            }
          }
        }
      });
    }

    return aggregates.map((item) => ({
      ...item,
      label: `₱${(item.val / 1000).toFixed(0)}K`
    }));
  }, [documents]);

  const hasInvoiceData = documents.length > 0 && totalRevenue > 0;

  // Chart Geometry calculations
  const chartW = 560;
  const chartH = 180;
  const paddingX = 40;
  const paddingY = 24;

  const points = useMemo(() => {
    if (monthlyData.length === 0) return [];
    const maxVal = Math.max(...monthlyData.map((d) => d.val), 50000);
    return monthlyData.map((d, i) => {
      const denom = monthlyData.length > 1 ? monthlyData.length - 1 : 1;
      const x = paddingX + (i / denom) * (chartW - paddingX * 2);
      const y = chartH - paddingY - (d.val / maxVal) * (chartH - paddingY * 2);
      return { x, y, ...d };
    });
  }, [monthlyData]);

  // Set default active point
  useEffect(() => {
    if (points.length > 0 && activePointIndex === null) {
      setActivePointIndex(points.length - 1);
    }
  }, [points, activePointIndex]);

  const activePoint = points[activePointIndex] || points[points.length - 1];

  // Build smooth cubic bezier curve
  const pathData = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, pt, idx, arr) => {
      if (idx === 0) return `M ${pt.x} ${pt.y}`;
      const prev = arr[idx - 1];
      const cpX = (prev.x + pt.x) / 2;
      return `${acc} C ${cpX} ${prev.y}, ${cpX} ${pt.y}, ${pt.x} ${pt.y}`;
    }, '');
  }, [points]);

  const areaData = useMemo(() => {
    if (points.length === 0 || !pathData) return '';
    return `${pathData} L ${points[points.length - 1].x} ${chartH - paddingY} L ${points[0].x} ${chartH - paddingY} Z`;
  }, [pathData, points]);

  // Top Metric Cards tied directly to live data
  const stats = [
    {
      title: 'Total Revenue Billed',
      value: `₱${totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      trend: documents.length > 0 ? `${documents.length} BIR Documents` : 'Pre-Launch Stage',
      isPositive: documents.length > 0,
      timeframe: 'Write-once BIR ledger',
      icon: Receipt,
      color: 'rgba(59, 130, 246, 0.1)',
      iconColor: '#3b82f6'
    },
    {
      title: 'Invoices Issued (BIR EIS)',
      value: `${documents.length}`,
      trend: documents.length > 0 ? 'Live in Ledger' : 'Mandatory 31 Dec 2026',
      isPositive: documents.length > 0,
      timeframe: 'Immutable archive',
      icon: FileCheck,
      color: 'rgba(16, 185, 129, 0.1)',
      iconColor: '#10b981'
    },
    {
      title: 'Pre-Pack Order Queue',
      value: `${prepackOrders.length} Orders`,
      trend: `${readyToPackCount} Ready to Pack`,
      isPositive: readyToPackCount > 0,
      timeframe: `${exceptionsCount} in hold state`,
      icon: ShoppingCart,
      color: 'rgba(139, 92, 246, 0.1)',
      iconColor: '#8b5cf6'
    },
    {
      title: 'Exceptions & Reissues',
      value: `${pendingActionsCount} Items`,
      trend: `${creditCandidates.length} Reissues • ${unresolvedScans.length} Scans`,
      isPositive: pendingActionsCount === 0,
      timeframe: 'Awaiting resolution',
      icon: Clock,
      color: 'rgba(245, 158, 11, 0.1)',
      iconColor: '#f59e0b'
    }
  ];

  return (
    <div className="dashboard-page animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">ISC E-Invoice Executive Dashboard</h1>
          <p className="page-subtitle">
            BIR RMC 98-2026 EIS Compliance, write-once ledger, and marketplace order fulfillment operations.
          </p>
        </div>

        <div className="page-actions">
          <button
            className="btn btn-outline"
            onClick={() => loadDashboardData(true)}
            disabled={refreshing || loading}
            title="Refresh dashboard from backend APIs"
          >
            <RefreshCw size={15} className={refreshing || loading ? 'spinner' : ''} />
            <span>{refreshing ? 'Updating...' : 'Refresh'}</span>
          </button>
          <button
            className="btn btn-outline"
            onClick={() => onNavigate && onNavigate('orders')}
          >
            <ShoppingCart size={16} />
            <span>Pre-Pack Orders ({prepackOrders.length})</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onNavigate && onNavigate('invoices')}
          >
            <Send size={16} />
            <span>E-Invoice Tracker</span>
          </button>
        </div>
      </div>

      {/* Compliance & System Status Banner */}
      <div className="compliance-banner">
        <div className="compliance-banner-left">
          <div className="compliance-badge-icon">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="compliance-banner-title">
              BIR RMC 98-2026 EIS & PTI Compliance Staging
              <span className="badge badge-emerald">System Connected</span>
            </div>
            <div className="compliance-banner-sub">
              Organization: <strong>Ipolymer Solutions Corp.</strong> • 9 Marketplace Stores across Shopee, Lazada & TikTok Shop
            </div>
          </div>
        </div>
        <div className="compliance-banner-meta">
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Filing Target: </span>
            <strong style={{ color: 'var(--text-main)' }}>26 Nov 2026 (PTI)</strong>
          </div>
          <span style={{ color: 'var(--border-light)' }}>|</span>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Mandatory Go-Live: </span>
            <strong style={{ color: 'var(--accent-emerald)' }}>31 Dec 2026</strong>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="stats-grid">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-label">{stat.title}</span>
                <div
                  className="stat-card-icon-wrap"
                  style={{ backgroundColor: stat.color, color: stat.iconColor }}
                >
                  <Icon size={20} />
                </div>
              </div>
              <div className="stat-card-value">{loading ? '...' : stat.value}</div>
              <div className="stat-card-footer">
                <span
                  className={`trend-pill ${
                    stat.isPositive ? 'trend-positive' : 'trend-negative'
                  }`}
                >
                  <TrendingUp size={12} />
                  {stat.trend}
                </span>
                <span className="trend-description">{stat.timeframe}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 9 Marketplace Stores Overview Strip */}
      <div className="card-section" style={{ padding: '14px 18px', marginBottom: '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 700 }}>
            <Store size={16} style={{ color: 'var(--primary)' }} />
            <span>9 Connected Marketplace Stores (Qualisafe, First Protect, Baby Bright)</span>
          </div>
          <button
            className="btn btn-outline"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            onClick={() => onNavigate && onNavigate('orders')}
          >
            Manage Stores <ArrowUpRight size={13} />
          </button>
        </div>

        <div className="stores-strip">
          {MARKETPLACE_STORES.map((store) => {
            const storeOrders = Array.isArray(prepackOrders)
              ? prepackOrders.filter((o) => {
                  if (!o) return false;
                  const rawStoreId =
                    typeof o.store_id === 'object' && o.store_id !== null
                      ? (o.store_id.id || o.store_id.code || '')
                      : (o.store_id ?? o.store ?? '');
                  const sId = String(rawStoreId).toLowerCase().trim();
                  const sName = String(o.store_name ?? '').toLowerCase().trim();
                  const targetId = String(store.id).toLowerCase();
                  const targetName = String(store.name).toLowerCase();
                  return sId === targetId || sName === targetName || (sId && targetId.includes(sId));
                })
              : [];
            return (
              <div
                key={store.id}
                className="store-strip-pill"
                onClick={() => onNavigate && onNavigate('orders')}
                title={`Click to view ${store.name} in Orders`}
              >
                <span className="store-strip-dot" style={{ backgroundColor: store.color }} />
                <span>{store.name}</span>
                <span className="badge badge-primary" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                  {store.platform}
                </span>
                {storeOrders.length > 0 && (
                  <span className="badge badge-amber" style={{ fontSize: '0.68rem', padding: '1px 5px' }}>
                    {storeOrders.length}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content Grid: Revenue Trajectory & Recently Processed Invoices */}
      <div className="dashboard-main-grid">
        {/* CHART: Revenue Trajectory & EIS Readiness */}
        <div className="card-section dashboard-card" style={{ position: 'relative' }}>
          <div className="card-section-header">
            <div>
              <h2 className="card-section-title">E-Invoice Revenue Trajectory</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {hasInvoiceData
                  ? 'Monthly BIR stamped volume (Hover points to inspect)'
                  : 'Live BIR EIS issuance commence 31 Dec 2026 (Pre-launch staging)'}
              </div>
            </div>
            <span className="badge badge-primary">
              {hasInvoiceData ? 'Active Invoicing' : 'Staging Phase'}
            </span>
          </div>

          <div className="dashboard-card-body">
            {hasInvoiceData ? (
              <>
                {/* Interactive Tooltip */}
                {activePoint && (
                  <div className="chart-tooltip-box">
                    <span className="chart-tooltip-label">
                      {activePoint.month} 2026 • {activePoint.invoices} Invoices
                    </span>
                    <span className="chart-tooltip-val">
                      ₱{activePoint.val.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {/* SVG Spline Chart */}
                <div className="chart-container">
                  <svg
                    className="chart-svg"
                    viewBox={`0 0 ${chartW} ${chartH}`}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <defs>
                      <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Grid Lines */}
                    {[0.25, 0.5, 0.75, 1].map((ratio, i) => {
                      const y = chartH - paddingY - ratio * (chartH - paddingY * 2);
                      return (
                        <line
                          key={i}
                          x1={paddingX}
                          y1={y}
                          x2={chartW - paddingX}
                          y2={y}
                          className="chart-axis-line"
                        />
                      );
                    })}

                    {/* Area & Spline */}
                    <path d={areaData} fill="url(#areaGradient)" />
                    <path
                      d={pathData}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Hover indicator */}
                    {points[activePointIndex] && (
                      <line
                        x1={points[activePointIndex].x}
                        y1={points[activePointIndex].y}
                        x2={points[activePointIndex].x}
                        y2={chartH - paddingY}
                        className="chart-hover-indicator"
                      />
                    )}

                    {/* Dots & Labels */}
                    {points.map((pt, idx) => (
                      <g key={idx}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={idx === activePointIndex ? 6 : 4}
                          className={`chart-data-dot ${idx === activePointIndex ? 'active' : ''}`}
                          onMouseEnter={() => setActivePointIndex(idx)}
                          onClick={() => setActivePointIndex(idx)}
                        />
                        <text
                          x={pt.x}
                          y={chartH - 4}
                          textAnchor="middle"
                          className="chart-axis-text"
                          style={{
                            fontWeight: idx === activePointIndex ? '700' : '500',
                            fill: idx === activePointIndex ? 'var(--primary)' : 'var(--text-subtle)'
                          }}
                        >
                          {pt.month}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </>
            ) : (
              /* Informative EIS Launch Readiness Timeline when zero dummy revenue */
              <div className="empty-state-container">
                <div className="empty-state-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                  <Calendar size={26} />
                </div>
                <h3 className="empty-state-title">₱0.00 Billed in Live Ledger</h3>
                <p className="empty-state-text">
                  Per <strong>BIR RMC 98-2026</strong>, mandatory marketplace electronic invoicing commences on{' '}
                  <strong>December 31, 2026</strong>. Current orders are processed through pre-pack staging queues.
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '10px 16px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.8rem',
                    textAlign: 'left'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Packing Scan Generation</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Invoices are stamped automatically upon scanning waybill barcode
                    </div>
                  </div>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: '0.75rem', padding: '5px 10px', whiteSpace: 'nowrap' }}
                    onClick={() => onNavigate && onNavigate('orders')}
                  >
                    View Pre-Pack ({prepackOrders.length})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TABLE: Recently Processed Invoices */}
        <div className="card-section dashboard-card">
          <div className="card-section-header">
            <div>
              <h2 className="card-section-title">Recently Processed Invoices</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {documents.length > 0 ? 'Latest BIR stamped ledger entries' : 'Write-once invoice dispatches'}
              </div>
            </div>
            <button
              className="btn btn-outline"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={() => onNavigate && onNavigate('invoices')}
            >
              Open Tracker <ArrowUpRight size={14} />
            </button>
          </div>

          <div className="dashboard-card-body">
            {Array.isArray(documents) && documents.length > 0 ? (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Customer / Store</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.slice(0, 5).map((doc, idx) => {
                      if (!doc) return null;
                      return (
                        <tr key={doc.id || doc.document_number || idx}>
                          <td style={{ fontWeight: 600 }}>{doc.document_number || doc.id || `INV-${idx + 1}`}</td>
                          <td>{doc.customer_name || doc.store_name || 'Marketplace Customer'}</td>
                          <td style={{ fontWeight: 700 }}>
                            ₱{parseFloat(doc.total_amount || doc.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </td>
                          <td>
                            <span className="badge badge-emerald">{doc.status || 'BIR Stamped'}</span>
                          </td>
                          <td>
                            <button
                              style={{ color: 'var(--text-muted)' }}
                              aria-label="Actions"
                              onClick={() => onNavigate && onNavigate('invoices')}
                            >
                              <MoreVertical size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Clean empty state when no invoices exist */
              <div className="empty-state-container">
                <div className="empty-state-icon">
                  <FileCheck size={26} />
                </div>
                <h3 className="empty-state-title">No Electronic Invoices Issued Yet</h3>
                <p className="empty-state-text">
                  Invoices are created at the packing scan station (<code>POST /api/scan/issue</code>) and permanently
                  registered in the write-once database ledger.
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: '0.8rem' }}
                    onClick={() => onNavigate && onNavigate('orders')}
                  >
                    <Package size={14} /> View Pre-Pack Queue
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: '0.8rem' }}
                    onClick={() => onNavigate && onNavigate('invoices')}
                  >
                    <Send size={14} /> Invoices Tracker
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
