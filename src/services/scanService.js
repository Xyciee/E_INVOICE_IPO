import { getCsrfToken } from './authService';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const FALLBACK_REPRINT_REASONS = [
  { code: 'damaged', label: 'Damaged or torn printout' },
  { code: 'paper_jam', label: 'Printer paper jam' },
  { code: 'faded', label: 'Faded thermal print' },
  { code: 'lost', label: 'Misplaced before sealing' },
  { code: 'other', label: 'Other reason' }
];

export function normalizeReprintReasons(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return FALLBACK_REPRINT_REASONS;
  }

  return reasons.map((item) => {
    if (typeof item === 'string') {
      return {
        code: item,
        label: item.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      };
    }
    return {
      code: item.code || item.value || item.id || String(item),
      label: item.label || item.name || item.description || item.code || String(item)
    };
  });
}

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const send = async (refreshCsrf = false) => {
    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    };

    if (isMutation) {
      const token = await getCsrfToken(refreshCsrf);
      if (token) headers['X-CSRFToken'] = token;
    }

    return fetch(`${API_BASE}${path}`, {
      ...options,
      method,
      headers,
      credentials: 'include',
      body:
        options.body && typeof options.body !== 'string'
          ? JSON.stringify(options.body)
          : options.body
    });
  };

  try {
    let res = await send(false);
    if (res.status === 403 && isMutation) {
      res = await send(true);
    }

    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { detail: text || res.statusText };
      }
    }

    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 503,
      networkError: true,
      data: { detail: err?.message || 'Unable to reach server.' }
    };
  }
}

export function checkBackendHealth() {
  return request('/api/health');
}

export async function lookupWaybillScan(tracking) {
  const clean = encodeURIComponent(tracking.trim());
  const res = await request(`/api/scan/${clean}`);
  return {
    ...res,
    classified: parseLookupResult(res, tracking.trim())
  };
}

function parseLookupResult(res, tracking) {
  const { status, data } = res;

  if (status === 503) {
    return {
      state: 'DB_DOWN_503',
      title: 'Database Unavailable',
      message: data?.detail || data?.message || 'Database connection error. Retrying...'
    };
  }

  if (status === 202 || data?.status === 'not_synced' || data?.state === 'not_synced') {
    return {
      state: 'NOT_SYNCED_202',
      title: 'Order Not Synced Yet',
      message:
        data?.detail ||
        data?.message ||
        `Waybill ${tracking} is not yet synced. Retrying every 3 seconds...`
    };
  }

  if (status === 409 || data?.status === 'ambiguous' || data?.error === 'ambiguous') {
    return {
      state: 'AMBIGUOUS_409',
      title: 'Duplicate Waybill Found',
      message:
        data?.detail ||
        data?.message ||
        'Multiple orders share this tracking number. Set parcel aside for supervisor.',
      orders: data?.orders || data?.matches || []
    };
  }

  if (!res.ok) {
    return {
      state: 'ERROR',
      title: status === 403 ? 'Access Denied' : `Lookup Error (${status})`,
      message:
        data?.detail ||
        data?.message ||
        data?.error ||
        (status === 404
          ? `No order found for tracking number ${tracking}.`
          : 'Could not look up waybill.')
    };
  }

  const order = data?.order || data;
  const currentInvoice =
    data?.current_invoice ||
    data?.invoice ||
    data?.document ||
    order?.current_invoice ||
    order?.invoice ||
    null;

  const orderStatus = String(
    order?.status || order?.order_status || order?.platform_status || data?.status || ''
  ).toLowerCase();

  const isCancelledOrReturned =
    orderStatus.includes('cancel') ||
    orderStatus.includes('return') ||
    orderStatus.includes('refund') ||
    data?.screen_color === 'red';

  const isUnpaid =
    orderStatus === 'unpaid' ||
    orderStatus === 'not_paid' ||
    orderStatus === 'pending_payment' ||
    order?.is_paid === false ||
    data?.screen_color === 'amber';

  if (isCancelledOrReturned) {
    return {
      state: 'DO_NOT_SHIP_RED',
      title: 'Do Not Ship — Cancelled / Returned',
      message:
        data?.detail ||
        order?.hold_reason ||
        `Order is marked ${orderStatus.toUpperCase()}. Set parcel aside immediately.`,
      order,
      currentInvoice
    };
  }

  if (isUnpaid) {
    return {
      state: 'DO_NOT_SHIP_AMBER',
      title: 'Do Not Ship — Unpaid Order',
      message:
        data?.detail ||
        order?.hold_reason ||
        'Payment is not yet confirmed for this order. Hold parcel.',
      order,
      currentInvoice
    };
  }

  return {
    state: 'ORDER_OK',
    title: 'Order Ready',
    message: currentInvoice
      ? `Existing invoice: ${currentInvoice.document_number || currentInvoice.invoice_number || currentInvoice.id}`
      : 'Order verified.',
    order,
    currentInvoice
  };
}

