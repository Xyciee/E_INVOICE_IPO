import {
  LayoutDashboard, ScanLine, ShoppingCart, Receipt, FileMinus, Gauge, CloudDownload, PlugZap, Users
} from 'lucide-react';

/*
 * Every screen ("app") of the system, in one place: the sidebar and the app launcher both read this list.
 * `permission` = the permission name from /api/me a user needs to see the app (CLAUDE.md §5.2). The backend checks
 * the same permission on every call, so hiding an app is only about not showing screens that would refuse.
 * `hint` = one plain sentence for people who are not technical (tooltip on the launcher tile).
 */
export const APPS = [
  { id: 'dashboard', label: 'Dashboard', group: 'Overview', icon: LayoutDashboard, color: '#3b82f6',
    permission: 'view_documents', hint: 'Today at a glance: invoices and orders that need attention.' },
  { id: 'packing-scan', label: 'Packing Scan', group: 'Transactions & Billing', icon: ScanLine, color: '#10b981',
    permission: 'scan_and_print', hint: 'Scan the waybill, then print the invoice for the box.' },
  { id: 'orders', label: 'Orders', group: 'Transactions & Billing', icon: ShoppingCart, color: '#f59e0b',
    permission: 'view_prepack', hint: "Today's orders, problems to fix before packing, missed scans." },
  { id: 'invoices', label: 'Invoices Tracker', group: 'Transactions & Billing', icon: Receipt, color: '#8b5cf6',
    permission: 'view_documents', hint: 'Find an invoice and see if it was printed.' },
  { id: 'credit-notes', label: 'Credit Notes', group: 'Transactions & Billing', icon: FileMinus, color: '#f43f5e',
    permission: 'view_credit_worklist', hint: 'Cancelled or returned orders that were already invoiced.' },
  { id: 'odoo-invoices', label: 'Odoo Invoices', group: 'Transactions & Billing', icon: CloudDownload, color: '#0ea5e9',
    permission: 'view_odoo_invoices', hint: 'Invoices posted in Odoo, read into this system.' },
  { id: 'users', label: 'Users', group: 'Diagnostics & System', icon: Users, color: '#6366f1',
    permission: 'manage_users', hint: 'For IT: accounts, roles, passwords.' },
  { id: 'api-speed-test', label: 'API Speed Test', group: 'Diagnostics & System', icon: Gauge, color: '#64748b',
    permission: 'manage_users', hint: 'For IT: how fast the system answers.' },
  { id: 'odoo-settings', label: 'Odoo Connection', group: 'Diagnostics & System', icon: PlugZap, color: '#0f766e',
    permission: 'manage_odoo_settings', hint: 'For IT: where the system reads Odoo from.' }
];

const BY_ID = Object.fromEntries(APPS.map((app) => [app.id, app]));

// screens that are in no menu (reached only from a saved page or a link): IT only
const HIDDEN_PAGES = { settings: 'manage_users', 'api-tester': 'manage_users' };

/** Whether the user's permissions open this screen ("home", the launcher, is open to everyone). */
export function canOpen(user, pageId) {
  const needed = BY_ID[pageId]?.permission ?? HIDDEN_PAGES[pageId];
  return !needed || (user?.permissions || []).includes(needed);
}

export function appsFor(user) {
  return APPS.filter((app) => canOpen(user, app.id));
}

export function appLabel(pageId) {
  return BY_ID[pageId]?.label;
}

/*
 * Order Managers (the packers) and Accounting staff get the simple app launcher instead of the sidebar (2026-11-14:
 * Accounting added). Someone who also has a sidebar role (Executive, IT) keeps the full layout. This is a choice of
 * layout only: which apps each person sees, and what they may do, still comes from their permissions.
 * An account that may open no app at all (no role yet) also gets the launcher, which then says to ask IT.
 */
const LAUNCHER_ROLES = ['order_manager', 'accounting'];
const SIDEBAR_ROLES = ['executive', 'it'];

export function usesLauncher(user) {
  const roles = (user?.roles || []).map((r) => String(r).toLowerCase());
  if (appsFor(user).length === 0) return true;
  return roles.some((r) => LAUNCHER_ROLES.includes(r)) && !roles.some((r) => SIDEBAR_ROLES.includes(r));
}
