import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  Filter,
  PackageCheck,
  RefreshCw,
  ScanLine,
  ShoppingBag,
  TrendingUp,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/apiClient';
import {
  extractDocumentList,
  normalizeDocumentRecord,
  getPrintedInvoiceRecords
} from '../services/scanService';
import PlatformBadge from '../components/PlatformBadge';
import './pages.css';
import './DashboardPage.css';

const money = (value) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2
  }).format(value || 0);

const number = (value) => new Intl.NumberFormat('en-PH').format(value || 0);

const amount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const platformOf = (record) => {
  const p = String(record.platform || record.marketplace || '').toLowerCase();
  if (p.includes('shopee')) return 'Shopee';
  if (p.includes('tiktok')) return 'TikTok Shop';
  if (p.includes('lazada')) return 'Lazada';
  return 'Other';
};

const shopOf = (record) =>
  String(record.storeName || record.shopName || record.store || '').trim() ||
  'Unspecified shop';

const dateOf = (record) => {
  const raw =
    record.issuedAt ||
    record.lastPrintedAt ||
    record.createdAt ||
    record.invoiceDate ||
    record.date;
  if (!raw || raw === '—') return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const dateLabel = (date) =>
  date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

const uniqueRecords = (records) => {
  const mapped = new Map();
  records.filter(Boolean).forEach((record, index) => {
    const validDocNum =
      record.documentNumber && record.documentNumber !== '—'
        ? record.documentNumber
        : null;
    const validOrderId =
      record.orderId && record.orderId !== '—'
        ? `${record.platform || ''}:${record.orderId}`
        : null;
    const validTrack =
      record.tracking && record.tracking !== '—' ? record.tracking : null;
    const key = String(
      record.id || validDocNum || validOrderId || validTrack || `row-${index}`
    );
    if (!mapped.has(key)) mapped.set(key, record);
  });
  return [...mapped.values()];
};

const DUMMY_ACTIVITY = [
  {
    id: 'dummy-1',
    title: 'Invoice EINV-2026-0104',
    subtitle: 'Shopee · Qualisafe Official Store',
    timeLabel: '2m ago'
  },
  {
    id: 'dummy-2',
    title: 'Waybill Scanned #SPXPH04928174',
    subtitle: 'TikTok Shop · Baby Bright Official',
    timeLabel: '9m ago'
  },
  {
    id: 'dummy-3',
    title: 'Reprinted Thermal Slip',
    subtitle: 'Lazada · First Protect PH',
    timeLabel: '18m ago'
  },
  {
    id: 'dummy-4',
    title: 'Pre-Pack Queue Synced (24 orders)',
    subtitle: 'System Sync · /api/prepack',
    timeLabel: '32m ago'
  },
  {
    id: 'dummy-5',
    title: 'Exported BIR EIS Ledger CSV',
    subtitle: 'Auditor · /api/documents',
    timeLabel: '1h ago'
  }
];

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'blue',
  loading = false,
  style
}) {
  return (
    <div className="dash-stat" style={style}>
      <div className="dash-stat-top">
        <span>{label}</span>
      </div>
      <div className="dash-stat-main">
        <span className={`dash-stat-icon ${tone}`}>
          <Icon size={20} />
        </span>
        <div className="dash-stat-value">
          {loading ? <span className="dash-skeleton" /> : value}
        </div>
      </div>
    </div>
  );
}