export async function issueAtScan({ tracking, stationId, stationCode }) {
  const payload = { tracking: tracking.trim() };
  if (stationId !== undefined && stationId !== null && stationId !== '') {
    payload.station_id = stationId;
  }
  if (stationCode) {
    payload.station_code = stationCode;
    payload.station = stationCode;
  }

  const res = await request('/api/scan/issue', {
    method: 'POST',
    body: payload
  });

  return {
    ...res,
    classified: parseIssueResult(res)
  };
}

function parseIssueResult(res) {
  const { ok, status, data } = res;

  if (status === 503) {
    return {
      outcome: 'DB_DOWN_503',
      title: 'Database Unavailable',
      reason: data?.detail || 'Database did not respond. Please retry.'
    };
  }

  const rawState = String(
    data?.outcome || data?.result || data?.status || data?.state || data?.draft_state || ''
  ).toLowerCase();

  const invoice =
    data?.invoice ||
    data?.current_invoice ||
    data?.document ||
    (data?.document_number || data?.invoice_number ? data : null);

  const isBlocked =
    !ok ||
    data?.blocked === true ||
    rawState.includes('block') ||
    rawState.includes('before_start') ||
    rawState.includes('not_started') ||
    rawState.includes('hold') ||
    rawState.includes('waiting') ||
    (!invoice && (data?.hold_reason || data?.reason));

  if (isBlocked) {
    const draft = data?.draft || data?.order || {};
    const blockState =
      data?.draft_state || draft?.state || data?.state || data?.code || rawState || 'blocked';

    let reason =
      data?.reason ||
      data?.hold_reason ||
      draft?.hold_reason ||
      data?.detail ||
      data?.message ||
      (typeof data?.error === 'string' ? data.error : null);

    if (!reason && data && typeof data === 'object') {
      const fields = Object.entries(data)
        .filter(([k]) => !['blocked', 'status', 'state', 'outcome', 'order', 'draft'].includes(k))
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join(' | ');
      if (fields) reason = fields;
    }

    return {
      outcome: 'BLOCKED',
      httpStatus: status,
      blockState,
      reason: reason || 'Order cannot be invoiced yet. Set parcel aside.',
      order: data?.order || null
    };
  }

  const alreadyIssued =
    data?.already_issued === true ||
    data?.is_existing === true ||
    data?.created === false ||
    rawState === 'already_issued' ||
    rawState === 'existing' ||
    (invoice?.prints && invoice.prints.length > 0);

  return {
    outcome: alreadyIssued ? 'ALREADY_ISSUED' : 'ISSUED_NOW',
    invoice,
    order: data?.order || null
  };
}

