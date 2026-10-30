import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import AdminLayout from './components/layout/AdminLayout';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import InvoicesPage from './pages/InvoicesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');

  // Handle initial session loading state
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-app)',
          color: 'var(--text-muted)'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            className="spinner"
            style={{
              width: '32px',
              height: '32px',
              borderColor: 'var(--primary-glow)',
              borderTopColor: 'var(--primary)',
              margin: '0 auto 12px'
            }}
          />
          <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            Loading workspace...
          </p>
        </div>
      </div>
    );
  }

  // If user is not authenticated, show Login page
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // If authenticated, render Admin Dashboard with active page
  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setActivePage} />;
      case 'orders':
        return <OrdersPage onNavigate={setActivePage} />;
      case 'invoices':
        return <InvoicesPage />;
      case 'analytics':
        return <AnalyticsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage onNavigate={setActivePage} />;
    }
  };

  return (
    <AdminLayout activePage={activePage} onSelectPage={setActivePage}>
      {renderActivePage()}
    </AdminLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
