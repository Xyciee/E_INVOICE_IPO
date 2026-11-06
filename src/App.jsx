import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import LoginPage from './pages/LoginPage';
import AdminLayout from './components/layout/AdminLayout';
import DashboardPage from './pages/DashboardPage';
import PackingScanPage from './pages/PackingScanPage';
import OrdersPage from './pages/OrdersPage';
import InvoicesPage from './pages/InvoicesPage';
import SettingsPage from './pages/SettingsPage';
import ApiTesterPage from './pages/ApiTesterPage';
import CreditNotesPage from './pages/CreditNotesPage';
import ErrorBoundary from './components/feedback/ErrorBoundary';

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');

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

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setActivePage} />;
      case 'packing-scan':
        return <PackingScanPage />;
      case 'orders':
        return <OrdersPage onNavigate={setActivePage} />;
      case 'invoices':
        return <InvoicesPage />;
      case 'credit-notes':
        return <CreditNotesPage e />;
      case 'settings':
        return <SettingsPage />;
      case 'api-tester':
        return <ApiTesterPage />;
      default:
        return <DashboardPage onNavigate={setActivePage} />;
    }
  };

  return (
    <AdminLayout activePage={activePage} onSelectPage={setActivePage}>
      <ErrorBoundary key={activePage}>
        {renderActivePage()}
      </ErrorBoundary>
    </AdminLayout>
  );
}

export default function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </NotificationProvider>
  );
}