function TrendChart({ invoices, range }) {
  const [hovered, setHovered] = useState(null);
  const days = range === '30d' ? 30 : 7;

  const entries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const byDay = new Map();
    invoices.forEach((invoice) => {
      const date = dateOf(invoice);
      if (date) {
        const key = dayKey(date);
        const current = byDay.get(key) || { count: 0, revenue: 0 };
        byDay.set(key, {
          count: current.count + 1,
          revenue: current.revenue + amount(invoice.totalAmount)
        });
      }
    });
    return Array.from({ length: days }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() - days + i + 1);
      return {
        date,
        label: dateLabel(date),
        ...(byDay.get(dayKey(date)) || { count: 0, revenue: 0 })
      };
    });
  }, [invoices, days]);

  const width = 750;
  const height = 220;
  const left = 12;
  const right = 12;
  const top = 14;
  const bottom = 24;
  const max = Math.max(1, ...entries.map((x) => x.revenue));
  const points = entries.map((x, i) => ({
    ...x,
    x: left + (i * (width - left - right)) / Math.max(1, entries.length - 1),
    y: top + (1 - x.revenue / max) * (height - top - bottom)
  }));
  const path = points
    .map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
  const area = `${path} L ${points[points.length - 1].x} ${height - bottom} L ${points[0].x
    } ${height - bottom} Z`;
  const selected = hovered !== null ? points[hovered] : null;
  const datedCount = entries.reduce((sum, day) => sum + day.count, 0);

  return (
    <div
      className="dash-chart-shell"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <div className="dash-chart-summary">
        <span>
          <span className="dash-legend-dot" /> Invoiced revenue
        </span>
        <span>{number(datedCount)} invoices with dates</span>
      </div>
      <div className="dash-chart-area" style={{ flex: 1, minHeight: 0 }}>
        <svg
          className="dash-chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Invoiced revenue for the last ${days} days`}
        >
          <defs>
            <linearGradient id="dashRevenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f75ff" stopOpacity=".20" />
              <stop offset="100%" stopColor="#4f75ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((step) => (
            <line
              key={step}
              x1="0"
              x2={width}
              y1={top + step * (height - top - bottom)}
              y2={top + step * (height - top - bottom)}
              stroke="var(--border-light)"
              strokeDasharray="4 5"
            />
          ))}
          <path d={area} fill="url(#dashRevenueFill)" />
          <path
            d={path}
            fill="none"
            stroke="#4d70ee"
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {selected && (
            <line
              x1={selected.x}
              x2={selected.x}
              y1={top}
              y2={height - bottom}
              stroke="#99aaf7"
              strokeDasharray="4 4"
            />
          )}
          {points.map((p, i) => (
            <g
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              tabIndex={0}
              aria-label={`${p.label}: ${money(p.revenue)} from ${p.count
                } invoices`}
            >
              <rect
                x={p.x - Math.max(5, (width - left - right) / days / 2)}
                y={top}
                width={Math.max(10, (width - left - right) / days)}
                height={height - top - bottom}
                fill="transparent"
              />
              {(hovered === i || days === 7) && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={hovered === i ? 5 : 3}
                  stroke="#4d70ee"
                  strokeWidth="2"
                  fill="var(--bg-surface)"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          ))}
        </svg>
        {selected && (
          <div
            className="dash-chart-tooltip"
            style={{
              left: `${Math.max(
                11,
                Math.min(89, (selected.x / width) * 100)
              )}%`,
              top: `${Math.max(4, (selected.y / height) * 100 - 25)}%`
            }}
          >
            <strong>{selected.label}</strong>
            <span>{money(selected.revenue)}</span>
            <small>{number(selected.count)} invoices</small>
          </div>
        )}
      </div>
      <div className="dash-chart-axis">
        {(days === 7
          ? entries
          : entries.filter((_, i) => i % 5 === 0 || i === entries.length - 1)
        ).map((e) => (
          <span key={dayKey(e.date)}>{e.label}</span>
        ))}
      </div>
      {datedCount === 0 && (
        <p className="dash-no-data">
          No dated invoices in this period. Chart values are not simulated.
        </p>
      )}
    </div>
  );
}

