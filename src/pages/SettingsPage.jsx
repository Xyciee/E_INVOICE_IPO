import React, { useState } from 'react';
import { Settings, Shield, Bell, Key, Save } from 'lucide-react';
import './pages.css';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">System Settings</h1>
          <p className="page-subtitle">Configure organization profile, BIR tax credentials, and electronic invoicing system preferences.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => alert('Settings saved successfully!')}>
            <Save size={16} /> Save Changes
          </button>
        </div>
      </div>

      <div className="filter-tabs">
        <button
          className={`filter-tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          General & Organization
        </button>
        <button
          className={`filter-tab ${activeTab === 'billing' ? 'active' : ''}`}
          onClick={() => setActiveTab('billing')}
        >
          BIR & Tax Configuration
        </button>
        <button
          className={`filter-tab ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          API & EIS Integration
        </button>
      </div>

      <div className="card-section">
        {activeTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                Company Legal Name
              </label>
              <input
                type="text"
                defaultValue="ISC E-Invoice Solutions Philippines Corp."
                className="search-input"
                style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                Primary Billing Email
              </label>
              <input
                type="email"
                defaultValue="einvoice@isc-corp.ph"
                className="search-input"
                style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                System Default Currency
              </label>
              <select
                className="search-input"
                style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
                defaultValue="PHP"
              >
                <option value="PHP">PHP (₱) - Philippine Peso</option>
                <option value="USD">USD ($) - US Dollar</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'billing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                Registered BIR Tax Identification Number (TIN)
              </label>
              <input
                type="text"
                defaultValue="009-421-883-00000"
                className="search-input"
                style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                Standard Value Added Tax (VAT) Rate
              </label>
              <input
                type="text"
                defaultValue="12% Standard VAT"
                readOnly
                className="search-input"
                style={{ width: '100%', borderRadius: 'var(--radius-md)', background: 'var(--bg-app)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                E-Invoice Number Prefix
              </label>
              <input
                type="text"
                defaultValue="INV-2026-"
                className="search-input"
                style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
              />
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                BIR EIS API Client Certificate ID
              </label>
              <input
                type="text"
                readOnly
                defaultValue="BIR_EIS_CERT_PH_2026_99812A"
                className="search-input"
                style={{ width: '100%', borderRadius: 'var(--radius-md)', background: 'var(--bg-app)' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
