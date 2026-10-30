import React, { useState } from 'react';
import {
  Send,
  Inbox,
  Search,
  Download,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Mail,
  ExternalLink,
  Filter,
  Check,
  Building2
} from 'lucide-react';
import './pages.css';

export default function InvoicesPage() {
  const [activeTab, setActiveTab] = useState('sent'); // 'sent' | 'requests'
  const [sentFilter, setSentFilter] = useState('All');
  const [requestFilter, setRequestFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationMsg, setNotificationMsg] = useState('');

  // 1. Data: Tracker of Customers Already Sent Invoices
  const [sentInvoices, setSentInvoices] = useState([
    {
      id: 'INV-2026-0428',
      birClearance: 'BIR-EINV-902148',
      customer: 'San Miguel Brewery Corp',
      tin: '000-128-940-000',
      dateSent: 'Oct 28, 2026',
      dueDate: 'Nov 27, 2026',
      amount: '₱345,000.00',
      recipientEmail: 'ap.invoices@sanmiguel.com.ph',
      deliveryStatus: 'Customer Acknowledged',
      paymentStatus: 'Paid',
      paymentBadge: 'badge-emerald'
    },
    {
      id: 'INV-2026-0427',
      birClearance: 'BIR-EINV-902147',
      customer: 'Jollibee Worldwide Services',
      tin: '001-982-311-000',
      dateSent: 'Oct 27, 2026',
      dueDate: 'Nov 11, 2026',
      amount: '₱128,500.00',
      recipientEmail: 'e-invoicing@jollibee.com.ph',
      deliveryStatus: 'Delivered (Email Sent)',
      paymentStatus: 'Unpaid',
      paymentBadge: 'badge-amber'
    },
    {
      id: 'INV-2026-0426',
      birClearance: 'BIR-EINV-902146',
      customer: 'Ayala Land Properties Inc',
      tin: '002-334-118-000',
      dateSent: 'Oct 25, 2026',
      dueDate: 'Dec 24, 2026',
      amount: '₱890,000.00',
      recipientEmail: 'finance.billing@ayalaland.com.ph',
      deliveryStatus: 'Customer Acknowledged',
      paymentStatus: 'Unpaid',
      paymentBadge: 'badge-amber'
    },
    {
      id: 'INV-2026-0425',
      birClearance: 'BIR-EINV-902145',
      customer: 'SM Prime Holdings',
      tin: '000-449-712-000',
      dateSent: 'Oct 22, 2026',
      dueDate: 'Nov 06, 2026',
      amount: '₱412,000.00',
      recipientEmail: 'vendor.invoice@smprime.com',
      deliveryStatus: 'Customer Acknowledged',
      paymentStatus: 'Paid',
      paymentBadge: 'badge-emerald'
    },
    {
      id: 'INV-2026-0424',
      birClearance: 'BIR-EINV-902144',
      customer: 'Universal Robina Corp',
      tin: '000-721-508-000',
      dateSent: 'Oct 15, 2026',
      dueDate: 'Oct 30, 2026',
      amount: '₱560,000.00',
      recipientEmail: 'urc.accounting@urc.com.ph',
      deliveryStatus: 'Delivered (Email Sent)',
      paymentStatus: 'Overdue',
      paymentBadge: 'badge-rose'
    },
    {
      id: 'INV-2026-0423',
      birClearance: 'BIR-EINV-902143',
      customer: 'Megaworld Lifestyle Malls',
      tin: '003-918-204-000',
      dateSent: 'Oct 12, 2026',
      dueDate: 'Nov 11, 2026',
      amount: '₱94,500.00',
      recipientEmail: 'billing@megaworldcorp.com',
      deliveryStatus: 'Customer Acknowledged',
      paymentStatus: 'Paid',
      paymentBadge: 'badge-emerald'
    }
  ]);

  // 2. Data: Customer Request Invoices List
  const [invoiceRequests, setInvoiceRequests] = useState([
    {
      requestId: 'REQ-2026-091',
      customer: 'Globe Telecom Inc',
      tin: '000-461-322-000',
      poReference: 'PO-GLB-9021',
      requestDate: 'Oct 30, 2026 (Today)',
      contactEmail: 'corp.billing@globe.com.ph',
      amount: '₱745,000.00',
      itemsCount: 14,
      priority: 'Urgent',
      status: 'Pending Generation'
    },
    {
      requestId: 'REQ-2026-090',
      customer: 'BDO Unibank Procurement',
      tin: '000-112-984-000',
      poReference: 'PO-BDO-4431',
      requestDate: 'Oct 29, 2026',
      contactEmail: 'vendor.payables@bdo.com.ph',
      amount: '₱1,250,000.00',
      itemsCount: 32,
      priority: 'Standard',
      status: 'Pending Generation'
    },
    {
      requestId: 'REQ-2026-089',
      customer: 'PLDT Enterprise Solutions',
      tin: '000-332-901-000',
      poReference: 'PO-PLDT-8820',
      requestDate: 'Oct 28, 2026',
      contactEmail: 'einv.processing@pldt.com.ph',
      amount: '₱480,000.00',
      itemsCount: 8,
      priority: 'Standard',
      status: 'Pending Generation'
    },
    {
      requestId: 'REQ-2026-088',
      customer: 'Puregold Price Club Inc',
      tin: '004-981-229-000',
      poReference: 'PO-PG-6712',
      requestDate: 'Oct 27, 2026',
      contactEmail: 'trade.invoices@puregold.com.ph',
      amount: '₱310,500.00',
      itemsCount: 19,
      priority: 'Urgent',
      status: 'In Review'
    }
  ]);

  const handleGenerateAndSend = (request) => {
    // Generate new sent invoice record
    const newInvoiceId = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const newClearance = `BIR-EINV-${Math.floor(900000 + Math.random() * 100000)}`;

    const newSentItem = {
      id: newInvoiceId,
      birClearance: newClearance,
      customer: request.customer,
      tin: request.tin,
      dateSent: 'Just now',
      dueDate: '30 Days Net',
      amount: request.amount,
      recipientEmail: request.contactEmail,
      deliveryStatus: 'Delivered (Email Sent)',
      paymentStatus: 'Unpaid',
      paymentBadge: 'badge-amber'
    };

    // Remove from requests list and append to sent list
    setInvoiceRequests(prev => prev.filter(r => r.requestId !== request.requestId));
    setSentInvoices(prev => [newSentItem, ...prev]);

    setNotificationMsg(`E-Invoice ${newInvoiceId} generated with BIR clearance ${newClearance} and dispatched to ${request.contactEmail}!`);
    setTimeout(() => setNotificationMsg(''), 5000);
  };

  const handleResendInvoice = (inv) => {
    setNotificationMsg(`E-Invoice ${inv.id} successfully resent to ${inv.recipientEmail}.`);
    setTimeout(() => setNotificationMsg(''), 4000);
  };

  // Filtered Sent Invoices
  const filteredSent = sentInvoices.filter((inv) => {
    const matchesFilter =
      sentFilter === 'All' || inv.paymentStatus === sentFilter;
    const matchesSearch =
      inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.birClearance.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Filtered Requests
  const filteredRequests = invoiceRequests.filter((req) => {
    const matchesFilter =
      requestFilter === 'All' || req.status === requestFilter;
    const matchesSearch =
      req.requestId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.poReference.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">E-Invoice Management Portal</h1>
          <p className="page-subtitle">
            Track customer sent invoices with BIR clearance tokens and fulfill incoming customer invoice requests.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => alert('Downloading official BIR XML report...')}>
            <Download size={16} /> BIR Compliance Export
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setActiveTab('requests')}
          >
            <Inbox size={16} /> View Requests ({invoiceRequests.length})
          </button>
        </div>
      </div>

      {/* Instant Notification Toast */}
      {notificationMsg && (
        <div
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
            fontSize: '0.875rem',
            animation: 'fadeIn 0.2s ease'
          }}
        >
          <CheckCircle2 size={18} />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Summary Metrics in Philippine Peso */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Invoices Sent</span>
            <div className="stat-card-icon-wrap" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
              <Send size={20} />
            </div>
          </div>
          <div className="stat-card-value">₱2,430,000.00</div>
          <div className="stat-card-footer">
            <span className="badge badge-primary">{sentInvoices.length} Dispatched</span>
            <span className="trend-description">with BIR QR signatures</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Customer Invoice Requests</span>
            <div className="stat-card-icon-wrap" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
              <Inbox size={20} />
            </div>
          </div>
          <div className="stat-card-value">₱2,785,500.00</div>
          <div className="stat-card-footer">
            <span className="badge badge-amber">{invoiceRequests.length} Awaiting Generation</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Collected Payments</span>
            <div className="stat-card-icon-wrap" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="stat-card-value">₱851,500.00</div>
          <div className="stat-card-footer">
            <span className="trend-pill trend-positive">68% collected</span>
          </div>
        </div>
      </div>

      {/* Core View Switcher (Sent Tracker vs Request List) */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '2px solid var(--border-light)',
          marginBottom: '20px'
        }}
      >
        <button
          onClick={() => { setActiveTab('sent'); setSearchQuery(''); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: 'var(--radius-md)',
            fontWeight: 700,
            fontSize: '0.95rem',
            background: activeTab === 'sent' ? 'var(--primary)' : 'var(--bg-surface)',
            color: activeTab === 'sent' ? '#ffffff' : 'var(--text-main)',
            border: activeTab === 'sent' ? '1px solid var(--primary)' : '1px solid var(--border-light)',
            boxShadow: activeTab === 'sent' ? '0 4px 12px var(--primary-glow)' : 'none',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)'
          }}
        >
          <Send size={18} />
          <span>Sent Invoices Tracker</span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              backgroundColor: activeTab === 'sent' ? 'rgba(255,255,255,0.25)' : 'var(--border-light)',
              color: activeTab === 'sent' ? '#ffffff' : 'var(--text-main)'
            }}
          >
            {sentInvoices.length}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('requests'); setSearchQuery(''); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: 'var(--radius-md)',
            fontWeight: 700,
            fontSize: '0.95rem',
            background: activeTab === 'requests' ? 'var(--primary)' : 'var(--bg-surface)',
            color: activeTab === 'requests' ? '#ffffff' : 'var(--text-main)',
            border: activeTab === 'requests' ? '1px solid var(--primary)' : '1px solid var(--border-light)',
            boxShadow: activeTab === 'requests' ? '0 4px 12px var(--primary-glow)' : 'none',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)'
          }}
        >
          <Inbox size={18} />
          <span>Customer Request Invoices List</span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              backgroundColor: activeTab === 'requests' ? 'rgba(255,255,255,0.25)' : 'rgba(245, 158, 11, 0.2)',
              color: activeTab === 'requests' ? '#ffffff' : 'var(--accent-amber)',
              fontWeight: 800
            }}
          >
            {invoiceRequests.length}
          </span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px'
        }}
      >
        {activeTab === 'sent' ? (
          <div className="filter-tabs" style={{ margin: 0 }}>
            {['All', 'Paid', 'Unpaid', 'Overdue'].map((tab) => (
              <button
                key={tab}
                className={`filter-tab ${sentFilter === tab ? 'active' : ''}`}
                onClick={() => setSentFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        ) : (
          <div className="filter-tabs" style={{ margin: 0 }}>
            {['All', 'Pending Generation', 'In Review'].map((tab) => (
              <button
                key={tab}
                className={`filter-tab ${requestFilter === tab ? 'active' : ''}`}
                onClick={() => setRequestFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          <input
            type="text"
            className="search-input"
            style={{ paddingLeft: '34px', width: '100%' }}
            placeholder={activeTab === 'sent' ? "Search invoice #, customer..." : "Search request #, customer, PO..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* VIEW 1: SENT INVOICES TRACKER */}
      {activeTab === 'sent' && (
        <div className="card-section">
          <div className="card-section-header">
            <div>
              <h2 className="card-section-title">Sent E-Invoices Tracker</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Audited list of customers already issued with digital invoices, clearance codes, and delivery status.
              </div>
            </div>
            <span className="badge badge-emerald">BIR Compliant (EIS Ready)</span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice No.</th>
                  <th>Customer & TIN</th>
                  <th>BIR Clearance</th>
                  <th>Date Sent</th>
                  <th>Due Date</th>
                  <th>Amount (PHP)</th>
                  <th>Delivery Status</th>
                  <th>Payment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSent.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No sent invoices found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredSent.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        {inv.id}
                      </td>
                      <td>
                        <strong>{inv.customer}</strong>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          TIN: {inv.tin}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                          {inv.recipientEmail}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', background: 'var(--bg-app)', padding: '2px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                          {inv.birClearance}
                        </span>
                      </td>
                      <td>{inv.dateSent}</td>
                      <td>{inv.dueDate}</td>
                      <td style={{ fontWeight: 700, fontSize: '0.925rem' }}>
                        {inv.amount}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                          <CheckCircle2 size={13} style={{ color: 'var(--accent-emerald)' }} />
                          <span>{inv.deliveryStatus}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${inv.paymentBadge}`}>
                          {inv.paymentStatus}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn btn-outline"
                            style={{ padding: '4px 8px', fontSize: '0.725rem' }}
                            onClick={() => handleResendInvoice(inv)}
                            title="Resend to customer email"
                          >
                            Resend
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{ padding: '4px 8px', fontSize: '0.725rem' }}
                            onClick={() => alert(`Downloading PDF copy for ${inv.id}...`)}
                            title="Download PDF"
                          >
                            <Download size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: CUSTOMER REQUEST INVOICES LIST */}
      {activeTab === 'requests' && (
        <div className="card-section">
          <div className="card-section-header">
            <div>
              <h2 className="card-section-title">Customer Invoice Requests Queue</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Incoming e-invoice requests submitted by customers against verified purchase orders.
              </div>
            </div>
            <span className="badge badge-amber">{invoiceRequests.length} Pending Fulfillments</span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Customer / Company</th>
                  <th>PO Reference</th>
                  <th>Request Date</th>
                  <th>Billing Contact</th>
                  <th>Amount (PHP)</th>
                  <th>Priority</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No pending invoice requests at this moment. All requests have been fulfilled!
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((req) => (
                    <tr key={req.requestId}>
                      <td style={{ fontWeight: 700 }}>{req.requestId}</td>
                      <td>
                        <strong>{req.customer}</strong>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          TIN: {req.tin}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)', background: 'var(--bg-app)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
                          {req.poReference}
                        </span>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {req.itemsCount} order items
                        </div>
                      </td>
                      <td>{req.requestDate}</td>
                      <td style={{ fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Mail size={13} style={{ color: 'var(--text-subtle)' }} />
                          <span>{req.contactEmail}</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                        {req.amount}
                      </td>
                      <td>
                        <span className={`badge ${req.priority === 'Urgent' ? 'badge-rose' : 'badge-primary'}`}>
                          {req.priority}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                          onClick={() => handleGenerateAndSend(req)}
                        >
                          <Send size={13} /> Generate & Send Invoice
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
