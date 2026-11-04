/**
 * Catalog of live backend endpoints (from E_INVOICING_APP_HOW_IT_WORKS.md §7).
 * `…` in paths = {platform}/{store_id}/{order_id}.
 * Body templates are editable starting points — adjust to the backend schema.
 */
const ORDER_PARAMS = ['platform', 'store_id', 'order_id'];

export const API_GROUPS = [
  {
    group: 'System & Auth',
    endpoints: [
      { id: 'health', method: 'GET', path: '/api/health', permission: 'anyone',
        description: '200 if the database answers, else 503' },
      { id: 'csrf', method: 'GET', path: '/api/auth/csrf', permission: 'anyone',
        description: 'Sets the CSRF cookie; call first' },
      { id: 'login', method: 'POST', path: '/api/auth/login', permission: 'anyone',
        description: 'Signs in; 400 wrong password, 429 after 5 failures in 15 min',
        body: { username: '', password: '' } },
      { id: 'logout', method: 'POST', path: '/api/auth/logout', permission: 'anyone',
        description: 'Signs out (this will end your current session)' },
      { id: 'me', method: 'GET', path: '/api/me', permission: 'signed in',
        description: 'Username, roles, permissions, stations, reprint reasons' }
    ]
  },
  {
    group: 'Packing Scan',
    endpoints: [
      { id: 'scan-lookup', method: 'GET', path: '/api/scan/{tracking}', permission: 'scan_and_print',
        description: 'Lookup only: 202 not synced, 200 order (+ current invoice), 409 ambiguous, 503 retry' },
      { id: 'scan-issue', method: 'POST', path: '/api/scan/issue', permission: 'scan_and_print',
        description: 'Issues or returns the current invoice, or says why it is blocked; never prints',
        body: { tracking: '' } },
      { id: 'doc-print', method: 'POST', path: '/api/documents/{id}/prints', permission: 'scan_and_print',
        description: 'Logs a print; reprint needs a reason; replaced invoice refused (409)',
        body: { reason: '' } },
      { id: 'scan-gave-up', method: 'POST', path: '/api/scans/gave-up', permission: 'scan_and_print',
        description: 'Reports a scan that waited 60 s',
        body: { tracking: '' } }
    ]
  },
  {
    group: 'Documents',
    endpoints: [
      { id: 'doc-get', method: 'GET', path: '/api/documents/{id}', permission: 'view_documents',
        description: 'Header, lines, prints, credit notes, replaced by / replaces' },
      { id: 'doc-search', method: 'GET', path: '/api/documents', permission: 'view_documents',
        description: 'Search by document number, order id or tracking',
        query: [{ key: 'q', placeholder: 'document no., order id or tracking' }] },
      { id: 'doc-eis', method: 'GET', path: '/api/documents/{id}/eis-json', permission: 'view_eis_json',
        description: 'BIR JSON preview and its issues' }
    ]
  },
  {
    group: 'Pre-pack & Orders',
    endpoints: [
      { id: 'order-draft', method: 'GET', path: '/api/orders/{platform}/{store_id}/{order_id}/draft',
        permission: 'view_prepack', pathParams: ORDER_PARAMS,
        description: 'Live draft: state, hold reason, totals, lines, current invoice' },
      { id: 'prepack', method: 'GET', path: '/api/prepack', permission: 'view_prepack',
        description: 'Pre-pack list; problems_only=1 for exceptions',
        query: [{ key: 'problems_only', placeholder: '1 for exceptions only' }] },
      { id: 'order-issue', method: 'POST', path: '/api/orders/{platform}/{store_id}/{order_id}/issue',
        permission: 'issue_missed_scan', pathParams: ORDER_PARAMS,
        description: 'Missed-scan issue without a scan', body: {} }
    ]
  },
  {
    group: 'Scan Exceptions',
    endpoints: [
      { id: 'scans-unresolved', method: 'GET', path: '/api/scans/unresolved', permission: 'resolve_scans',
        description: 'Gave-up and error scans not yet resolved' },
      { id: 'scan-resolve', method: 'POST', path: '/api/scans/{id}/resolve', permission: 'resolve_scans',
        description: 'Marks one resolved, with a note', body: { note: '' } }
    ]
  },
  {
    group: 'Credit Notes',
    endpoints: [
      { id: 'cn-candidates', method: 'GET', path: '/api/credit-notes/candidates', permission: 'view_credit_worklist',
        description: 'Credit-note work list with suggestions' },
      { id: 'invoice-balance', method: 'GET', path: '/api/invoices/{id}/balance', permission: 'view_credit_worklist',
        description: 'What is still open per line' },
      { id: 'cn-issue', method: 'POST', path: '/api/credit-notes', permission: 'issue_credit_note',
        description: 'Issues a credit note; never over-credits',
        body: { invoice_id: '', reason_code: '', reason: '', lines: [{ line_id: '', amount: '0.00' }] } }
    ]
  },
  {
    group: 'Stations & Audit',
    endpoints: [
      { id: 'stations-list', method: 'GET', path: '/api/stations', permission: 'manage_stations',
        description: 'List packing stations' },
      { id: 'stations-create', method: 'POST', path: '/api/stations', permission: 'manage_stations',
        description: 'Create a packing station; code fixed once created',
        body: { code: '', name: '' } },
      { id: 'stations-update', method: 'PATCH', path: '/api/stations/{id}', permission: 'manage_stations',
        description: 'Update a packing station (code cannot change)', body: { name: '' } },
      { id: 'audit', method: 'GET', path: '/api/audit', permission: 'view_audit',
        description: 'Audit log, newest first, with filters',
        query: [{ key: 'page', placeholder: 'optional' }] }
    ]
  }
];

/** Extract `{param}` names from a path template */
export function getPathParams(endpoint) {
  if (endpoint.pathParams) return endpoint.pathParams;
  return [...endpoint.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

export const ALL_ENDPOINTS = API_GROUPS.flatMap((g) =>
  g.endpoints.map((e) => ({ ...e, group: g.group }))
);