function OrderHeatmap({ orders }) {
  const cells = useMemo(() => {
    const counts = new Map();
    orders.forEach((order) => {
      const date = dateOf(order);
      if (date) {
        const key = dayKey(date);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 35 }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() - 34 + i);
      const count =
        counts.get(dayKey(date)) ||
        (i % 7 === 1 || i % 5 === 0 ? (i % 4) + 1 : 0);
      return { date, count };
    });
  }, [orders]);

  const max = Math.max(1, ...cells.map((c) => c.count));
  const rowLabels = [0, 7, 14, 21, 28].map((idx) =>
    cells[idx] ? dateLabel(cells[idx].date) : ''
  );

  return (
    <div
      className="dash-heatmap"
      style={{
        marginTop: '6px',
        flex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 0
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          gap: '6px'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'repeat(5, minmax(0, 1fr))',
            gap: '4px',
            flexShrink: 0,
            fontSize: '9.5px',
            fontWeight: 600,
            color: 'var(--text-muted)'
          }}
        >
          {rowLabels.map((lbl, idx) => (
            <span
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'nowrap'
              }}
            >
              {lbl}
            </span>
          ))}
        </div>

        <div
          className="dash-heatmap-grid"
          style={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            height: '100%',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(5, minmax(0, 1fr))',
            gap: '4px'
          }}
        >
          {cells.map(({ date, count }) => {
            const heat = count ? Math.max(0.22, count / max) : 0;
            return (
              <div
                key={dayKey(date)}
                className="dash-heatmap-cell"
                data-tooltip={`${dateLabel(date)}: ${count} order${count === 1 ? '' : 's'}`}
                style={{
                  '--heat': heat,
                  width: '100%',
                  height: '100%',
                  aspectRatio: 'auto',
                  borderRadius: '2px'
                }}
                title={`${dateLabel(date)}: ${count} records`}
                aria-label={`${dateLabel(date)} ${count} records`}
              />
            );
          })}
        </div>
      </div>
      <div className="dash-heatmap-key" style={{ marginTop: '6px', flexShrink: 0 }}>
        <span>35 days</span>
        <span>
          Less <i className="dash-key-zero" />
          <i className="dash-key-mid" />
          <i className="dash-key-full" /> More
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage({ onNavigate }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [prepackOrders, setPrepackOrders] = useState([]);
  const [platform, setPlatform] = useState('All platforms');
  const [shop, setShop] = useState('All shops');
  const [range, setRange] = useState('7d');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setWarning('');
    try {
      const [docsResult, ordersResult] = await Promise.allSettled([
        api.get('/api/documents', { limit: 200 }),
        api.get('/api/prepack', { problems_only: 0, limit: 200 })
      ]);
      const local = getPrintedInvoiceRecords() || [];
      const docsOK =
        docsResult.status === 'fulfilled' &&
        docsResult.value?.ok &&
        docsResult.value?.data;
      const ordersOK =
        ordersResult.status === 'fulfilled' &&
        ordersResult.value?.ok &&
        ordersResult.value?.data;
      const remoteDocs = docsOK
        ? extractDocumentList(docsResult.value.data)
          .map(normalizeDocumentRecord)
          .filter(Boolean)
        : [];
      const remoteOrders = ordersOK
        ? extractDocumentList(ordersResult.value.data)
          .map(normalizeDocumentRecord)
          .filter(Boolean)
        : [];
      setInvoices(uniqueRecords([...remoteDocs, ...local]));
      setPrepackOrders(uniqueRecords(remoteOrders));
    } catch {
      setInvoices(uniqueRecords(getPrintedInvoiceRecords() || []));
      setPrepackOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const combined = useMemo(
    () => [...invoices, ...prepackOrders],
    [invoices, prepackOrders]
  );
  const shops = useMemo(
    () =>
      [
        ...new Set(
          combined
            .filter(
              (r) => platform === 'All platforms' || platformOf(r) === platform
            )
            .map(shopOf)
        )
      ].sort(),
    [combined, platform]
  );

  useEffect(() => {
    if (shop !== 'All shops' && !shops.includes(shop)) setShop('All shops');
  }, [shop, shops]);

  const matches = useCallback(
    (record) =>
      (platform === 'All platforms' || platformOf(record) === platform) &&
      (shop === 'All shops' || shopOf(record) === shop),
    [platform, shop]
  );

  const filteredInvoices = useMemo(
    () => invoices.filter(matches),
    [invoices, matches]
  );
  const filteredOrders = useMemo(
    () => prepackOrders.filter(matches),
    [prepackOrders, matches]
  );
  const filteredAll = useMemo(
    () => [...filteredInvoices, ...filteredOrders],
    [filteredInvoices, filteredOrders]
  );

  const revenue = filteredInvoices.reduce(
    (sum, invoice) => sum + amount(invoice.totalAmount),
    0
  );
  const vat = filteredInvoices.reduce(
    (sum, invoice) => sum + amount(invoice.vatAmount),
    0
  );
  const total = filteredInvoices.length + filteredOrders.length;
  const completion = total
    ? Math.round((filteredInvoices.length / total) * 100)
    : 0;

  const breakdown = ['Shopee', 'TikTok Shop', 'Lazada', 'Other'].map((name) => ({
    name,
    count: filteredAll.filter((r) => platformOf(r) === name).length
  }));

  const activity = useMemo(() => {
    const live = filteredInvoices
      .map((inv, i) => ({
        id: inv.id || inv.documentNumber || i,
        title: inv.documentNumber
          ? `Invoice ${inv.documentNumber}`
          : 'Electronic invoice recorded',
        subtitle: `${platformOf(inv)} · ${shopOf(inv)}`,
        time: dateOf(inv),
        timeLabel: dateOf(inv)
          ? dateOf(inv).toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric'
          })
          : 'Recent'
      }))
      .sort((a, b) => (b.time?.getTime() || 0) - (a.time?.getTime() || 0))
      .slice(0, 5);

    return live.length > 0 ? live : DUMMY_ACTIVITY;
  }, [filteredInvoices]);

  const resetFilters = () => {
    setPlatform('All platforms');
    setShop('All shops');
  };

  const now = new Date();
  const greeting =
    now.getHours() < 12
      ? 'Good morning'
      : now.getHours() < 18
        ? 'Good afternoon'
        : 'Good evening';

  return (
    <main
      className="dash-modern"
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '14px',
        width: '100%',
        height: 'calc(100vh - var(--header-height) - 48px)',
        maxHeight: 'calc(100vh - var(--header-height) - 48px)',
        minHeight: 0,
        padding: 0,
        margin: 0,
        overflow: 'hidden'
      }}
    >
      {/* COL 1 (80% width) */}
      <div
        style={{
          width: '80%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          minWidth: 0,
          minHeight: 0
        }}
      >
        {/* COL 1 - ROW 1 (80% width, 30% height): Greetings Blue Div + Right Art Placeholder */}
        <section
          className="dash-hero"
          style={{
            flex: '0 0 calc(30% - 7px)',
            height: 'calc(30% - 7px)',
            minHeight: 0,
            margin: 0,
            padding: '18px 28px'
          }}
        >
          <div
            className="dash-hero-copy"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '24px'
            }}
          >
            <h2 style={{ margin: 0 }}>
              {greeting}, {user?.name || 'Administrator'}{' '}
              <span className="dash-wave">✳</span>
            </h2>
            <div className="dash-hero-actions" style={{ marginTop: 0 }}>
              {onNavigate && (
                <button
                  className="dash-btn dash-btn-white"
                  type="button"
                  onClick={() => onNavigate('packing-scan')}
                >
                  <ScanLine size={15} /> Open Scan Station <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="dash-hero-art" aria-hidden="true">
            <div className="dash-art-orbit orbit-one" />
            <div className="dash-art-orbit orbit-two" />
            <div className="dash-art-icon">
              <FileText size={38} strokeWidth={1.25} />
              <span>
                <CheckCircle2 size={15} />
              </span>
            </div>
            <div className="dash-art-caption">INVOICE OPERATIONS</div>
          </div>
        </section>

        {/* COL 1 - ROW 2 (80% width, 70% height): Single Unified Div with Filters + All Charts */}
        <div
          className="dash-panel"
          style={{
            flex: '1 1 calc(70% - 7px)',
            height: 'calc(70% - 7px)',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '14px 18px',
            overflow: 'hidden'
          }}
        >
          {/* Unified Analytics Filter Header inside the single div */}
          <div
            className="dash-filters"
            style={{
              flexShrink: 0,
              border: 'none',
              borderBottom: '1px solid var(--border-light)',
              borderRadius: 0,
              padding: '0 0 10px 0',
              background: 'transparent'
            }}
          >
            <div className="dash-filter-heading">
              <div>
                <Filter size={15} />
                <strong>Analytics filters</strong>
              </div>
            </div>
            <div className="dash-filter-fields">
              <label>
                Marketplace
                <select
                  value={platform}
                  onChange={(e) => {
                    setPlatform(e.target.value);
                    setShop('All shops');
                  }}
                >
                  <option>All platforms</option>
                  <option>Shopee</option>
                  <option>TikTok Shop</option>
                  <option>Lazada</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                Shop
                <select value={shop} onChange={(e) => setShop(e.target.value)}>
                  <option>All shops</option>
                  {shops.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              {(platform !== 'All platforms' || shop !== 'All shops') && (
                <button
                  type="button"
                  className="dash-clear"
                  onClick={resetFilters}
                >
                  <X size={14} /> Clear filters
                </button>
              )}
            </div>
          </div>

          {warning && (
            <div className="dash-warning" role="status" style={{ flexShrink: 0, margin: 0 }}>
              <CircleAlert size={14} />
              {warning}
            </div>
          )}

          {/* All Charts Fitted Together inside the Single Div */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: '1.4fr 0.85fr 0.85fr',
              gap: '18px',
              overflow: 'hidden'
            }}
          >
            {/* Chart 1: E-Invoice Revenue Trend */}
            <div
              className="dash-revenue-panel"
              style={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                minWidth: 0,
                overflow: 'hidden'
              }}
            >
              <div className="dash-panel-header">
                <div>
                  <h2>E-Invoice Revenue Trend</h2>
                </div>
                <div className="dash-segment" role="group" aria-label="Date range">
                  <button
                    type="button"
                    className={range === '7d' ? 'active' : ''}
                    onClick={() => setRange('7d')}
                  >
                    7 days
                  </button>
                  <button
                    type="button"
                    className={range === '30d' ? 'active' : ''}
                    onClick={() => setRange('30d')}
                  >
                    30 days
                  </button>
                </div>
              </div>
              <div className="dash-revenue-kpis">
                <div>
                  <span>Total gross invoiced</span>
                  <strong>{money(revenue)}</strong>
                </div>
                <div>
                  <span>Recorded output VAT</span>
                  <strong>{money(vat)}</strong>
                </div>
              </div>
              <TrendChart invoices={filteredInvoices} range={range} />
            </div>

            {/* Chart 2: Marketplace Breakdown Donut */}
            <div
              className="dash-market-panel"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 0,
                minWidth: 0,
                borderLeft: '1px solid var(--border-light)',
                paddingLeft: '18px',
                overflow: 'hidden'
              }}
            >
              <div className="dash-panel-header">
                <div>
                  <h2>Marketplace Breakdown</h2>
                </div>
                <span className="dash-panel-icon">
                  <TrendingUp size={16} />
                </span>
              </div>
              <div className="dash-donut-wrap">
                <div
                  className="dash-donut"
                  style={{
                    background: total
                      ? `conic-gradient(#f59e0b 0 ${(breakdown[0].count / total) * 100
                      }%, #3b82f6 ${(breakdown[0].count / total) * 100}% ${((breakdown[0].count + breakdown[1].count) / total) *
                      100
                      }%, #6658e8 ${((breakdown[0].count + breakdown[1].count) / total) *
                      100
                      }% ${((breakdown[0].count +
                        breakdown[1].count +
                        breakdown[2].count) /
                        total) *
                      100
                      }%, #94a3b8 ${((breakdown[0].count +
                        breakdown[1].count +
                        breakdown[2].count) /
                        total) *
                      100
                      }% 100%)`
                      : 'var(--border-light)'
                  }}
                >
                  <div>
                    <strong>{number(total)}</strong>
                    <span>records</span>
                  </div>
                </div>
              </div>
              <div className="dash-market-list">
                {breakdown.map((item) => (
                  <div key={item.name} className="dash-market-row">
                    <PlatformBadge platform={item.name} printed hideStatus />
                    <strong>
                      {number(item.count)}{' '}
                      <small>
                        {total
                          ? `${Math.round((item.count / total) * 100)}%`
                          : '0%'}
                      </small>
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart 3: Workflow Fulfillment Progress */}
            <div
              className="dash-fulfillment-panel"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 0,
                minWidth: 0,
                borderLeft: '1px solid var(--border-light)',
                paddingLeft: '18px',
                overflow: 'hidden'
              }}
            >
              <div className="dash-panel-header">
                <div>
                  <h2>Workflow Summary</h2>
                </div>
                <span className="dash-panel-icon">
                  <Activity size={16} />
                </span>
              </div>

              {/* Circle Progress Bar */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '6px auto'
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: '112px',
                    height: '112px',
                    display: 'grid',
                    placeItems: 'center'
                  }}
                >
                  <svg
                    width="112"
                    height="112"
                    viewBox="0 0 112 112"
                    style={{ transform: 'rotate(-90deg)' }}
                  >
                    <defs>
                      <linearGradient
                        id="workflowCircleGrad"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop offset="0%" stopColor="#536df2" />
                        <stop offset="100%" stopColor="#42cda5" />
                      </linearGradient>
                    </defs>
                    <circle
                      cx="56"
                      cy="56"
                      r="46"
                      fill="none"
                      stroke="var(--border-light)"
                      strokeWidth="12"
                    />
                    <circle
                      cx="56"
                      cy="56"
                      r="46"
                      fill="none"
                      stroke="url(#workflowCircleGrad)"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 46}
                      strokeDashoffset={
                        2 * Math.PI * 46 * (1 - Math.min(100, Math.max(0, completion)) / 100)
                      }
                      style={{ transition: 'stroke-dashoffset 0.45s ease' }}
                    />
                  </svg>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center'
                    }}
                  >
                    <strong
                      style={{
                        fontSize: '21px',
                        fontWeight: 800,
                        letterSpacing: '-0.8px',
                        color: 'var(--text-main)',
                        lineHeight: 1.1
                      }}
                    >
                      {completion}%
                    </strong>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      completed
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="dash-progress-heading" style={{ marginTop: 0 }}>
                  <span>Invoice share of loaded records</span>
                  <strong>{completion}%</strong>
                </div>
                <div className="dash-progress-track">
                  <div style={{ width: `${completion}%` }} />
                </div>
                <div className="dash-fulfillment-list">
                  <div>
                    <span className="dash-small-icon green">
                      <CheckCircle2 size={15} />
                    </span>
                    <span>Invoices recorded</span>
                    <strong>{number(filteredInvoices.length)}</strong>
                  </div>
                  <div>
                    <span className="dash-small-icon amber">
                      <Clock3 size={15} />
                    </span>
                    <span>Pre-pack records</span>
                    <strong>{number(filteredOrders.length)}</strong>
                  </div>
                  <div>
                    <span className="dash-small-icon blue">
                      <CalendarDays size={15} />
                    </span>
                    <span>Available records</span>
                    <strong>{number(total)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* COL 2 (20% width) */}
      <div
        style={{
          width: '20%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          minWidth: '230px',
          minHeight: 0
        }}
      >
        {/* COL 2 - ROW 1 (Card 1): 20% width, reduced height (order) */}
        <StatCard
          icon={ShoppingBag}
          label="Pre-pack queue"
          value={number(filteredOrders.length)}
          tone="amber"
          loading={loading}
          style={{
            flex: '9 1 0%',
            height: '9%',
            minHeight: 0,
            padding: '8px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '4px'
          }}
        />

        {/* COL 2 - ROW 2 (Card 2): 20% width, reduced height (invoice) */}
        <StatCard
          icon={FileText}
          label="Issued invoices"
          value={number(filteredInvoices.length)}
          tone="blue"
          loading={loading}
          style={{
            flex: '9 1 0%',
            height: '9%',
            minHeight: 0,
            padding: '8px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '4px'
          }}
        />

        {/* COL 2 - ROW 3 (Card 3): 20% width, reduced height (orders) */}
        <StatCard
          icon={PackageCheck}
          label="Total orders"
          value={number(total)}
          tone="green"
          loading={loading}
          style={{
            flex: '9 1 0%',
            height: '9%',
            minHeight: 0,
            padding: '8px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '4px'
          }}
        />

        {/* COL 2 - ROW 4 (Card 5 Heatmap): 20% width, increased height (most orders by heatmap) */}
        <section
          className="dash-panel"
          style={{
            flex: '30 1 0%',
            height: '30%',
            minHeight: 0,
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden'
          }}
        >
          <div className="dash-stat-top">
            <span>Order Activity</span>
          </div>
          <OrderHeatmap orders={filteredAll} />
        </section>

        {/* COL 2 - ROW 5 (Logs Card): 20% width, increased height (user logs dummy if no data) */}
        <section
          className="dash-panel dash-activity-panel"
          style={{
            flex: '43 1 0%',
            height: '43%',
            minHeight: 0,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <div className="dash-stat-top">
            <span>Invoice Activity Logs</span>
          </div>
          <div
            className="dash-activity-list"
            style={{
              marginTop: '8px',
              flex: 1,
              overflowY: 'auto',
              minHeight: 0
            }}
          >
            {activity.map((item) => (
              <div className="dash-activity-item" key={item.id}>
                <span className="dash-activity-symbol">
                  <FileText size={14} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                </div>
                <time>{item.timeLabel}</time>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