export async function logInvoicePrint(
  documentId,
  { reason = null, note = '', stationId = null, stationCode = '' } = {}
) {
  const payload = {};
  if (reason) {
    payload.reason = reason;
    payload.reason_code = reason;
    payload.reprint_reason = reason;
  }
  if (note) {
    payload.note = note;
    payload.reason_note = note;
  }
  if (stationId !== null && stationId !== undefined && stationId !== '') {
    payload.station_id = stationId;
  }
  if (stationCode) {
    payload.station_code = stationCode;
    payload.station = stationCode;
  }

  const res = await request(`/api/documents/${encodeURIComponent(documentId)}/prints`, {
    method: 'POST',
    body: payload
  });

  if (res.status === 409) {
    return {
      ...res,
      printOutcome: 'REFUSED_REPLACED_409',
      replacementNumber:
        res.data?.replacement_number ||
        res.data?.replaced_by_number ||
        res.data?.replaced_by?.document_number ||
        null,
      message: res.data?.detail || 'This invoice was replaced by a newer reissued invoice.'
    };
  }

  return {
    ...res,
    printOutcome: reason ? 'REPRINT' : 'ORIGINAL',
    message: res.data?.detail || (reason ? 'Reprint logged.' : 'Print logged.')
  };
}

export function reportScanGaveUp({
  tracking,
  stationId = null,
  stationCode = '',
  waitedSeconds = 60,
  note = ''
}) {
  const payload = {
    tracking: tracking.trim(),
    waited_seconds: waitedSeconds
  };
  if (stationId !== null && stationId !== undefined && stationId !== '') {
    payload.station_id = stationId;
  }
  if (stationCode) {
    payload.station_code = stationCode;
    payload.station = stationCode;
  }
  if (note) payload.note = note;

  return request('/api/scans/gave-up', {
    method: 'POST',
    body: payload
  });
}

export function fetchDocumentDetails(documentId) {
  return request(`/api/documents/${encodeURIComponent(documentId)}`);
}

export function searchDocuments(query = '') {
  const q = encodeURIComponent(query.trim());
  return request(`/api/documents?q=${q}`);
}

export function fetchOrderDraft(platform, storeId, orderId) {
  if (!platform || !storeId || !orderId) {
    return Promise.resolve({ ok: false, status: 400, data: null });
  }
  const p = encodeURIComponent(String(platform).toLowerCase().trim());
  const s = encodeURIComponent(String(storeId).trim());
  const o = encodeURIComponent(String(orderId).trim());
  return request(`/api/orders/${p}/${s}/${o}/draft`);
}

export function extractDocumentList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.documents)) return data.documents;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.orders)) return data.orders;
  if (data.header || data.document || data.id || data.document_number) {
    return [data];
  }
  return [];
}

function toMoneyNumber(val) {
  if (val === null || val === undefined || val === '') return NaN;
  const cleaned = String(val).replace(/[^0-9.-]+/g, '');
  return parseFloat(cleaned);
}

function formatMoney(num, fallback = '0.00') {
  if (!Number.isFinite(num)) return fallback;
  return num.toFixed(2);
}

