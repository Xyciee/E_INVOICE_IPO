import React, { useState } from 'react';
import {
  ShoppingCart,
  Plus,
  Search,
  Download,
  Filter,
  FileCheck,
  Clock,
  CheckCircle,
  Truck,
  ArrowRight
} from 'lucide-react';
import './pages.css';

export default function OrdersPage({ onNavigate }) {
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const orders = [
    {
      id: 'ORD-2026-0891',
      customer: 'San Miguel Brewery Corp',
      tin: '000-128-940-000',
      date: 'Oct 29, 2026',
      items: 'Industrial Packaging Supplies (Box of 500)',
      total: '₱345,000.00',
      status: 'Awaiting Invoice',
      badgeClass: 'badge-amber',
      paymentTerms: '30 Days Net'
    },
    {
      id: 'ORD-2026-0890',
      customer: 'Jollibee Worldwide Services',
      tin: '001-982-311-000',
      date: 'Oct 28, 2026',
      items: 'POS Paper Rolls & Thermal Ribbon Cartridges',
      total: '₱128,500.00',
      status: 'Invoice Issued',
      badgeClass: 'badge-emerald',
      paymentTerms: '15 Days Net'
    },
    {
      id: 'ORD-2026-0889',
      customer: 'Ayala Land Properties Inc',
      tin: '002-334-118-000',
      date: 'Oct 27, 2026',
      items: 'Commercial HVAC Air Filter Assemblies',
      total: '₱890,000.00',
      status: 'Awaiting Invoice',
      badgeClass: 'badge-amber',
      paymentTerms: '60 Days Net'
    },
    {
      id: 'ORD-2026-0888',
      customer: 'SM Prime Holdings',
      tin: '000-449-712-000',
      date: 'Oct 25, 2026',
      items: 'Security Turnstiles Maintenance Kit',
      total: '₱412,000.00',
      status: 'Completed',
      badgeClass: 'badge-primary',
      paymentTerms: 'Immediate'
    },
    {
      id: 'ORD-2026-0887',
      customer: 'Megaworld Lifestyle Malls',
      tin: '003-918-204-000',
      date: 'Oct 24, 2026',
      items: 'Facility Sanitizing Stations & Consumables',
      total: '₱94,500.00',
      status: 'Processing',
      badgeClass: 'badge-amber',
      paymentTerms: '30 Days Net'
    },
    {
      id: 'ORD-2026-0886',
      customer: 'Universal Robina Corp',
      tin: '000-721-508-000',
      date: 'Oct 22, 2026',
      items: 'Conveyor Roller Bearings Set (20 units)',
      total: '₱560,000.00',
      status: 'Invoice Issued',
      badgeClass: 'badge-emerald',
      paymentTerms: '30 Days Net'
    }
  ];

  const filteredOrders = orders.filter((order) => {
    const matchesFilter =
      filter === 'All' ||
      (filter === 'Awaiting Invoice' && order.status === 'Awaiting Invoice') ||
      (filter === 'Invoice Issued' && order.status === 'Invoice Issued') ||
      (filter === 'Processing' && order.status === 'Processing');

    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.items.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Customer Orders</h1>
          <p className="page-subtitle">
            Manage incoming purchase orders, verify fulfillment, and generate official electronic invoices.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => alert('Exporting orders to Excel/CSV...')}>
            <Download size={16} /> Export Orders
          </button>
          <button className="btn btn-primary" onClick={() => alert('New Purchase Order modal...')}>
            <Plus size={16} /> Create Order
          </button>
        </div>
      </div>

      {/* KPI Stats in Philippine Peso */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Monthly Orders</span>
            <div className="stat-card-icon-wrap" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
              <ShoppingCart size={20} />
            </div>
          </div>
          <div className="stat-card-value">₱2,430,000.00</div>
          <div className="stat-card-footer">
            <span className="trend-pill trend-positive">+11.4%</span>
            <span className="trend-description">vs previous month</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Orders Awaiting Invoice</span>
            <div className="stat-card-icon-wrap" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
              <Clock size={20} />
            </div>
          </div>
          <div className="stat-card-value">₱1,235,000.00</div>
          <div className="stat-card-footer">
            <span className="badge badge-amber">2 Orders Urgent</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Invoices Generated</span>
            <div className="stat-card-icon-wrap" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
              <FileCheck size={20} />
            </div>
          </div>
          <div className="stat-card-value">₱1,195,000.00</div>
          <div className="stat-card-footer">
            <span className="trend-pill trend-positive">88% billed</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs and Search Bar */}
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
        <div className="filter-tabs" style={{ margin: 0 }}>
          {['All', 'Awaiting Invoice', 'Invoice Issued', 'Processing'].map((tab) => (
            <button
              key={tab}
              className={`filter-tab ${filter === tab ? 'active' : ''}`}
              onClick={() => setFilter(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          <input
            type="text"
            className="search-input"
            style={{ paddingLeft: '34px', width: '100%' }}
            placeholder="Search order #, customer, item..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="card-section">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order Ref</th>
                <th>Customer / Client</th>
                <th>TIN</th>
                <th>Order Date</th>
                <th>Purchased Items</th>
                <th>Total (PHP)</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td style={{ fontWeight: 600 }}>{order.id}</td>
                  <td>
                    <strong>{order.customer}</strong>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Terms: {order.paymentTerms}</div>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{order.tin}</td>
                  <td>{order.date}</td>
                  <td style={{ maxWidth: '240px', fontSize: '0.8rem' }}>{order.items}</td>
                  <td style={{ fontWeight: 700, fontSize: '0.925rem' }}>{order.total}</td>
                  <td>
                    <span className={`badge ${order.badgeClass}`}>{order.status}</span>
                  </td>
                  <td>
                    {order.status === 'Awaiting Invoice' ? (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                        onClick={() => {
                          if (onNavigate) {
                            onNavigate('invoices');
                          } else {
                            alert(`Generating E-Invoice for ${order.id}...`);
                          }
                        }}
                      >
                        Generate E-Invoice
                      </button>
                    ) : (
                      <button
                        className="btn btn-outline"
                        style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                        onClick={() => alert(`Viewing details for ${order.id}...`)}
                      >
                        View Order
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
