import React from 'react';
import { ChevronLeft, ChevronRight, KeyRound, LogOut, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useConfirm, useNotify } from '../../context/NotificationContext';
import { appsFor } from '../../config/apps';

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

  // the apps this user may open (config/apps.js, by permission from /api/me), grouped as before
  const navGroups = [];
  appsFor(user).forEach((app) => {
    let group = navGroups.find((g) => g.group === app.group);
    if (!group) {
      group = { group: app.group, items: [] };
      navGroups.push(group);
    }
    group.items.push(app);
  });

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
            <div
              className="text-center font-['Montserrat',sans-serif]"
              style={{ textAlign: 'center', fontFamily: "'Montserrat', sans-serif" }}
            >
              <div
                className="text-2xl font-black tracking-tight"
                style={{ fontSize: '1.5rem', lineHeight: '2rem', fontWeight: 900, letterSpacing: '-0.025em' }}
              >
                <span style={{ color: '#0284c7' }}>I</span>
              </div>
            </div>
          ) : (
            /* Montserrat Uppercase Variant */
            <div
              className="text-center font-['Montserrat',sans-serif]"
              style={{ textAlign: 'center', fontFamily: "'Montserrat', sans-serif", width: '100%' }}
            >
              <div
                className="text-2xl font-black tracking-tight"
                style={{ fontSize: '1.5rem', lineHeight: '2rem', fontWeight: 900, letterSpacing: '-0.025em' }}
              >
                <span style={{ color: '#0284c7' }}>ISC E-</span>
                <span
                  className="text-slate-900 uppercase"
                  style={{ color: '#ffffff', textTransform: 'uppercase' }}
                >
                  INVOICE
                </span>
              </div>
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

          {!isCollapsed && (
            <button
              onClick={() => handleNavClick('my-password')}
              className="sidebar-logout-btn"
              title="Change password"
              aria-label="Change password"
            >
              <KeyRound size={16} />
            </button>
          )}
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
