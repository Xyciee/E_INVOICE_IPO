import React, { useState, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import './layout.css';

export default function AdminLayout({ children, activePage, onSelectPage }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [theme, setTheme] = useState('light');

  // Synchronize theme attribute on root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const toggleMobileSidebar = () => {
    setIsMobileSidebarOpen((prev) => !prev);
  };

  const closeMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  return (
    <div className="admin-shell">
      {/* Mobile Backdrop overlay */}
      <div
        className={`sidebar-overlay ${isMobileSidebarOpen ? 'active' : ''}`}
        onClick={closeMobileSidebar}
      />

      {/* Sidebar Component */}
      <Sidebar
        activePage={activePage}
        onSelectPage={onSelectPage}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={closeMobileSidebar}
      />

      {/* Main Content Area */}
      <div className="admin-main-wrapper">
        <Header
          activePage={activePage}
          onToggleMobileSidebar={toggleMobileSidebar}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Dynamic Page Container */}
        <main className="admin-page-container animate-fade-in" key={activePage}>
          {children}
        </main>

        <Footer />
      </div>
    </div>
  );
}
