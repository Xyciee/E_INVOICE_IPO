import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Receipt,
  FileCheck,
  Clock,
  ShoppingCart,
  TrendingUp,
  ArrowUpRight,
  Send,
  RefreshCw,
  AlertCircle,
  Filter,
  X
} from 'lucide-react';
import { api } from '../services/apiClient';
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

// Normalize common marketplace fields from invoice API records.
// Keep the original record untouched; unrecognized records do not match a specific shop.
const normalizeMarketplace = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function getDocumentStore(doc) {
  const fields = [doc.store_id, doc.shop_id, doc.marketplace_store_id, doc.store_name,
  doc.shop_name, doc.store, doc.shop, doc.seller_name, doc.marketplace_shop];
  const candidates = fields.map((field) => normalizeMarketplace(
    typeof field === 'object' && field !== null ? (field.id || field.name || field.code) : field
  )).filter(Boolean);
  return MARKETPLACE_STORES.find((store) =>
    candidates.some((candidate) => candidate === normalizeMarketplace(store.id) ||
      candidate === normalizeMarketplace(store.name))
  ) || null;
}

function getDocumentPlatform(doc) {
  const direct = normalizeMarketplace(doc.platform || doc.marketplace || doc.channel || doc.sales_channel);
  const matched = MARKETPLACE_STORES.find((store) =>
    direct === normalizeMarketplace(store.platform) || direct === normalizeMarketplace(store.platform.replace(' Shop', ''))
  );
  return matched?.platform || getDocumentStore(doc)?.platform || null;
}