export function normalizeOrderLine(line, idx = 0) {
  if (!line || typeof line !== 'object') {
    return {
      id: idx + 1,
      productName: String(line || `Item #${idx + 1}`),
      sku: '',
      qty: 1,
      unitPrice: '0.00',
      vatAmount: '0.00',
      lineTotal: '0.00'
    };
  }

  const qty = Number(line.quantity ?? line.qty ?? line.count ?? 1) || 1;
  const rawUnit =
    line.unit_price ??
    line.price ??
    line.sale_price ??
    line.original_price ??
    line.item_price ??
    null;
  const rawTotal =
    line.line_total ??
    line.total_amount ??
    line.total ??
    line.subtotal ??
    line.gross_amount ??
    line.net_amount ??
    line.amount ??
    null;

  let totalNum = toMoneyNumber(rawTotal);
  let unitNum = toMoneyNumber(rawUnit);

  if (!Number.isFinite(totalNum) && Number.isFinite(unitNum)) {
    totalNum = unitNum * qty;
  } else if (!Number.isFinite(unitNum) && Number.isFinite(totalNum)) {
    unitNum = qty > 0 ? totalNum / qty : totalNum;
  }

  const rawLineVat =
    line.vat_amount ?? line.tax_amount ?? line.vat ?? line.tax ?? null;
  let lineVatNum = toMoneyNumber(rawLineVat);
  if (!Number.isFinite(lineVatNum) && Number.isFinite(totalNum) && totalNum > 0) {
    lineVatNum = totalNum - totalNum / 1.12;
  }

  const productName =
    line.product_name ||
    line.item_name ||
    line.description ||
    line.name ||
    line.title ||
    line.sku_name ||
    line.model_name ||
    line.sku ||
    `Item #${idx + 1}`;

  const sku =
    line.sku ||
    line.seller_sku ||
    line.item_sku ||
    line.variation ||
    line.variant_name ||
    line.model_name ||
    '';

  const rawLineDiscount =
    line.discount_amount ??
    line.discount ??
    line.seller_discount ??
    line.platform_discount ??
    line.voucher_amount ??
    0;
  const lineDiscountNum = toMoneyNumber(rawLineDiscount);

  return {
    id: line.id || line.line_id || idx + 1,
    productName,
    sku: sku !== productName ? sku : '',
    qty,
    unitPrice: formatMoney(unitNum, rawUnit ? String(rawUnit) : '0.00'),
    discountAmount: formatMoney(lineDiscountNum, '0.00'),
    vatAmount: formatMoney(lineVatNum, '0.00'),
    lineTotal: formatMoney(totalNum, rawTotal ? String(rawTotal) : '0.00')
  };
}

