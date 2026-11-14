import React, { useEffect, useState } from 'react';
import { KeyRound, LayoutGrid, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useConfirm, useNotify } from '../../context/NotificationContext';
import { appLabel } from '../../config/apps';
import './launcher.css';

/*
 * The simple layout for Order Managers (packers), Accounting and Executive, laid out like an ERP home screen: a home page of big app tiles
 * and one slim top bar (home button, the open app's name, theme, sign out). No sidebar. Each app is the same
 * screen the office roles use.
 */
export default function LauncherLayout({ activePage, onSelectPage, children }) {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const notify = useNotify();
  const [theme, setTheme] = useState('light');
  const atHome = activePage === 'home';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need to sign in again to use the E-Invoice System.',
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

  return (
    <div className={`launcher-shell ${atHome ? 'launcher-at-home' : ''}`}>
      <header className="launcher-bar">
        <div className="launcher-bar-left">
          <button type="button" className="launcher-home-btn" onClick={() => onSelectPage('home')}
            title="All apps" aria-label="All apps">
            <LayoutGrid size={20} />
          </button>
          {atHome ? (
            <span className="launcher-brand"><span className="launcher-brand-accent">ISC E-</span>INVOICE</span>
          ) : (
            <span className="launcher-app-name">
              {appLabel(activePage) || (activePage === 'my-password' ? 'Change password' : '')}
            </span>
          )}
        </div>
        <div className="launcher-bar-right">
          <button type="button" className="launcher-icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <span className="launcher-user" title={user?.role}>
            <span className="launcher-avatar">{user?.avatar || '?'}</span>
            <span className="launcher-user-name">{user?.name}</span>
          </span>
          <button type="button" className="launcher-icon-btn" onClick={() => onSelectPage('my-password')}
            title="Change password" aria-label="Change password">
            <KeyRound size={18} />
          </button>
          <button type="button" className="launcher-icon-btn" onClick={handleLogout} title="Sign out" aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main className={atHome ? 'launcher-home' : 'admin-page-container launcher-page'} key={activePage}>
        {children}
      </main>
    </div>
  );
}

/** The home screen: one tile per app the user may open. */
export function AppLauncher({ apps, onOpen }) {
  const { user } = useAuth();
  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  });

  return (
    <div className="launcher-grid-wrap">
      <p className="launcher-greeting">
        {greeting}{user?.name ? `, ${user.name}` : ''}.{apps.length > 0 ? ' What do you want to do?' : ''}
      </p>
      {apps.length === 0 ? (
        <div className="launcher-empty">
          <p className="launcher-empty-title">Your account has no role yet, so there is nothing to open.</p>
          <p>Ask IT to give <strong>{user?.username}</strong> a role (for packers: Order Manager).
            Then sign out and sign in again.</p>
        </div>
      ) : (
        <ul className="launcher-grid">
          {apps.map((app) => {
            const Icon = app.icon;
            return (
              <li key={app.id}>
                <button type="button" className="launcher-tile" onClick={() => onOpen(app.id)} title={app.hint}
                  style={{ '--app-color': app.color }}>
                  <span className="launcher-tile-icon"><Icon size={40} strokeWidth={1.8} /></span>
                  <span className="launcher-tile-label">{app.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
