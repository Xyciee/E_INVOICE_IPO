import React from 'react';
import {
  LayoutDashboard,
  ScanLine,
  ShoppingCart,
  Receipt,
  FileMinus,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Terminal,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useConfirm, useNotify } from '../../context/NotificationContext';

export default function Sidebar({
  activePage,
  onSelectPage,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile
}) {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const notify = useNotify();

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need to sign in again to access the E-Invoice System.',
      confirmText: 'Sign Out',
      cancelText: 'Stay Signed In',
      variant: 'danger'
    });
    if (!ok) return;

    try {
      await logout();
      notify.success('Signed out', 'You have been signed out successfully.');
    } catch {
      notify.danger('Sign out failed', 'Could not reach the server. Please try again.');
    }
  };

  const navGroups = [
    {
      group: 'Overview',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          badge: null
        }
      ]
    },
    {
      group: 'Transactions & Billing',
      items: [
        {
          id: 'packing-scan',
          label: 'Packing Scan',
          icon: ScanLine,
          badge: 'Live'
        },
        {
          id: 'orders',
          label: 'Orders',
          icon: ShoppingCart,
          badge: null
        },
        {
          id: 'invoices',
          label: 'Invoices Tracker',
          icon: Receipt,
        },
        {
          id: 'credit-notes',
          label: 'Credit Notes',
          icon: FileMinus,
        }
      ]
    },
    {
      group: 'System',
      items: [
        {
          id: 'api-tester',
          label: 'API Tester',
          icon: Terminal,
          badge: null
        },
        {
          id: 'settings',
          label: 'Settings',
          icon: Settings,
          badge: null
        }
      ]
    }
  ];

  const handleNavClick = (id) => {
    onSelectPage(id);
    if (isMobileOpen && onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <aside
      className={`admin-sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''
        }`}
    >
      {/* Right-Middle Sidebar Collapse/Expand Toggle Button */}
      <button
        type="button"
        className="sidebar-collapse-btn"
        onClick={onToggleCollapse}
        title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className="sidebar-header" style={{ justifyContent: 'center' }}>
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            handleNavClick('dashboard');
          }}
          className="brand-link"
          style={{ justifyContent: 'center', width: '100%' }}
          title="ISC E-Invoice System"
        >
          {isCollapsed ? (
            <span className="brand-name" style={{ fontSize: '1.35rem', fontWeight: 800 }}>
              E
            </span>
          ) : (
            <div className="brand-info" style={{ alignItems: 'center', textAlign: 'center', width: '100%' }}>
              <span className="brand-name" style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                ISC E-Invoice
              </span>
            </div>
          )}
        </a>

        <button
          className="sidebar-mobile-close-btn"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {navGroups.map((group) => (
          <div key={group.group} className="nav-group-wrapper">
            {!isCollapsed && (
              <div className="nav-group-title">{group.group}</div>
            )}
            <ul className="nav-list">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                return (
                  <li key={item.id}>
                    <button
                      className={`nav-item-btn ${isActive ? 'active' : ''}`}
                      onClick={() => handleNavClick(item.id)}
                      data-tooltip={item.label}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <span className="nav-item-icon">
                        <Icon size={19} />
                      </span>
                      {!isCollapsed ? (
                        <>
                          <span className="nav-item-label">{item.label}</span>
                          {item.badge && (
                            <span className="nav-item-badge">{item.badge}</span>
                          )}
                        </>
                      ) : (
                        item.badge && <span className="nav-item-collapsed-dot" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {/* User Profile Card with Logout */}
        <div className="sidebar-user-card">
          <div className="sidebar-user-left">
            <div
              className="sidebar-user-avatar"
              title={isCollapsed ? `${user?.name || 'Administrator'} (${user?.role || 'User'})` : undefined}
            >
              {user?.avatar || 'AD'}
              <span className="avatar-online-dot" />
            </div>
            {!isCollapsed && (
              <div className="sidebar-user-details">
                <div className="sidebar-user-name">{user?.name || 'Administrator'}</div>
                <div className="sidebar-user-role">{user?.role || 'Super Admin'}</div>
              </div>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="sidebar-logout-btn"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