export function normalizeDocumentRecord(raw) {
  if (!raw) return null;
  const doc = raw.header || raw.document || raw.invoice || raw;
  const order = raw.order || doc.order || raw.draft || {};
  const totals = raw.totals || doc.totals || order.totals || {};

  const rawPlatform = String(
    doc.platform ||
      doc.marketplace ||
      doc.channel ||
      order.platform ||
      order.marketplace ||
      order.channel ||
      raw.platform ||
      doc.store_platform ||
      doc.store_name ||
      order.store_name ||
      ''
  );

  let platform = 'Marketplace';
  const lowerPlat = rawPlatform.toLowerCase();
  if (lowerPlat.includes('tiktok') || lowerPlat.includes('tik tok')) {
    platform = 'TikTok';
  } else if (lowerPlat.includes('shopee')) {
    platform = 'Shopee';
  } else if (lowerPlat.includes('lazada')) {
    platform = 'Lazada';
  } else if (doc.platform || order.platform || raw.platform) {
    platform = doc.platform || order.platform || raw.platform;
  }

  const storeName =
    doc.store_name ||
    doc.store ||
    doc.shop_name ||
    order.store_name ||
    order.store ||
    order.shop_name ||
    raw.store_name ||
    doc.store_id ||
    order.store_id ||
    'Official Store';

  const rawLines = Array.isArray(raw.lines)
    ? raw.lines
    : Array.isArray(doc.lines)
      ? doc.lines
      : Array.isArray(raw.items)
        ? raw.items
        : Array.isArray(doc.items)
          ? doc.items
          : Array.isArray(doc.line_items)
            ? doc.line_items
            : Array.isArray(order.lines)
              ? order.lines
              : Array.isArray(order.items)
                ? order.items
                : Array.isArray(order.line_items)
                  ? order.line_items
                  : [];

  const lines = rawLines.map((ln, idx) => normalizeOrderLine(ln, idx));

  const prints = Array.isArray(raw.prints)
    ? raw.prints
    : Array.isArray(doc.prints)
      ? doc.prints
      : Array.isArray(doc.print_logs)
        ? doc.print_logs
        : Array.isArray(doc.print_history)
          ? doc.print_history
          : [];

  const creditNotes = Array.isArray(raw.credit_notes)
    ? raw.credit_notes
    : Array.isArray(doc.credit_notes)
      ? doc.credit_notes
      : Array.isArray(doc.creditNotes)
        ? doc.creditNotes
        : [];

  const rawTotal =
    doc.total_amount ??
    doc.grand_total ??
    doc.gross_amount ??
    doc.amount ??
    totals.total_amount ??
    totals.grand_total ??
    totals.gross_amount ??
    order.total_amount ??
    order.grand_total ??
    raw.total_amount ??
    null;

  let totalNum = toMoneyNumber(rawTotal);
  if (!Number.isFinite(totalNum) && lines.length > 0) {
    totalNum = lines.reduce((sum, l) => sum + (toMoneyNumber(l.lineTotal) || 0), 0);
  }

  const rawVatable =
    doc.vatable_sales ??
    doc.net_vat_sales ??
    doc.vatable_amount ??
    doc.net_amount ??
    totals.vatable_sales ??
    totals.net_amount ??
    order.vatable_sales ??
    order.net_amount ??
    raw.vatable_sales ??
    null;

  const rawVat =
    doc.vat_amount ??
    doc.tax_amount ??
    doc.vat ??
    doc.output_vat ??
    totals.vat_amount ??
    totals.tax_amount ??
    totals.vat ??
    order.vat_amount ??
    order.tax_amount ??
    raw.vat_amount ??
    null;

  let vatableNum = toMoneyNumber(rawVatable);
  let vatNum = toMoneyNumber(rawVat);

  if (Number.isFinite(totalNum) && totalNum > 0) {
    if (!Number.isFinite(vatableNum) && !Number.isFinite(vatNum)) {
      vatableNum = totalNum / 1.12;
      vatNum = totalNum - vatableNum;
    } else if (Number.isFinite(vatableNum) && !Number.isFinite(vatNum)) {
      vatNum = Math.max(0, totalNum - vatableNum);
    } else if (!Number.isFinite(vatableNum) && Number.isFinite(vatNum)) {
      vatableNum = Math.max(0, totalNum - vatNum);
    }
  }

  const vatExemptSales = formatMoney(
    toMoneyNumber(
      doc.vat_exempt_sales ??
        doc.exempt_sales ??
        totals.vat_exempt_sales ??
        order.vat_exempt_sales ??
        0
    ),
    '0.00'
  );

  const zeroRatedSales = formatMoney(
    toMoneyNumber(
      doc.zero_rated_sales ??
        totals.zero_rated_sales ??
        order.zero_rated_sales ??
        0
    ),
    '0.00'
  );

  const rawDiscount =
    doc.discount_amount ??
    doc.total_discount ??
    doc.discount ??
    doc.seller_discount ??
    doc.platform_discount ??
    doc.voucher_amount ??
    totals.discount_amount ??
    totals.total_discount ??
    totals.discount ??
    order.discount_amount ??
    order.total_discount ??
    order.discount ??
    order.seller_discount ??
    order.voucher_amount ??
    raw.discount_amount ??
    null;

  let discountNum = toMoneyNumber(rawDiscount);
  if (!Number.isFinite(discountNum)) {
    const linesDiscountSum = lines.reduce(
      (sum, l) => sum + (toMoneyNumber(l.discountAmount) || 0),
      0
    );
    discountNum = linesDiscountSum > 0 ? linesDiscountSum : 0;
  }

  const discountAmount = formatMoney(discountNum, '0.00');

  const productSummary =
    lines.length > 0
      ? lines.map((l) => `${l.productName}${l.qty > 1 ? ` (x${l.qty})` : ''}`).join(', ')
      : doc.product_name ||
        doc.item_summary ||
        order.product_name ||
        order.item_summary ||
        order.title ||
        '—';

  return {
    id:
      doc.id ||
      doc.document_id ||
      doc.invoice_id ||
      raw.id ||
      raw.document_id ||
      order.id ||
      null,
    documentNumber:
      doc.document_number ||
      doc.invoice_number ||
      doc.number ||
      raw.document_number ||
      (doc.id ? `DOC-${doc.id}` : '—'),
    orderId:
      doc.order_id ||
      doc.platform_order_id ||
      doc.external_order_id ||
      order.order_id ||
      order.platform_order_id ||
      order.external_order_id ||
      raw.order_id ||
      order.id ||
      '—',
    tracking:
      doc.tracking ||
      doc.tracking_number ||
      doc.waybill ||
      order.tracking ||
      order.tracking_number ||
      order.waybill ||
      raw.tracking ||
      '—',
    platform,
    storeId: doc.store_id || order.store_id || raw.store_id || null,
    storeName,
    buyerName:
      doc.buyer_name ||
      doc.customer_name ||
      doc.recipient_name ||
      order.buyer_name ||
      order.customer_name ||
      order.recipient_name ||
      raw.buyer_name ||
      'Marketplace Buyer',
    buyerTin: doc.buyer_tin || doc.tin || order.buyer_tin || '—',
    status: String(
      doc.status ||
        doc.state ||
        doc.document_status ||
        order.status ||
        raw.status ||
        'ISSUED'
    ).toUpperCase(),
    totalAmount: formatMoney(totalNum, rawTotal ? String(rawTotal) : '0.00'),
    discountAmount,
    vatableSales: formatMoney(vatableNum, '0.00'),
    vatAmount: formatMoney(vatNum, '0.00'),
    vatExemptSales,
    zeroRatedSales,
    productSummary,
    issuedAt:
      doc.issued_at ||
      doc.created_at ||
      doc.date_issued ||
      raw.issued_at ||
      order.created_at ||
      '—',
    replaces:
      raw.replaces ||
      doc.replaces ||
      doc.replaces_document ||
      doc.replaces_number ||
      null,
    replacedBy:
      raw.replaced_by ||
      doc.replaced_by ||
      doc.replaced_by_document ||
      doc.replaced_by_number ||
      null,
    lines,
    prints,
    creditNotes,
    raw: doc
  };
}

