import React, { useState, useEffect } from 'react';
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
import ApiSpeedTestPage from './pages/ApiSpeedTestPage';
import CreditNotesPage from './pages/CreditNotesPage';
import OdooInvoicesPage from './pages/OdooInvoicesPage';
import OdooSettingsPage from './pages/OdooSettingsPage';
import ErrorBoundary from './components/feedback/ErrorBoundary';

const STORAGE_KEY_ACTIVE_PAGE = 'invoicehub_active_page';
const VALID_PAGES = new Set([
  'dashboard',
  'packing-scan',
  'orders',
  'invoices',
  'credit-notes',
  'settings',
  'api-tester',
  'api-speed-test',
  'odoo-invoices',
  'odoo-settings'
]);

const PAGE_TAB_TITLES = {
  dashboard: 'Dashboard',
  'packing-scan': 'Packing Scan',
  orders: 'Orders',
  invoices: 'Invoices Tracker',
  'credit-notes': 'Credit Notes',
  settings: 'Settings',
  'api-tester': 'API Tester',
  'api-speed-test': 'API Speed Test',
  'odoo-invoices': 'Odoo Invoices',
  'odoo-settings': 'Odoo Connection'
};

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const [activePage, setActivePage] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_PAGE);
      return saved && VALID_PAGES.has(saved) ? saved : 'dashboard';
    } catch {
      return 'dashboard';
    }
  });

  useEffect(() => {
    try {
      if (VALID_PAGES.has(activePage)) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_PAGE, activePage);
      }
    } catch {
      // Ignore storage errors
    }
  }, [activePage]);

  useEffect(() => {
    const pageLabel = isAuthenticated
      ? PAGE_TAB_TITLES[activePage] ||
        activePage.charAt(0).toUpperCase() + activePage.slice(1)
      : 'Login';
    const tabTitle = `E-Invoice - ${pageLabel}`;
    document.title = tabTitle;

    const clearTitleForPrint = () => {
      document.title = '\u200B';
    };
    const restoreTitleAfterPrint = () => {
      document.title = tabTitle;
    };

    window.addEventListener('beforeprint', clearTitleForPrint);
    window.addEventListener('afterprint', restoreTitleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', clearTitleForPrint);
      window.removeEventListener('afterprint', restoreTitleAfterPrint);
    };
  }, [activePage, isAuthenticated]);

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
      case 'api-speed-test':
        return <ApiSpeedTestPage />;
      case 'odoo-invoices':
        return <OdooInvoicesPage />;
      case 'odoo-settings':
        return <OdooSettingsPage />;
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
