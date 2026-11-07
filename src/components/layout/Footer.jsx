import React, { useState, useEffect } from 'react';
import { CheckCircle2, Clock, XOctagon, HelpCircle, X } from 'lucide-react';

const currentYear = new Date().getFullYear();

export default function Footer() {
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    const handleOpenGuide = () => setIsGuideOpen(true);
    window.addEventListener('open-packing-guide', handleOpenGuide);
    return () => window.removeEventListener('open-packing-guide', handleOpenGuide);
  }, []);

  return (
    <>
      <footer className="admin-footer">
        <div className="footer-left" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span>© {currentYear} ISC E-Invoicing System. All rights reserved.</span>
          <span style={{ color: 'var(--border-color)' }}>•</span>
          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--primary)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <HelpCircle size={14} /> Learn More
          </button>
        </div>

        <div className="footer-right">
          <span className="badge badge-primary">v1.0.0</span>
        </div>
      </footer>

      {isGuideOpen && (
        <div
          className="order-drawer-backdrop"
          onClick={() => setIsGuideOpen(false)}
        >
          <div
            className="order-right-modal"
            style={{ maxWidth: '500px', width: '92vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="order-right-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span className="badge badge-emerald">Scanner Ready</span>
                  <span className="badge badge-primary">BIR RMC 98-2026</span>
                </div>
                <h2 className="order-right-title">Station Status &amp; Packing Guide</h2>
                <p className="order-right-sub">
                  Automatic BIR RMC 98-2026 verification rules on every barcode scan.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsGuideOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="order-right-body">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: '12px'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.22)'
                  }}
                >
                  <CheckCircle2
                    size={18}
                    style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }}
                  />
                  <div style={{ fontSize: '0.84rem' }}>
                    <strong style={{ color: '#065f46' }}>Green — Order OK &amp; Print</strong>
                    <div style={{ color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.45 }}>
                      Issues BIR E-Invoice, prints 100×150mm thermal slip, and moves order from Orders Queue to Invoices Tracker.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.24)'
                  }}
                >
                  <Clock
                    size={18}
                    style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }}
                  />
                  <div style={{ fontSize: '0.84rem' }}>
                    <strong style={{ color: '#92400e' }}>Amber — Unpaid or Waiting Sync (202)</strong>
                    <div style={{ color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.45 }}>
                      Auto-retries every 3s up to 60s if not synced yet, or holds parcel if payment is unconfirmed.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(225, 29, 72, 0.07)',
                    border: '1px solid rgba(225, 29, 72, 0.22)'
                  }}
                >
                  <XOctagon
                    size={18}
                    style={{ color: '#e11d48', flexShrink: 0, marginTop: '2px' }}
                  />
                  <div style={{ fontSize: '0.84rem' }}>
                    <strong style={{ color: '#9f1239' }}>Red — Do Not Ship / Blocked</strong>
                    <div style={{ color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.45 }}>
                      Cancelled/returned order, duplicate tracking (409), or store before start date — set parcel aside immediately.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-right-footer">
              <div />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsGuideOpen(false)}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
