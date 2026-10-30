import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({
  activePage,
  onSelectPage,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile
}) {
  const { user, logout } = useAuth();

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
          id: 'orders',
          label: 'Orders',
          icon: ShoppingCart,
          badge: '8 New'
        },
        {
          id: 'invoices',
          label: 'Invoices Tracker',
          icon: Receipt,
          badge: '14'
        }
      ]
    },
    {
      group: 'System',
      items: [
        {
          id: 'analytics',
          label: 'Analytics',
          icon: BarChart3,
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
      className={`admin-sidebar ${isCollapsed ? 'collapsed' : ''} ${
        isMobileOpen ? 'mobile-open' : ''
      }`}
    >
      {/* Brand Header */}
      <div className="sidebar-header">
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            handleNavClick('dashboard');
          }}
          className="brand-link"
          title="ISC E-Invoice System"
        >
          <div className="brand-icon">
            <Receipt size={20} />
          </div>
          {!isCollapsed && (
            <div className="brand-info">
              <span className="brand-name">ISC E-Invoice</span>
              <span className="brand-tagline">Admin System</span>
            </div>
          )}
        </a>

        {/* Desktop Collapse / Expand Toggle */}
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCollapsed ? 'Expand sidebar (Ctrl + B)' : 'Collapse sidebar (Ctrl + B)'}
        >
          {isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>

        {/* Mobile Close Button (shown only on mobile) */}
        <button
          className="sidebar-mobile-close-btn"
          onClick={onCloseMobile}
          aria-label="Close mobile navigation"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation Groups */}
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
                      {!isCollapsed && (
                        <>
                          <span className="nav-item-label">{item.label}</span>
                          {item.badge && (
                            <span className="nav-item-badge">{item.badge}</span>
                          )}
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer Profile Area with Logout */}
      <div className="sidebar-footer">
        <div className="sidebar-user-card">
          <div className="sidebar-user-left">
            <div
              className="sidebar-user-avatar"
              title={isCollapsed ? `${user?.name || 'Admin'} (${user?.role || 'User'})` : undefined}
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
            onClick={logout}
            className="sidebar-logout-btn"
            title="Sign Out"
            aria-label="Sign Out"
            data-tooltip="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
