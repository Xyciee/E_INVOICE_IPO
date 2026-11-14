/**
 * User accounts (backend api/users.py). Everything except changeMyPassword needs the permission manage_users (IT).
 * No delete: leavers are deactivated. A temporary password (new user, reset) is shown once and must be changed by
 * its owner at the next sign-in. Passwords are never stored or logged here.
 */
import { api } from './apiClient.js';

export const usersApi = {
  list: (query) => api.get('/api/users', query),
  create: (body) => api.post('/api/users', body),
  update: (id, body) => api.patch(`/api/users/${id}`, body),
  resetPassword: (id) => api.post(`/api/users/${id}/reset-password`, {}),
  roles: () => api.get('/api/roles'),
  // any signed-in user: {current_password, new_password}
  changeMyPassword: (body) => api.post('/api/me/password', body)
};

/** Role names as people say them. Unknown roles show their own name. */
export const ROLE_INFO = {
  order_manager: { label: 'Order Manager', help: 'Packers: scan, print, reprint, orders and missed scans.' },
  accounting: { label: 'Accounting', help: 'Credit notes, BIR JSON, reports and exports, Odoo sync.' },
  executive: { label: 'Executive', help: 'Sees invoices, reports and the audit log. Cannot issue or change anything.' },
  it: { label: 'IT', help: 'Everything, including users, stations and the Odoo connection.' }
};

export function roleLabel(name) {
  return ROLE_INFO[name]?.label || name;
}
