/* Data and styles for the Letter-size Odoo sales invoice (components/OdooInvoiceSheet.jsx). */

const n = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function money(value) {
  if (value === null || value === undefined || value === '') return '';
  return n(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function longDate(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function termsText(invoiceDate, dueDate) {
  if (!invoiceDate || !dueDate) return '';
  const days = Math.round((new Date(`${dueDate}T00:00:00`) - new Date(`${invoiceDate}T00:00:00`)) / 86400000);
  return days > 0 ? `${days} DAYS` : '';
}

const hasAddress = (p) => Boolean(p && (p.street || p.street2 || p.city || p.zip));

/** The address to print: the invoice's Invoice Address contact when it has one, else the buyer company's. */
export function invoiceAddressOf(detail) {
  return hasAddress(detail?.invoice_address) ? detail.invoice_address : detail?.buyer;
}

export function addressOf(buyer) {
  if (!buyer) return '';
  const parts = [buyer.street, buyer.street2, buyer.city, buyer.state_name, buyer.zip];
  if (buyer.country_code && buyer.country_code !== 'PH' && buyer.country_name) parts.push(buyer.country_name);
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Everything the sheet prints, worked out once from the detail API answer. */
export function buildOdooInvoice(detail) {
  const move = detail?.move || {};
  const taxes = Object.fromEntries((detail?.taxes || []).map((t) => [t.odoo_id, t]));
  let vatable = 0;
  let zeroRated = 0;
  let exempt = 0;
  let withholding = 0;

  const items = [];
  (detail?.lines || []).forEach((line) => {
    const kind = line.display_type || 'product';
    const description = String(line.name || line.product_name || '').split('\n')[0];
    if (kind !== 'product') {
      if (description) items.push({ key: line.odoo_id, text: description, section: kind === 'line_section' });
      return;
    }
    const lineTaxes = (line.tax_ids || []).map((id) => taxes[id]).filter(Boolean);
    const percent = (t) => (t.amount_type && t.amount_type !== 'percent' ? 0 : n(t.amount));
    const vatRate = lineTaxes.filter((t) => percent(t) > 0).reduce((s, t) => s + percent(t), 0);
    const whtRate = lineTaxes.filter((t) => percent(t) < 0).reduce((s, t) => s - percent(t), 0);
    const base = n(line.price_subtotal);
    if (vatRate > 0) vatable += base;
    else if (lineTaxes.some((t) => /zero/i.test(`${t.name || ''} ${t.tax_group_name || ''}`))) zeroRated += base;
    else exempt += base;
    withholding += (base * whtRate) / 100;
    // amount = VAT-inclusive line value (Odoo's price_total, unless a withholding tax is on the line)
    const amount = whtRate > 0 ? round2(base * (1 + vatRate / 100)) : n(line.price_total);
    const quantity = n(line.quantity);
    items.push({
      key: line.odoo_id, description, quantity,
      unitPrice: quantity ? round2(amount / quantity) : null, amount
    });
  });

  withholding = round2(withholding);
  const untaxed = n(move.amount_untaxed);
  const vat = round2(n(move.amount_tax) + withholding);
  return {
    isRefund: move.move_type === 'out_refund',
    state: move.state,
    number: move.name || `#${move.odoo_id}`,
    date: longDate(move.invoice_date),
    poNo: move.ref || '',
    refNo: move.invoice_origin || '',
    terms: termsText(move.invoice_date, move.invoice_date_due),
    currency: move.currency_code && move.currency_code !== 'PHP' ? move.currency_code : '',
    buyer: {
      name: detail?.buyer?.name || move.partner_name || '',
      tin: detail?.buyer?.vat || '',
      address: addressOf(invoiceAddressOf(detail))
    },
    items,
    totals: {
      totalSales: round2(untaxed + vat), vat, netOfVat: untaxed, withholding,
      amountDue: n(move.amount_total), vatable: round2(vatable), zeroRated: round2(zeroRated), exempt: round2(exempt)
    }
  };
}

/* All styles of the sheet, scoped to .oi-*. Used inside the app (preview) and in the print page. */
export const ODOO_INVOICE_SHEET_CSS = `
.oi-sheet { position: relative; width: 7.7in; margin: 0 auto; color: #111; background: #fff;
  font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.25; box-sizing: border-box; }
.oi-sheet *, .oi-sheet *::before, .oi-sheet *::after { box-sizing: border-box; }
.oi-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 0.2in; margin-bottom: 0.12in; }
.oi-seller { font-size: 10pt; }
.oi-seller-name { font-family: "Times New Roman", Times, serif; font-weight: 700; font-size: 22pt; letter-spacing: 0.01em;
  line-height: 1.05; margin-bottom: 2pt; white-space: nowrap; }
.oi-title-box { text-align: right; white-space: nowrap; padding-bottom: 2pt; }
.oi-title-small { font-weight: 700; font-size: 11pt; }
.oi-title-big { font-weight: 800; font-size: 15pt; text-decoration: underline; }
.oi-number { margin-top: 8pt; font-size: 15pt; font-weight: 700; }
.oi-number-sign { font-size: 13pt; margin-right: 4pt; }
.oi-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
.oi-grid td, .oi-grid th { border: 0.75pt solid #222; padding: 2.5pt 5pt; vertical-align: top; }
.oi-label { font-size: 8pt; font-weight: 700; text-transform: none; }
.oi-label-row { padding-top: 1.5pt; padding-bottom: 1.5pt; }
.oi-value { font-size: 10.5pt; font-weight: 700; }
.oi-buyer { padding: 3pt 0 0 10pt; font-size: 11pt; }
.oi-party td div.oi-value { padding-left: 10pt; }
.oi-items { margin-top: 0.08in; }
.oi-items th { font-size: 8.5pt; font-weight: 700; text-align: center; padding: 4pt 5pt; }
.oi-items td { height: 0.255in; vertical-align: middle; }
.oi-items .oi-desc { font-weight: 700; padding-left: 10pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.oi-items .oi-note { font-style: italic; padding-left: 10pt; }
.oi-items .oi-section { font-weight: 700; text-decoration: underline; padding-left: 10pt; }
.oi-items .oi-nothing { text-align: center; font-weight: 700; letter-spacing: 0.02em; }
.oi-num { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.oi-bottom { display: flex; justify-content: space-between; gap: 0.18in; margin-top: 0.12in; align-items: flex-start; }
.oi-bottom-left { width: 49%; display: flex; flex-direction: column; gap: 0.12in; }
.oi-bottom-right { width: 47%; }
.oi-small td { font-size: 9pt; height: 0.26in; vertical-align: middle; }
.oi-small .oi-num { font-size: 10.5pt; }
.oi-due td { font-weight: 800; font-size: 9.5pt; }
.oi-due .oi-num { font-size: 11pt; }
.oi-received { margin-top: 8pt; font-size: 9pt; }
.oi-checkbox { display: inline-block; width: 10pt; height: 10pt; border: 0.75pt solid #222; vertical-align: -1.5pt; margin-right: 4pt; }
.oi-sign-line { border-bottom: 0.75pt solid #222; margin-top: 0.3in; }
.oi-footer { font-size: 7.5pt; font-weight: 700; line-height: 1.3; }
.oi-stamp { position: absolute; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-24deg);
  border: 3pt solid rgba(200, 0, 0, 0.55); color: rgba(200, 0, 0, 0.55); font-size: 24pt; font-weight: 900;
  padding: 6pt 14pt; white-space: nowrap; pointer-events: none; z-index: 2; }
`;
