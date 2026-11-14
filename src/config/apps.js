import {
  LayoutDashboard, ScanLine, ShoppingCart, Receipt, FileMinus, Gauge, CloudDownload, PlugZap
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
  { id: 'api-speed-test', label: 'API Speed Test', group: 'Diagnostics & System', icon: Gauge, color: '#64748b',
    permission: 'manage_users', hint: 'For IT: how fast the system answers.' },
  { id: 'odoo-settings', label: 'Odoo Connection', group: 'Diagnostics & System', icon: PlugZap, color: '#0f766e',
    permission: 'manage_odoo_settings', hint: 'For IT: where the system reads Odoo from.' }
];

const BY_ID = Object.fromEntries(APPS.map((app) => [app.id, app]));

/** Screens outside APPS (settings, the API tester) are not in any menu and keep working as before. */
export function canOpen(user, pageId) {
  const app = BY_ID[pageId];
  return !app || !app.permission || (user?.permissions || []).includes(app.permission);
}

export function appsFor(user) {
  return APPS.filter((app) => canOpen(user, app.id));
}

export function appLabel(pageId) {
  return BY_ID[pageId]?.label;
}

/*
 * Order Managers (the packers) get the simple app launcher instead of the sidebar. Someone who also has an office
 * role (Executive, Accounting, IT) keeps the full layout. This is a choice of layout only: what each person may see
 * or do still comes from their permissions.
 */
const OFFICE_ROLES = ['executive', 'accounting', 'it'];

export function usesLauncher(user) {
  const roles = (user?.roles || []).map((r) => String(r).toLowerCase());
  return roles.includes('order_manager') && !roles.some((r) => OFFICE_ROLES.includes(r));
}
