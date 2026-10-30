import React from 'react';
import { BarChart3, TrendingUp, PieChart, ArrowUpRight } from 'lucide-react';
import './pages.css';

export default function AnalyticsPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Analytics & Reporting</h1>
          <p className="page-subtitle">Inspect collection velocity, outstanding tax reconciliation, and cash flow projections.</p>
        </div>
      </div>

      <div className="placeholder-banner">
        <div className="placeholder-icon">
          <BarChart3 size={28} />
        </div>
        <h2 className="placeholder-title">Analytics Dashboard Placeholder</h2>
        <p className="placeholder-desc">
          Ready for your preferred analytics graphs and revenue breakdown charts. Integrates smoothly with real-time webhooks or database summaries.
        </p>
      </div>

      <div className="cards-grid-2">
        <div className="card-section">
          <div className="card-section-header">
            <h3 className="card-section-title">Invoice Payment Velocity</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Average payment cycle: <strong>14.2 days</strong> from issue date (down from 18.5 days last quarter).
          </p>
        </div>

        <div className="card-section">
          <div className="card-section-header">
            <h3 className="card-section-title">Tax Compliance Verification</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            100% of issued e-invoices successfully stamped and cryptographically signed.
          </p>
        </div>
      </div>
    </div>
  );
}
