import React, { useState } from 'react';
import {
  Menu,
  Search,
  Bell,
  Sun,
  Moon,
  ChevronRight,
  User,
  CheckCircle2,
  Clock,
  ExternalLink,
  LogOut,
  ChevronDown,
  Shield
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Header({
  activePage,
  onToggleSidebar,
  onToggleMobileSidebar,
  theme,
  onToggleTheme
}) {
  const { user, logout } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const notifications = [
    {
      id: 1,
      title: 'Invoice #INV-2026-089 paid',
      time: '5 mins ago',
      type: 'success',
      icon: CheckCircle2
    },
    {
      id: 2,
      title: 'New customer registration: Acme Corp',
      time: '25 mins ago',
      type: 'info',
      icon: Clock
    },
    {
      id: 3,
      title: 'Tax report generated for Q3',
      time: '1 hour ago',
      type: 'system',
      icon: ExternalLink
    }
  ];

  const handleToggle = onToggleSidebar || onToggleMobileSidebar;

  return (
    <header className="admin-header">
      {/* Left: Sidebar Toggle & Breadcrumbs */}
      <div className="header-left">
        <button
          className="sidebar-toggle-btn"
          onClick={handleToggle}
          aria-label="Toggle Sidebar Navigation"
          title="Toggle Navigation (Menu)"
        >
          <Menu size={20} />
        </button>

        <div className="breadcrumbs">
          <span className="breadcrumb-root">Portal</span>
          <ChevronRight size={14} className="breadcrumb-separator" />
          <span className="breadcrumb-active">
            {activePage.charAt(0).toUpperCase() + activePage.slice(1)}
          </span>
        </div>
      </div>

      {/* Center: Search */}
      <div className="header-search">
        <Search size={16} className="search-icon" />
        <input
          type="text"
          className="search-input"
          placeholder="Search invoices, clients..."
        />
        <span className="search-shortcut">⌘K</span>
      </div>

      {/* Right: Actions */}
      <div className="header-right">
        {/* Theme Toggle Button */}
        <button
          className="header-action-btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notifications Button */}
        <div style={{ position: 'relative' }}>
          <button
            className="header-action-btn"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfileMenu(false);
              if (!notificationsRead) setNotificationsRead(true);
            }}
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell size={18} />
            {!notificationsRead && <span className="notification-badge" />}
          </button>

          {/* Notifications Dropdown Panel */}
          {showNotifications && (
            <div
              style={{
                position: 'absolute',
                top: '46px',
                right: 0,
                width: '320px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                padding: '14px',
                zIndex: 50,
                animation: 'fadeIn 0.2s ease'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px'
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  Notifications
                </span>
                <span className="badge badge-primary">3 New</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {notifications.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '8px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-app)',
                        fontSize: '0.825rem'
                      }}
                    >
                      <div
                        style={{
                          padding: '6px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor:
                            item.type === 'success'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(59, 130, 246, 0.15)',
                          color:
                            item.type === 'success'
                              ? 'var(--accent-emerald)'
                              : 'var(--primary)'
                        }}
                      >
                        <Icon size={14} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{item.title}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {item.time}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