// Converts points [{x, y}, ...] to a smooth SVG cubic Bezier wave path string
function getSmoothWavePath(pts) {
  if (!pts || pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function DashboardPage({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentsError, setDocumentsError] = useState(false);
  const [prepackOrders, setPrepackOrders] = useState([]);
  const [creditCandidates, setCreditCandidates] = useState([]);
  const [unresolvedScans, setUnresolvedScans] = useState([]);
  const [activePointIndex, setActivePointIndex] = useState(null);
  const [showChartFilters, setShowChartFilters] = useState(true);
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [selectedShop, setSelectedShop] = useState('all');
  const chartFilterActive = selectedPlatform !== 'all' || selectedShop !== 'all';
  const visibleShops = MARKETPLACE_STORES.filter((store) => selectedPlatform === 'all' || store.platform === selectedPlatform);
  const chartDocuments = useMemo(() => documents.filter((doc) => {
    if (!doc) return false;
    if (selectedPlatform !== 'all' && getDocumentPlatform(doc) !== selectedPlatform) return false;
    if (selectedShop !== 'all' && getDocumentStore(doc)?.id !== selectedShop) return false;
    return true;
  }), [documents, selectedPlatform, selectedShop]);


  // Fetch live operational data from backend endpoints
  const loadDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [docsRes, prepackRes, candidatesRes, scansRes] = await Promise.allSettled([
        api.get('/api/documents'),
        api.get('/api/prepack'),
        api.get('/api/credit-notes/candidates'),
        api.get('/api/scans/unresolved')
      ]);

      // 1. Issued Invoices / Documents
      if (docsRes.status === 'fulfilled' && docsRes.value?.ok && docsRes.value.data) {
        const rawDocs = docsRes.value.data;
        const list = Array.isArray(rawDocs) ? rawDocs : (rawDocs.results || rawDocs.documents || []);
        setDocuments(list);
        setDocumentsError(false);
      } else {
        setDocuments([]);
        setDocumentsError(true);
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
    if (!Array.isArray(chartDocuments)) return 0;
    return chartDocuments.reduce((sum, doc) => {
      if (!doc) return sum;
      const val = parseFloat(doc.total_amount || doc.amount || doc.total || 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [chartDocuments]);

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

  // Revenue trajectory is sourced exclusively from GET /api/documents.
  // Use the invoice date (not record creation date) to group 2026 revenue.
  const monthlyData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const aggregates = months.map((month) => ({ month, val: 0, invoices: 0 }));

    chartDocuments.forEach((doc) => {
      const dateStr = doc.issue_date || doc.invoice_date || doc.date || doc.created_at;
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime()) || date.getFullYear() !== 2026) return;

      const amount = Number(String(doc.total_amount ?? doc.amount ?? doc.total ?? 0).replace(/,/g, ''));
      const bucket = aggregates[date.getMonth()];
      bucket.val += Number.isFinite(amount) ? amount : 0;
      bucket.invoices += 1;
    });

    return aggregates;
  }, [chartDocuments]);

  const hasInvoiceData = monthlyData.some((month) => month.invoices > 0);

  // Chart Geometry calculations
  const chartW = 560;
  const chartH = 180;
  const paddingX = 40;
  const paddingY = 24;

  const points = useMemo(() => {
    if (!monthlyData.length) return [];
    const maxVal = Math.max(...monthlyData.map((d) => d.val), 1);
    return monthlyData.map((d, i) => {
      const x = paddingX + (i / (monthlyData.length - 1)) * (chartW - paddingX * 2);
      const y = chartH - paddingY - (d.val / maxVal) * (chartH - paddingY * 2);
      return { x, y, val: d.val, invoices: d.invoices, month: d.month };
    });
  }, [monthlyData]);

  // Set default active point
  useEffect(() => {
    if (points.length > 0 && activePointIndex === null) {
      setActivePointIndex(points.length - 1);
    }
  }, [points, activePointIndex]);

  const activePoint = points[activePointIndex] || points[points.length - 1];

  // Build smooth cubic bezier wave curve
  const pathData = useMemo(() => {
    return getSmoothWavePath(points);
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
      trend: chartDocuments.length > 0 ? `${chartDocuments.length} BIR Documents` : 'Pre-Launch Stage',
      isPositive: chartDocuments.length > 0,
      icon: Receipt,
      color: 'rgba(59, 130, 246, 0.1)',
      iconColor: '#3b82f6'
    },
    {
      title: 'Invoices Issued (BIR EIS)',
      value: `${chartDocuments.length}`,
      trend: chartDocuments.length > 0 ? 'Live in Ledger' : 'Mandatory 31 Dec 2026',
      isPositive: chartDocuments.length > 0,
      icon: FileCheck,
      color: 'rgba(16, 185, 129, 0.1)',
      iconColor: '#10b981'
    },
    {
      title: 'Pre-Pack Order Queue',
      value: `${prepackOrders.length} Orders`,
      trend: `${readyToPackCount} Ready to Pack`,
      isPositive: readyToPackCount > 0,
      icon: ShoppingCart,
      color: 'rgba(139, 92, 246, 0.1)',
      iconColor: '#8b5cf6'
    },
    {
      title: 'Exceptions & Reissues',
      value: `${pendingActionsCount} Items`,
      trend: `${creditCandidates.length} Reissues • ${unresolvedScans.length} Scans`,
      isPositive: pendingActionsCount === 0,
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

      {/* Dashboard invoice filters — directly below the heading. */}
      <section aria-label="Invoice dashboard filters" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => setShowChartFilters((open) => !open)}
          aria-expanded={showChartFilters}
          aria-controls="revenue-chart-filters"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', marginBottom: showChartFilters ? 10 : 0, fontSize: '0.8rem' }}
        >
          <Filter size={15} /> Platform &amp; Shop Filters{chartFilterActive ? ' • Active' : ''}
        </button>
        {showChartFilters && (
          <div id="revenue-chart-filters" style={{ display: 'flex', alignItems: 'end', flexWrap: 'wrap', gap: 12, padding: '12px', marginBottom: 0, border: '1px solid var(--border-light, #e2e8f0)', borderRadius: 10, background: 'var(--bg-app, #f8fafc)' }}>
            <label style={{ display: 'grid', gap: 5, flex: '1 1 160px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Platform
              <select value={selectedPlatform} onChange={(e) => { setSelectedPlatform(e.target.value); setSelectedShop('all'); setActivePointIndex(null); }} style={{ width: '100%', padding: '8px', borderRadius: 7, border: '1px solid var(--border-light, #e2e8f0)', background: 'var(--bg-card, #fff)', color: 'var(--text-main)' }}>
                <option value="all">All Platforms</option>
                <option value="Shopee">Shopee</option>
                <option value="Lazada">Lazada</option>
                <option value="TikTok Shop">TikTok Shop</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, flex: '1 1 180px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Shop
              <select value={selectedShop} onChange={(e) => { setSelectedShop(e.target.value); setActivePointIndex(null); }} style={{ width: '100%', padding: '8px', borderRadius: 7, border: '1px solid var(--border-light, #e2e8f0)', background: 'var(--bg-card, #fff)', color: 'var(--text-main)' }}>
                <option value="all">All Shops</option>
                {visibleShops.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-outline" onClick={() => { setSelectedPlatform('all'); setSelectedShop('all'); setActivePointIndex(null); }} disabled={!chartFilterActive} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 10px', fontSize: '0.78rem' }}><X size={13} /> Reset</button>
            <div style={{ width: '100%', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
              {chartFilterActive ? `${chartDocuments.length} matching invoice(s). Records without matching marketplace details are excluded.` : 'All marketplaces and shops. Filters apply to invoice-based dashboard metrics and charts.'}
            </div>
          </div>
        )}
      </section>

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
                  className={`trend-pill ${stat.isPositive ? 'trend-positive' : 'trend-negative'}`}
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

      {/* Main Content Grid: Wave Chart & Pie Chart */}
      <div className="dashboard-main-grid">
        {/* CHART: Revenue Wave Trajectory & EIS Readiness */}
        <div className="card-section dashboard-card" style={{ position: 'relative' }}>
          <div className="card-section-header">
            <div>
              <h2 className="card-section-title">E-Invoice Revenue Wave Trajectory</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {'Monthly invoice revenue from /api/documents (Hover points to inspect)'}
              </div>
            </div>
            <span className={`badge ${hasInvoiceData ? 'badge-primary' : 'badge-amber'}`}>
              {documentsError ? 'API Unavailable' : hasInvoiceData ? 'API Data' : 'No 2026 Invoices'}
            </span>
          </div>

          <div className="dashboard-card-body">
            {/* Interactive Floating Tooltip */}
            {activePoint && (
              <div className="chart-tooltip-box">
                <span className="chart-tooltip-label">
                  {activePoint.month} 2026 • {activePoint.invoices || 0} Invoices
                </span>
                <span className="chart-tooltip-val">
                  ₱{Number(activePoint.val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* SVG Wave Chart with Soft Glow Shadow */}
            <div className="chart-container" style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
              <svg
                className="chart-svg"
                viewBox={`0 0 ${chartW} ${chartH}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ width: '100%', height: 'auto', overflow: 'visible' }}
              >
                <defs>
                  {/* Wave Area Fill Gradient */}
                  <linearGradient id="waveAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
                    <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                  </linearGradient>

                  {/* Wave Stroke Shadow Filter */}
                  <filter id="waveGlowShadow" x="-20%" y="-20%" width="140%" height="150%">
                    <feDropShadow dx="0" dy="8" stdDeviation="4" floodColor="#3b82f6" floodOpacity="0.18" />
                  </filter>
                </defs>

                {/* Background Grid Lines */}
                {[0.25, 0.5, 0.75, 1].map((ratio, i) => {
                  const y = chartH - paddingY - ratio * (chartH - paddingY * 2);
                  return (
                    <line
                      key={i}
                      x1={paddingX}
                      y1={y}
                      x2={chartW - paddingX}
                      y2={y}
                      stroke="var(--border-light, #e2e8f0)"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Area Wave */}
                <path d={areaData} fill="url(#waveAreaGradient)" />

                {/* Main Wave Line with Shadow */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#waveGlowShadow)"
                />

                {/* Vertical Guide Line on Hover */}
                {points[activePointIndex] && (
                  <line
                    x1={points[activePointIndex].x}
                    y1={points[activePointIndex].y}
                    x2={points[activePointIndex].x}
                    y2={chartH - paddingY}
                    stroke="#3b82f6"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Wave Data Points */}
                {points.map((pt, idx) => {
                  const isActive = idx === activePointIndex;
                  return (
                    <g key={idx}>
                      {/* Pulsing Outer Ring on Active */}
                      {isActive && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={11}
                          fill="#3b82f6"
                          fillOpacity="0.2"
                        />
                      )}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isActive ? 6 : 4}
                        fill={isActive ? '#ffffff' : '#3b82f6'}
                        stroke="#3b82f6"
                        strokeWidth={isActive ? '3' : '2'}
                        style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                        onMouseEnter={() => setActivePointIndex(idx)}
                        onClick={() => setActivePointIndex(idx)}
                      />
                      <text
                        x={pt.x}
                        y={chartH - 4}
                        textAnchor="middle"
                        style={{
                          fontSize: '11px',
                          fontWeight: isActive ? '700' : '500',
                          fill: isActive ? 'var(--primary, #3b82f6)' : 'var(--text-subtle, #94a3b8)',
                          cursor: 'pointer'
                        }}
                        onClick={() => setActivePointIndex(idx)}
                      >
                        {pt.month}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {!loading && (documentsError || !hasInvoiceData) && (
              <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {documentsError
                  ? 'Unable to load /api/documents. Check the API connection and refresh.'
                  : 'No matching 2026 invoices found in /api/documents. Showing ₱0 for months without records; no sample or projected revenue is used.'}
              </div>
            )}
          </div>
        </div>

        {/* TAX BREAKDOWN — concise overview, no invoice table */}
        <div className="card-section dashboard-card">
          <div className="card-section-header">
            <div>
              <h2 className="card-section-title">Tax Split Overview</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Reported VAT and sales composition
              </div>
            </div>
            <button
              className="btn btn-outline"
              style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => onNavigate && onNavigate('invoices')}
            >
              Invoice Tracker <ArrowUpRight size={14} />
            </button>
          </div>

          <div className="dashboard-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {(() => {
              // Only use explicit tax figures supplied by the API. Do not infer
              // VAT, zero-rated, or exempt sales from an invoice's gross amount.
              const fields = [
                { label: 'VATable Sales', keys: ['vatable_sales', 'vatable_amount', 'taxable_sales'], color: '#3b82f6' },
                { label: 'Output VAT', keys: ['vat_amount', 'output_vat', 'vat_output'], color: '#10b981' },
                { label: 'Zero-Rated Sales', keys: ['zero_rated_sales', 'zero_rated_amount'], color: '#f59e0b' },
                { label: 'VAT-Exempt Sales', keys: ['exempt_sales', 'vat_exempt_sales'], color: '#8b5cf6' }
              ];
              const values = fields.map((field) => ({
                ...field,
                amount: (chartDocuments || []).reduce((sum, doc) => {
                  if (!doc) return sum;
                  const key = field.keys.find((name) => doc[name] !== undefined && doc[name] !== null && doc[name] !== '');
                  if (!key) return sum;
                  const n = Number(String(doc[key]).replace(/,/g, ''));
                  return sum + (Number.isFinite(n) ? Math.max(n, 0) : 0);
                }, 0)
              }));
              const hasTaxFields = (chartDocuments || []).some((doc) =>
                doc && fields.some((field) => field.keys.some((name) => doc[name] !== undefined && doc[name] !== null && doc[name] !== ''))
              );
              const total = values.reduce((sum, item) => sum + item.amount, 0);
              const circumference = 2 * Math.PI * 42;
              let offset = 0;
              const segments = values.map((item) => {
                const length = total > 0 ? (item.amount / total) * circumference : 0;
                const segment = { ...item, length, offset };
                offset += length;
                return segment;
              });
              const peso = (amount) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '20px', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: 14, background: 'var(--bg-app, #f8fafc)', flexWrap: 'wrap' }}>
                    <div style={{ width: 142, height: 142, position: 'relative', flexShrink: 0, margin: '0 auto' }}>
                      <svg viewBox="0 0 120 120" role="img" aria-label="Reported tax composition" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                        <circle cx="60" cy="60" r="42" fill="none" stroke="var(--border-light, #e2e8f0)" strokeWidth="13" />
                        {segments.filter((item) => item.length > 0).map((item) => (
                          <circle key={item.label} cx="60" cy="60" r="42" fill="none" stroke={item.color} strokeWidth="13"
                            strokeDasharray={`${item.length} ${circumference - item.length}`}
                            strokeDashoffset={-item.offset} strokeLinecap="butt" />
                        ))}
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
                        <strong style={{ fontSize: '1.35rem', color: 'var(--text-main)' }}>{hasTaxFields ? `${chartDocuments.length}` : '—'}</strong>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Documents</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 13, flex: '1 1 190px' }}>
                      {values.map((item) => (
                        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', fontSize: '0.79rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
                            <span style={{ width: 9, height: 9, flexShrink: 0, borderRadius: 3, background: item.color }} />
                            {item.label}
                          </span>
                          <strong style={{ color: 'var(--text-main)', whiteSpace: 'nowrap' }}>{hasTaxFields ? peso(item.amount) : '—'}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  {!hasTaxFields && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: '0.78rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                      Tax breakdown will appear when invoice records include VATable, VAT, zero-rated, or exempt amounts. No estimated tax figures are shown.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 14, borderTop: '1px solid var(--border-light, #e2e8f0)' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Invoices in ledger</div>
                      <strong style={{ color: 'var(--text-main)', fontSize: '1.1rem' }}>{chartDocuments.length.toLocaleString('en-PH')}</strong>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Total billed</div>
                      <strong style={{ color: 'var(--text-main)', fontSize: '1.1rem' }}>{peso(totalRevenue)}</strong>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
