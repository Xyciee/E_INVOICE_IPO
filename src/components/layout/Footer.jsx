import React from 'react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="admin-footer">
      <div className="footer-left">
        <span>© {currentYear} ISC E-Invoicing System. All rights reserved.</span>
      </div>

      <div className="footer-right">
        <span className="badge badge-primary">v1.0.0</span>
      </div>
    </footer>
  );
}
