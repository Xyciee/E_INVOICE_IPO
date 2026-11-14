import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import LoginPage from './pages/LoginPage';
import AdminLayout from './components/layout/AdminLayout';
import LauncherLayout, { AppLauncher } from './components/layout/LauncherLayout';
import { appsFor, canOpen, usesLauncher } from './config/apps';
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
import UsersPage from './pages/UsersPage';
import ChangePasswordPage, { RequiredPasswordChange } from './pages/ChangePasswordPage';
import ErrorBoundary from './components/feedback/ErrorBoundary';

const STORAGE_KEY_ACTIVE_PAGE = 'invoicehub_active_page';
const VALID_PAGES = new Set([
  'home',
  'dashboard',
  'packing-scan',
  'orders',
  'invoices',
  'credit-notes',
  'settings',
  'api-tester',
  'api-speed-test',
  'odoo-invoices',
  'odoo-settings',
  'users',
  'my-password'
]);

const PAGE_TAB_TITLES = {
  home: 'Apps',
  dashboard: 'Dashboard',
  'packing-scan': 'Packing Scan',
  orders: 'Orders',
  invoices: 'Invoices Tracker',
  'credit-notes': 'Credit Notes',
  settings: 'Settings',
  'api-tester': 'API Tester',
  'api-speed-test': 'API Speed Test',
  'odoo-invoices': 'Odoo Invoices',
  'odoo-settings': 'Odoo Connection',
  users: 'Users',
  'my-password': 'Change password'
};

/*
 * The page actually shown: the one picked, unless the user's permissions do not open it (an old saved page, a role
 * change) - then their start page. Launcher users (Order Managers, and accounts with no app at all) start on the
 * app launcher ("home"), everyone else on the first app they may open (normally the dashboard). A sidebar user
 * always has at least one app: an account with none gets the launcher (usesLauncher).
 */
function pageFor(user, picked, launcher) {
  const start = launcher ? 'home' : appsFor(user)[0].id;
  if (picked === 'home') return start;
  return canOpen(user, picked) ? picked : start;
}

function AppContent() {
  const { user, isAuthenticated, loading } = useAuth();
  const [pickedPage, setActivePage] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_PAGE);
      return saved && VALID_PAGES.has(saved) ? saved : 'home';
    } catch {
      return 'home';
    }
  });
  const launcher = usesLauncher(user);
  const activePage = isAuthenticated ? pageFor(user, pickedPage, launcher) : pickedPage;

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

  // a temporary password (new account, reset by IT): the backend refuses every screen until it is changed
  if (user?.mustChangePassword) {
    return <RequiredPasswordChange />;
  }

  const renderActivePage = () => {
    switch (activePage) {
      case 'home':
        return <AppLauncher apps={appsFor(user)} onOpen={setActivePage} />;
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
      case 'users':
        return <UsersPage />;
      case 'my-password':
        return <ChangePasswordPage />;
      default:
        return <DashboardPage onNavigate={setActivePage} />;
    }
  };

  const Layout = launcher ? LauncherLayout : AdminLayout;
  return (
    <Layout activePage={activePage} onSelectPage={setActivePage}>
      <ErrorBoundary key={activePage}>
        {renderActivePage()}
      </ErrorBoundary>
    </Layout>
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
