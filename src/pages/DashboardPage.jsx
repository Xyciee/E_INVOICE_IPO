import React, { useState } from 'react';
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
  PieChart as PieChartIcon,
  BarChart2
} from 'lucide-react';
import './pages.css';

export default function DashboardPage({ onNavigate }) {
  // Monthly Revenue Trajectory Data
  const monthlyData = [
    { month: 'Jan', val: 280000, invoices: 42, label: '₱280K' },
    { month: 'Feb', val: 340000, invoices: 58, label: '₱340K' },
    { month: 'Mar', val: 410000, invoices: 72, label: '₱410K' },
    { month: 'Apr', val: 390000, invoices: 69, label: '₱390K' },
    { month: 'May', val: 520000, invoices: 88, label: '₱520K' },
    { month: 'Jun', val: 590000, invoices: 95, label: '₱590K' },
    { month: 'Jul', val: 680000, invoices: 112, label: '₱680K' },
    { month: 'Aug', val: 740000, invoices: 124, label: '₱740K' },
    { month: 'Sep', val: 820000, invoices: 135, label: '₱820K' },
    { month: 'Oct', val: 980000, invoices: 158, label: '₱980K' }
  ];

  const [activePointIndex, setActivePointIndex] = useState(monthlyData.length - 1);
  const activePoint = monthlyData[activePointIndex];

  // Donut Tax Breakdown Data (SVG Circle Circumference: 2 * PI * 65 ≈ 408.4)
  const totalTaxAmount = 4860000;
  const taxCategories = [
    { label: '12% Standard VAT Sales', pct: 68, amount: '₱3,304,800.00', color: '#3b82f6', strokeDash: '277.7 408.4', strokeOffset: '0' },
    { label: 'Zero-Rated Sales (0% VAT)', pct: 22, amount: '₱1,069,200.00', color: '#10b981', strokeDash: '89.8 408.4', strokeOffset: '-277.7' },
    { label: 'VAT-Exempt Sales', pct: 10, amount: '₱486,000.00', color: '#f59e0b', strokeDash: '40.8 408.4', strokeOffset: '-367.5' }
  ];

  const [hoveredTax, setHoveredTax] = useState(null);

  // Weekly Fulfillment Bar Data
  const weeklyData = [
    { week: 'Week 1', orders: 32, invoiced: 29 },
    { week: 'Week 2', orders: 38, invoiced: 36 },
    { week: 'Week 3', orders: 45, invoiced: 41 },
    { week: 'Week 4', orders: 52, invoiced: 49 }
  ];

  // SVG Chart Geometry calculations
  const chartW = 560;
  const chartH = 180;
  const paddingX = 40;
  const paddingY = 24;
  const maxVal = 1100000;

  const points = monthlyData.map((d, i) => {
    const x = paddingX + (i / (monthlyData.length - 1)) * (chartW - paddingX * 2);
    const y = chartH - paddingY - (d.val / maxVal) * (chartH - paddingY * 2);
    return { x, y, ...d };
  });

  // Build smooth cubic bezier curve
  const pathData = points.reduce((acc, pt, idx, arr) => {
    if (idx === 0) return `M ${pt.x} ${pt.y}`;
    const prev = arr[idx - 1];
    const cpX = (prev.x + pt.x) / 2;
    return `${acc} C ${cpX} ${prev.y}, ${cpX} ${pt.y}, ${pt.x} ${pt.y}`;
  }, '');

  const areaData = `${pathData} L ${points[points.length - 1].x} ${chartH - paddingY} L ${points[0].x} ${chartH - paddingY} Z`;

  const stats = [
    {
      title: 'Total Revenue Billed',
      value: '₱4,860,000.00',
      trend: '+16.5%',
      isPositive: true,
      timeframe: 'vs last month',
      icon: Receipt,
      color: 'rgba(59, 130, 246, 0.1)',
      iconColor: '#3b82f6'
    },
    {
      title: 'Invoices Sent (BIR Stamped)',
      value: '348',
      trend: '+9.2%',
      isPositive: true,
      timeframe: 'this fiscal quarter',
      icon: FileCheck,
      color: 'rgba(16, 185, 129, 0.1)',
      iconColor: '#10b981'
    },
    {
      title: 'Customer Invoice Requests',
      value: '4 Pending',
      trend: 'Urgent',
      isPositive: false,
      timeframe: 'awaiting generation',
      icon: Clock,
      color: 'rgba(245, 158, 11, 0.1)',
      iconColor: '#f59e0b'
    },
    {
      title: 'Active Orders',
      value: '124',
      trend: '+8.1%',
      isPositive: true,
      timeframe: 'active orders',
      icon: ShoppingCart,
      color: 'rgba(139, 92, 246, 0.1)',
      iconColor: '#8b5cf6'
    }
  ];

  const recentSentInvoices = [
    {
      id: 'INV-2026-0428',
      client: 'San Miguel Brewery Corp',
      date: 'Oct 28, 2026',
      amount: '₱345,000.00',
      status: 'Paid',
      badgeClass: 'badge-emerald'
    },
    {
      id: 'INV-2026-0427',
      client: 'Jollibee Worldwide Services',
      date: 'Oct 27, 2026',
      amount: '₱128,500.00',
      status: 'Unpaid',
      badgeClass: 'badge-amber'
    },
    {
      id: 'INV-2026-0426',
      client: 'Ayala Land Properties Inc',
      date: 'Oct 25, 2026',
      amount: '₱890,000.00',
      status: 'Unpaid',
      badgeClass: 'badge-amber'
    },
    {
      id: 'INV-2026-0425',
      client: 'SM Prime Holdings',
      date: 'Oct 22, 2026',
      amount: '₱412,000.00',
      status: 'Paid',
      badgeClass: 'badge-emerald'
    },
    {
      id: 'INV-2026-0424',
      client: 'Universal Robina Corp',
      date: 'Oct 15, 2026',
      amount: '₱560,000.00',
      status: 'Overdue',
      badgeClass: 'badge-rose'
    }
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">ISC E-Invoice Executive Dashboard</h1>
          <p className="page-subtitle">
            Overview of processed electronic invoices, customer requests, and orders for BIR EIS compliance.
          </p>
        </div>

        <div className="page-actions">
          <button
            className="btn btn-outline"
            onClick={() => onNavigate && onNavigate('orders')}
          >
            <ShoppingCart size={16} /> View Orders
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onNavigate && onNavigate('invoices')}
          >
            <Send size={16} /> E-Invoice Tracker
          </button>
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
              <div className="stat-card-value">{stat.value}</div>
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

      {/* CHARTS ROW 1: Monthly Area Chart & BIR Tax Donut Chart */}
      <div className="cards-grid-2" style={{ marginBottom: '24px' }}>
        {/* CHART 1: Monthly E-Invoice Trajectory (Interactive Area/Line Chart) */}
        <div className="card-section" style={{ position: 'relative' }}>
          <div className="card-section-header">
            <div>
              <h2 className="card-section-title">E-Invoice Revenue Trajectory (PHP)</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Jan - Oct 2026 Monthly Volume (Hover points to inspect)
              </div>
            </div>
            <span className="badge badge-primary">2026 Fiscal Year</span>
          </div>

          {/* Interactive Floating Tooltip */}
          {activePoint && (
            <div className="chart-tooltip-box">
              <span className="chart-tooltip-label">
                {activePoint.month} 2026 • {activePoint.invoices} Invoices
              </span>
              <span className="chart-tooltip-val">
                ₱{activePoint.val.toLocaleString('en-PH')}.00
              </span>
            </div>
          )}

          {/* Responsive SVG Chart */}
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

              {/* Gradient Area Fill */}
              <path d={areaData} fill="url(#areaGradient)" />

              {/* Smooth Spline Stroke Line */}
              <path
                d={pathData}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Active Point Vertical Guideline */}
              {points[activePointIndex] && (
                <line
                  x1={points[activePointIndex].x}
                  y1={points[activePointIndex].y}
                  x2={points[activePointIndex].x}
                  y2={chartH - paddingY}
                  className="chart-hover-indicator"
                />
              )}

              {/* Data Points and Month Labels */}
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
        </div>

        {/* CHART 2: BIR Tax Breakdown (Interactive Radial Donut Chart) */}
        <div className="card-section">
          <div className="card-section-header">
            <div>
              <h2 className="card-section-title">BIR Tax Category Distribution</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Official classification under Republic Act No. 11976 (EOPT Act)
              </div>
            </div>
            <span className="badge badge-emerald">BIR Verified</span>
          </div>

          <div className="donut-layout">
            {/* SVG Donut */}
            <div style={{ position: 'relative', width: '180px', height: '180px' }}>
              <svg className="donut-chart-svg" viewBox="0 0 180 180">
                {/* Background Ring */}
                <circle
                  cx="90"
                  cy="90"
                  r="65"
                  fill="transparent"
                  stroke="var(--bg-app)"
                  strokeWidth="24"
                />
                {/* Segment Arcs */}
                {taxCategories.map((item, idx) => (
                  <circle
                    key={idx}
                    cx="90"
                    cy="90"
                    r="65"
                    className="donut-segment"
                    stroke={item.color}
                    strokeDasharray={item.strokeDash}
                    strokeDashoffset={item.strokeOffset}
                    onMouseEnter={() => setHoveredTax(item)}
                    onMouseLeave={() => setHoveredTax(null)}
                  />
                ))}
              </svg>

              {/* Center Details */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  textAlign: 'center'
                }}
              >
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {hoveredTax ? hoveredTax.label.split(' ')[0] : 'Total'}
                </span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {hoveredTax ? `${hoveredTax.pct}%` : '₱4.86M'}
                </span>
              </div>
            </div>

            {/* Legends */}
            <div className="donut-legends">
              {taxCategories.map((item, idx) => (
                <div
                  key={idx}
                  className="legend-item"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    background: hoveredTax === item ? 'var(--bg-surface-hover)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                  onMouseEnter={() => setHoveredTax(item)}
                  onMouseLeave={() => setHoveredTax(null)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="legend-color-dot" style={{ backgroundColor: item.color }} />
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.label}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700 }}>{item.amount}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.pct}% of total</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CHARTS ROW 2: Weekly Fulfillment Bar Chart & Recent Invoices */}
      <div className="cards-grid-2">
        {/* CHART 3: Weekly Orders vs E-Invoices Fulfillment Bar Chart */}
        <div className="card-section">
          <div className="card-section-header">
            <div>
              <h2 className="card-section-title">Weekly Orders vs E-Invoices Billed</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Comparison of received POs vs dispatched BIR E-invoices
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#8b5cf6' }} />
                Orders
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#3b82f6' }} />
                Invoiced
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '10px 0' }}>
            {weeklyData.map((w, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600 }}>{w.week}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {w.invoiced} of {w.orders} orders billed ({Math.round((w.invoiced / w.orders) * 100)}%)
                  </span>
                </div>
                <div style={{ display: 'flex', height: '18px', gap: '4px', background: 'var(--bg-app)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', padding: '2px' }}>
                  <div
                    style={{
                      width: `${(w.orders / 60) * 100}%`,
                      backgroundColor: '#8b5cf6',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'width 0.4s ease'
                    }}
                    title={`${w.orders} Orders`}
                  />
                  <div
                    style={{
                      width: `${(w.invoiced / 60) * 100}%`,
                      backgroundColor: '#3b82f6',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'width 0.4s ease'
                    }}
                    title={`${w.invoiced} Invoiced`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recently Sent Invoices Table */}
        <div className="card-section">
          <div className="card-section-header">
            <h2 className="card-section-title">Recently Sent Invoices</h2>
            <button
              className="btn btn-outline"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={() => onNavigate && onNavigate('invoices')}
            >
              Open Tracker <ArrowUpRight size={14} />
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Amount (PHP)</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentSentInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600 }}>{inv.id}</td>
                    <td>{inv.client}</td>
                    <td style={{ fontWeight: 700 }}>{inv.amount}</td>
                    <td>
                      <span className={`badge ${inv.badgeClass}`}>{inv.status}</span>
                    </td>
                    <td>
                      <button
                        style={{ color: 'var(--text-muted)' }}
                        aria-label="Actions"
                        title="Options"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