export function fetchPrepackOrders(problemsOnly = false) {
  const qs = problemsOnly ? '?problems_only=1' : '';
  return request(`/api/prepack${qs}`);
}

export function fetchPackingStations() {
  return request('/api/stations');
}

export function fetchUnresolvedScans() {
  return request('/api/scans/unresolved');
}

export function resolveUnresolvedScan(scanId, note) {
  return request(`/api/scans/${encodeURIComponent(scanId)}/resolve`, {
    method: 'POST',
    body: {
      note: note.trim(),
      resolution_note: note.trim()
    }
  });
}

const PRINTED_INVOICES_STORAGE_KEY = 'bir_printed_einvoices';

export function getPrintedInvoiceRecords() {
  try {
    const raw = localStorage.getItem(PRINTED_INVOICES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePrintedInvoiceRecord(record, meta = {}) {
  if (!record) return [];
  const normalized =
    record.documentNumber && record.lines !== undefined
      ? record
      : normalizeDocumentRecord(record);
  if (!normalized) return getPrintedInvoiceRecords();

  const nowStr = new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const existingList = getPrintedInvoiceRecords();
  const matchIdx = existingList.findIndex(
    (item) =>
      (normalized.id && item.id && String(item.id) === String(normalized.id)) ||
      (normalized.documentNumber &&
        normalized.documentNumber !== '—' &&
        item.documentNumber === normalized.documentNumber)
  );

  const prev = matchIdx >= 0 ? existingList[matchIdx] : null;
  const prevPrintCount = Number(prev?.printCount || prev?.prints?.length || 0);
  const apiPrintCount = Array.isArray(normalized.prints) ? normalized.prints.length : 0;
  const nextPrintCount = Math.max(prevPrintCount + 1, apiPrintCount, 1);

  const mergedEntry = {
    ...(prev || {}),
    ...normalized,
    tracking:
      meta.tracking && meta.tracking !== '—'
        ? meta.tracking
        : normalized.tracking !== '—'
          ? normalized.tracking
          : prev?.tracking || '—',
    lastPrintedAt: meta.printedAt || nowStr,
    lastStationCode: meta.stationCode || prev?.lastStationCode || '—',
    isReprint: Boolean(meta.isReprint || nextPrintCount > 1),
    lastReprintReason: meta.reprintReason || prev?.lastReprintReason || null,
    printCount: nextPrintCount
  };

  const nextList = [
    mergedEntry,
    ...existingList.filter((_, idx) => idx !== matchIdx)
  ].slice(0, 500);

  try {
    localStorage.setItem(PRINTED_INVOICES_STORAGE_KEY, JSON.stringify(nextList));
  } catch {
    // ignore storage quota errors
  }

  return nextList;
}

function wrapTextLines(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ['—'];
}

export function downloadWaybillSoftCopy(doc) {
  if (!doc) return;

  const scale = 2;
  const width = 420;
  const linesList =
    Array.isArray(doc.lines) && doc.lines.length > 0
      ? doc.lines
      : [
          {
            id: 1,
            productName:
              doc.productSummary && doc.productSummary !== '—'
                ? doc.productSummary
                : `${doc.platform || 'Marketplace'} Order #${doc.orderId || '—'}`,
            sku: '',
            qty: 1,
            unitPrice: doc.totalAmount || '0.00',
            lineTotal: doc.totalAmount || '0.00'
          }
        ];

  const baseHeight = 460 + linesList.length * 42;
  const height = Math.max(600, baseHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  let y = 10;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(10, y, width - 20, 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(String(doc.platform || 'MARKETPLACE').toUpperCase(), 20, y + 21);

  ctx.font = 'bold 12px sans-serif';
  const storeText = String(doc.storeName || 'Official Store');
  const storeWidth = ctx.measureText(storeText).width;
  ctx.fillText(storeText, (width - storeWidth) / 2, y + 21);

  const copyTag = doc.isReprint ? 'REPRINT' : 'ORIGINAL';
  ctx.font = 'bold 10px monospace';
  const copyWidth = ctx.measureText(copyTag).width;
  ctx.fillText(copyTag, width - 20 - copyWidth, y + 21);

  y += 34;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(11, y, width - 22, 54);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(10, y + 54);
  ctx.lineTo(width - 10, y + 54);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px sans-serif';
  const sellerName = 'IPOLYMER SOLUTIONS CORP.';
  ctx.fillText(sellerName, (width - ctx.measureText(sellerName).width) / 2, y + 20);

  ctx.fillStyle = '#334155';
  ctx.font = '10px sans-serif';
  const addr1 = '346 General Luis ST., Bagbaguin, Barangay 165, District 1,';
  const addr2 = '1400 City of Caloocan , NCR, Third District, Philippines';
  ctx.fillText(addr1, (width - ctx.measureText(addr1).width) / 2, y + 35);
  ctx.fillText(addr2, (width - ctx.measureText(addr2).width) / 2, y + 48);

  y += 54;

  const colMid = width / 2;
  const rowH = 42;

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(colMid, y);
  ctx.lineTo(colMid, y + rowH * 2);
  ctx.moveTo(10, y + rowH);
  ctx.lineTo(width - 10, y + rowH);
  ctx.moveTo(10, y + rowH * 2);
  ctx.lineTo(width - 10, y + rowH * 2);
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('ORDER ID', 18, y + 14);
  ctx.fillText('INVOICE NO.', colMid + 10, y + 14);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(String(doc.orderId || '—').slice(0, 24), 18, y + 31);
  ctx.fillText(String(doc.documentNumber || 'PENDING').slice(0, 24), colMid + 10, y + 31);

  y += rowH;

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('BUYER / RECIPIENT', 18, y + 14);
  ctx.fillText('ORDER STATUS / TIN', colMid + 10, y + 14);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(String(doc.buyerName || 'Marketplace Buyer').slice(0, 24), 18, y + 31);
  const statusTin = `${doc.status || 'PAID'}${doc.buyerTin && doc.buyerTin !== '—' ? ` · ${doc.buyerTin}` : ''}`;
  ctx.fillText(statusTin.slice(0, 24), colMid + 10, y + 31);

  y += rowH;

  ctx.beginPath();
  ctx.moveTo(10, y + 36);
  ctx.lineTo(width - 10, y + 36);
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('DATE & TIME ISSUED / WAYBILL', 18, y + 13);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 10px monospace';
  const issuedLine = `${doc.issuedAt && doc.issuedAt !== '—' ? doc.issuedAt : doc.lastPrintedAt || '—'}   |   WB: ${doc.tracking || '—'}`;
  ctx.fillText(issuedLine.slice(0, 52), 18, y + 28);

  y += 36;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText(`PRODUCT ORDERED (${linesList.length})`, 18, y + 18);

  y += 26;

  ctx.strokeStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(18, y + 16);
  ctx.lineTo(width - 18, y + 16);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('ITEM / SKU', 18, y + 11);
  ctx.fillText('QTY', 250, y + 11);
  ctx.fillText('PRICE', 295, y + 11);
  ctx.fillText('TOTAL', 355, y + 11);

  y += 22;

  for (const ln of linesList) {
    const itemName =
      ln.productName ||
      ln.description ||
      ln.item_name ||
      ln.product_name ||
      ln.sku ||
      'Product Item';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px sans-serif';
    const wrapped = wrapTextLines(ctx, itemName, 220).slice(0, 2);
    wrapped.forEach((lineStr, idx) => {
      ctx.fillText(lineStr, 18, y + 10 + idx * 12);
    });

    const qtyStr = String(ln.qty ?? ln.quantity ?? 1);
    const priceStr = `₱${ln.unitPrice ?? ln.unit_price ?? '0.00'}`;
    const totalStr = `₱${ln.lineTotal ?? ln.line_total ?? '0.00'}`;

    ctx.font = 'bold 10px monospace';
    ctx.fillText(qtyStr, 255, y + 10);
    ctx.font = '10px monospace';
    ctx.fillText(priceStr, 290, y + 10);
    ctx.font = 'bold 10px monospace';
    ctx.fillText(totalStr, 350, y + 10);

    y += wrapped.length * 12 + 12;
  }

  const taxBoxHeight = 104;
  const totalBarHeight = 40;
  const taxTop = Math.max(y + 10, height - 10 - totalBarHeight - taxBoxHeight);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(11, taxTop, width - 22, taxBoxHeight);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(10, taxTop);
  ctx.lineTo(width - 10, taxTop);
  ctx.stroke();

  const taxRows = [
    ['Discount / Voucher:', `-₱${doc.discountAmount || '0.00'}`],
    ['VATable Sales (Net):', `₱${doc.vatableSales || '0.00'}`],
    ['VAT Amount (12%):', `₱${doc.vatAmount || '0.00'}`],
    ['VAT-Exempt Sales:', `₱${doc.vatExemptSales || '0.00'}`],
    ['Zero-Rated Sales:', `₱${doc.zeroRatedSales || '0.00'}`]
  ];

  let ty = taxTop + 18;
  for (const [label, val] of taxRows) {
    ctx.fillStyle = '#334155';
    ctx.font = '10px sans-serif';
    ctx.fillText(label, 20, ty);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px monospace';
    const valW = ctx.measureText(val).width;
    ctx.fillText(val, width - 20 - valW, ty);
    ty += 18;
  }

  const totalTop = taxTop + taxBoxHeight;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(10, totalTop, width - 20, height - 10 - totalTop);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('TOTAL AMOUNT (PHP)', 20, totalTop + 25);

  const grandStr = `₱${doc.totalAmount || '0.00'}`;
  ctx.font = 'bold 15px monospace';
  const grandW = ctx.measureText(grandStr).width;
  ctx.fillText(grandStr, width - 20 - grandW, totalTop + 25);

  const safeName = String(doc.documentNumber || doc.orderId || 'e-invoice')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${safeName}-waybill.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

